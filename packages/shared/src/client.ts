import type {
  AdminStats,
  AffiliateSummary,
  AuditEntry,
  AuthResponse,
  Card,
  Commission,
  KycProfile,
  LenderDocument,
  LenderFunding,
  LenderOrg,
  LenderStats,
  Loan,
  LoanOffer,
  Me,
  Paginated,
  Payout,
  PlatformSettings,
  QuoteResponse,
  Referral,
  Tokens,
  Transaction,
  User,
  XtraBalance,
  OfferCriteria,
} from './types';
import type { EmploymentStatus, TxChannel, DocumentType, Role } from './enums';

/** Where the client keeps tokens: localStorage on web, SecureStore on mobile. */
export interface TokenStore {
  get(): Promise<Tokens | null> | Tokens | null;
  set(tokens: Tokens | null): Promise<void> | void;
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export interface ClientOptions {
  baseUrl: string;
  tokens: TokenStore;
  onUnauthorized?: () => void;
  fetchImpl?: typeof fetch;
}

type Query = Record<string, string | number | boolean | undefined | null>;

export interface RegisterInput {
  email: string;
  phone: string;
  password: string;
  firstName: string;
  lastName: string;
  accountType: 'CONSUMER' | 'LENDER' | 'AFFILIATE';
  referralCode?: string;
  lenderName?: string;
}

export interface KycInput {
  idNumber: string;
  province: string;
  employmentStatus: EmploymentStatus;
  employerName?: string;
  monthlyIncomeCents: number;
  monthlyExpensesCents: number;
  consentCreditCheck: boolean;
}

export interface PurchaseInput {
  amountCents: number;
  merchantName: string;
  merchantCategory?: string;
  channel: TxChannel;
  idempotencyKey: string;
}

export type OfferInput = OfferCriteria & {
  name: string;
  description?: string;
  active?: boolean;
  monthlyInterestRateBps: number;
  termMonths: number;
  initiationFeeCents: number;
  monthlyServiceFeeCents: number;
  minAmountCents: number;
  maxAmountPerUserCents: number;
};

export interface LenderOrgInput {
  name: string;
  tradingName?: string;
  registrationNumber?: string;
  ncrNumber?: string;
  contactEmail: string;
  contactPhone: string;
}

export class XtraClient {
  private refreshing: Promise<boolean> | null = null;
  private fetchImpl: typeof fetch;

  constructor(private opts: ClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? ((...args) => fetch(...args));
  }

  // ---------- core ----------
  private url(path: string, query?: Query) {
    const qs = query
      ? Object.entries(query)
          .filter(([, v]) => v !== undefined && v !== null && v !== '')
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
          .join('&')
      : '';
    return `${this.opts.baseUrl.replace(/\/$/, '')}${path}${qs ? `?${qs}` : ''}`;
  }

  async request<T>(method: string, path: string, body?: unknown, query?: Query, retry = true): Promise<T> {
    const tokens = await this.opts.tokens.get();
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    const headers: Record<string, string> = {};
    if (!isForm && body !== undefined) headers['Content-Type'] = 'application/json';
    if (tokens?.accessToken) headers.Authorization = `Bearer ${tokens.accessToken}`;

    const res = await this.fetchImpl(this.url(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });

    if (res.status === 401 && retry && tokens?.refreshToken && !path.startsWith('/auth/')) {
      if (await this.tryRefresh(tokens.refreshToken)) return this.request<T>(method, path, body, query, false);
      await this.opts.tokens.set(null);
      this.opts.onUnauthorized?.();
    }

    const text = await res.text();
    const data = text ? safeJson(text) : undefined;
    if (!res.ok) {
      const msg = (data as any)?.message;
      throw new ApiError(res.status, Array.isArray(msg) ? msg.join(', ') : msg || res.statusText || 'Request failed', data);
    }
    return data as T;
  }

  private tryRefresh(refreshToken: string): Promise<boolean> {
    if (!this.refreshing) {
      this.refreshing = this.request<Tokens>('POST', '/auth/refresh', { refreshToken }, undefined, false)
        .then(async (t) => {
          await this.opts.tokens.set(t);
          return true;
        })
        .catch(() => false)
        .finally(() => {
          this.refreshing = null;
        });
    }
    return this.refreshing;
  }

  // ---------- auth ----------
  auth = {
    register: async (input: RegisterInput) => {
      const r = await this.request<AuthResponse>('POST', '/auth/register', input);
      await this.opts.tokens.set({ accessToken: r.accessToken, refreshToken: r.refreshToken });
      return r;
    },
    login: async (identifier: string, password: string) => {
      const r = await this.request<AuthResponse>('POST', '/auth/login', { identifier, password });
      await this.opts.tokens.set({ accessToken: r.accessToken, refreshToken: r.refreshToken });
      return r;
    },
    logout: async () => {
      const t = await this.opts.tokens.get();
      if (t?.refreshToken) await this.request('POST', '/auth/logout', { refreshToken: t.refreshToken }).catch(() => undefined);
      await this.opts.tokens.set(null);
    },
    me: () => this.request<Me>('GET', '/me'),
  };

  // ---------- consumer ----------
  consumer = {
    submitKyc: (input: KycInput) => this.request<KycProfile>('PUT', '/me/kyc', input),
    balance: () => this.request<XtraBalance>('GET', '/me/balance'),
    quote: (offerId: string, amountCents: number) => this.request<QuoteResponse>('POST', '/me/quote', { offerId, amountCents }),
    cards: () => this.request<Card[]>('GET', '/me/cards'),
    issueCard: () => this.request<Card>('POST', '/me/cards'),
    freezeCard: (id: string, frozen: boolean) => this.request<Card>('POST', `/me/cards/${id}/${frozen ? 'freeze' : 'unfreeze'}`),
    purchase: (cardId: string, input: PurchaseInput) => this.request<Transaction>('POST', `/me/cards/${cardId}/purchase`, input),
    transactions: (page = 1) => this.request<Paginated<Transaction>>('GET', '/me/transactions', undefined, { page }),
    loans: () => this.request<Loan[]>('GET', '/me/loans'),
    loan: (id: string) => this.request<Loan>('GET', `/me/loans/${id}`),
    repay: (id: string, amountCents: number) => this.request<Loan>('POST', `/me/loans/${id}/repay`, { amountCents }),
    topUp: (amountCents: number) => this.request<{ walletBalanceCents: number }>('POST', '/me/wallet/topup', { amountCents }),
  };

  // ---------- lender (Credit Mall) ----------
  lender = {
    org: () => this.request<LenderOrg | null>('GET', '/lender/org'),
    saveOrg: (input: LenderOrgInput) => this.request<LenderOrg>('PUT', '/lender/org', input),
    uploadDocument: (type: DocumentType, file: Blob | { uri: string; name: string; type: string }, fileName?: string) => {
      const fd = new FormData();
      fd.append('type', type);
      fd.append('file', file as any, fileName ?? (file as any).name ?? 'document');
      return this.request<LenderDocument>('POST', '/lender/documents', fd);
    },
    submitAccreditation: (assisted: boolean) => this.request<LenderOrg>('POST', '/lender/accreditation/submit', { assisted }),
    payAccreditationFee: () => this.request<LenderOrg>('POST', '/lender/accreditation/pay-fee'),
    stats: () => this.request<LenderStats>('GET', '/lender/stats'),
    funding: () => this.request<LenderFunding[]>('GET', '/lender/funding'),
    requestFunding: (type: 'LOAD' | 'WITHDRAWAL', amountCents: number) =>
      this.request<LenderFunding>('POST', '/lender/funding', { type, amountCents }),
    offers: () => this.request<LoanOffer[]>('GET', '/lender/offers'),
    createOffer: (input: OfferInput) => this.request<LoanOffer>('POST', '/lender/offers', input),
    updateOffer: (id: string, input: Partial<OfferInput>) => this.request<LoanOffer>('PUT', `/lender/offers/${id}`, input),
    previewReach: (criteria: OfferCriteria) => this.request<{ eligibleConsumers: number; totalConsumers: number }>('POST', '/lender/offers/preview-reach', criteria),
    loans: (page = 1, status?: string) => this.request<Paginated<Loan>>('GET', '/lender/loans', undefined, { page, status }),
  };

  // ---------- affiliate ----------
  affiliate = {
    join: () => this.request<AffiliateSummary>('POST', '/affiliate/join'),
    summary: () => this.request<AffiliateSummary>('GET', '/affiliate/summary'),
    referrals: () => this.request<Referral[]>('GET', '/affiliate/referrals'),
    commissions: () => this.request<Commission[]>('GET', '/affiliate/commissions'),
    payouts: () => this.request<Payout[]>('GET', '/affiliate/payouts'),
    requestPayout: (amountCents: number) => this.request<Payout>('POST', '/affiliate/payouts', { amountCents }),
    saveBank: (bankName: string, bankAccountNumber: string) =>
      this.request<AffiliateSummary>('PUT', '/affiliate/bank', { bankName, bankAccountNumber }),
  };

  // ---------- admin / back office ----------
  admin = {
    stats: () => this.request<AdminStats>('GET', '/admin/stats'),
    users: (q: Query = {}) => this.request<Paginated<User & { kycStatus: string }>>('GET', '/admin/users', undefined, q),
    user: (id: string) =>
      this.request<Me & { loans: Loan[]; transactions: Transaction[]; cards: Card[] }>('GET', `/admin/users/${id}`),
    setUserStatus: (id: string, status: 'ACTIVE' | 'SUSPENDED') => this.request<User>('POST', `/admin/users/${id}/status`, { status }),
    setUserRoles: (id: string, roles: Role[]) => this.request<User>('POST', `/admin/users/${id}/roles`, { roles }),
    kycQueue: (status = 'PENDING') =>
      this.request<(KycProfile & { userId: string; user: Pick<User, 'id' | 'firstName' | 'lastName' | 'email'> })[]>('GET', '/admin/kyc', undefined, { status }),
    kycDecision: (userId: string, approve: boolean, reason?: string) =>
      this.request<KycProfile>('POST', `/admin/kyc/${userId}/decision`, { approve, reason }),
    lenders: (status?: string) => this.request<(LenderOrg & { owner: Pick<User, 'id' | 'email' | 'firstName' | 'lastName'> })[]>('GET', '/admin/lenders', undefined, { status }),
    lender: (id: string) => this.request<LenderOrg & { stats: LenderStats; offers: LoanOffer[]; funding: LenderFunding[] }>('GET', `/admin/lenders/${id}`),
    reviewLender: (id: string, status: string, notes?: string) => this.request<LenderOrg>('POST', `/admin/lenders/${id}/review`, { status, notes }),
    reviewDocument: (lenderId: string, docId: string, status: 'ACCEPTED' | 'REJECTED') =>
      this.request<LenderDocument>('POST', `/admin/lenders/${lenderId}/documents/${docId}`, { status }),
    funding: (status?: string) => this.request<LenderFunding[]>('GET', '/admin/funding', undefined, { status }),
    fundingDecision: (id: string, approve: boolean) => this.request<LenderFunding>('POST', `/admin/funding/${id}/decision`, { approve }),
    offers: () => this.request<LoanOffer[]>('GET', '/admin/offers'),
    setOfferActive: (id: string, active: boolean) => this.request<LoanOffer>('POST', `/admin/offers/${id}/active`, { active }),
    loans: (q: Query = {}) => this.request<Paginated<Loan>>('GET', '/admin/loans', undefined, q),
    transactions: (q: Query = {}) => this.request<Paginated<Transaction>>('GET', '/admin/transactions', undefined, q),
    commissions: (status?: string) => this.request<Commission[]>('GET', '/admin/commissions', undefined, { status }),
    commissionDecision: (id: string, approve: boolean) => this.request<Commission>('POST', `/admin/commissions/${id}/decision`, { approve }),
    payouts: (status?: string) => this.request<Payout[]>('GET', '/admin/payouts', undefined, { status }),
    payoutDecision: (id: string, approve: boolean, reference?: string) =>
      this.request<Payout>('POST', `/admin/payouts/${id}/decision`, { approve, reference }),
    settings: () => this.request<PlatformSettings>('GET', '/admin/settings'),
    saveSettings: (s: Partial<PlatformSettings>) => this.request<PlatformSettings>('PUT', '/admin/settings', s),
    audit: (page = 1) => this.request<Paginated<AuditEntry>>('GET', '/admin/audit', undefined, { page }),
    runArrearsJob: () => this.request<{ overdueInstallments: number; loansInArrears: number }>('POST', '/admin/jobs/arrears'),
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}
