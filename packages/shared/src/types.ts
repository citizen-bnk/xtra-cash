import type {
  AccreditationStatus,
  CardStatus,
  CommissionStatus,
  CommissionType,
  DocumentType,
  EmploymentStatus,
  FundingStatus,
  FundingType,
  InstallmentStatus,
  KycStatus,
  LoanStatus,
  PayoutStatus,
  Role,
  TxChannel,
  TxStatus,
} from './enums';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends Tokens {
  user: User;
}

/** A one-click demo account shown on the sign-in pages when demo mode is on. */
export interface DemoPersona {
  key: string;
  /** Which site signs in with it: the shopper/lender/affiliate web app or the back office. */
  app: 'web' | 'admin';
  group: string;
  title: string;
  description: string;
}

export interface User {
  profileComplete?: boolean;
  id: string;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  roles: Role[];
  status: 'ACTIVE' | 'SUSPENDED';
  referralCode: string;
  createdAt: string;
}

export interface KycProfile {
  idNumber: string;
  dateOfBirth: string;
  province: string;
  employmentStatus: EmploymentStatus;
  employerName: string | null;
  monthlyIncomeCents: number;
  monthlyExpensesCents: number;
  creditScore: number | null;
  status: KycStatus;
  rejectionReason: string | null;
  verifiedAt: string | null;
}

export interface Me extends User {
  kyc: KycProfile | null;
  walletBalanceCents: number;
  lender: LenderOrg | null;
  affiliate: AffiliateSummary | null;
}

export interface OfferCriteria {
  minMonthlyIncomeCents: number;
  minCreditScore: number;
  minAge: number;
  maxAge: number;
  employmentStatuses: EmploymentStatus[];
  provinces: string[];
}

export interface LoanOffer extends OfferCriteria {
  productType?: 'BNPL' | 'PERSONAL';
  id: string;
  lenderId: string;
  name: string;
  description: string | null;
  active: boolean;
  monthlyInterestRateBps: number;
  termMonths: number;
  initiationFeeCents: number;
  monthlyServiceFeeCents: number;
  minAmountCents: number;
  maxAmountPerUserCents: number;
  createdAt: string;
  lender?: { id: string; name: string };
}

export interface PersonalLoanInput {
  amountCents: number;
  termMonths: number;
  purpose: string;
  monthlyIncomeCents: number;
  monthlyExpensesCents: number;
  consent: boolean;
  idempotencyKey: string;
  offerId?: string;
}

export interface PersonalLoanMatch {
  offerId: string; lenderName: string; offerName: string; termMonths: number;
  monthlyInstallmentCents: number; totalRepayableCents: number; costOfCreditCents: number;
}
export interface PersonalLoanApplication extends PersonalLoanInput {
  id: string; userId: string; status: 'SUBMITTED' | 'REFERRED' | 'UNDER_REVIEW' | 'DECLINED'; createdAt: string;
  reviewNotes?: string | null;
  lenderId: string | null; firstName?: string; lastName?: string;
}
export interface PersonalVerification {
  status: 'NOT_STARTED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
  identityType?: 'ID' | 'PASSPORT'; maskedIdentity?: string; mobile?: string;
  reason?: string | null; userId?: string; firstName?: string; lastName?: string;
  address?: string; createdAt?: string;
}
export interface OfferAssistantResponse {
  id: string; message: string; draft: import('./client').OfferInput | null;
  model: string; eligibleConsumers?: number; totalConsumers?: number;
  example?: { principalCents: number; monthlyInstallmentCents: number; totalRepayableCents: number; costOfCreditCents: number; lenderRevenueCents: number };
}

export interface MatchedOffer {
  offerId: string;
  offerName: string;
  lenderId: string;
  lenderName: string;
  monthlyInterestRateBps: number;
  termMonths: number;
  initiationFeeCents: number;
  monthlyServiceFeeCents: number;
  /** How much this offer can advance right now (per-user cap, lender liquidity and affordability). */
  availableCents: number;
  /** Illustrative quote for R1 000 (or the offer's available amount if smaller). */
  exampleQuote: { principalCents: number; monthlyInstallmentCents: number; totalRepayableCents: number } | null;
}

export interface XtraBalance {
  walletCents: number;
  creditCents: number;
  /** wallet + credit — the total purchasing power at the point of payment */
  xtraBalanceCents: number;
  affordableInstallmentCents: number;
  offers: MatchedOffer[];
  reasonIfNone: string | null;
}

export interface Card {
  id: string;
  maskedPan: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  status: CardStatus;
  kind: 'VIRTUAL' | 'PHYSICAL';
  createdAt: string;
}

export interface Transaction {
  id: string;
  cardId: string;
  userId: string;
  merchantName: string;
  merchantCategory: string | null;
  channel: TxChannel;
  amountCents: number;
  fromWalletCents: number;
  fromCreditCents: number;
  status: TxStatus;
  declineReason: string | null;
  createdAt: string;
  loans?: Pick<Loan, 'id' | 'principalCents' | 'lenderName'>[];
  user?: Pick<User, 'id' | 'firstName' | 'lastName' | 'email'>;
}

export interface Installment {
  id: string;
  seq: number;
  dueDate: string;
  amountCents: number;
  paidCents: number;
  status: InstallmentStatus;
}

export interface Loan {
  lenderRepaidCents?: number;
  id: string;
  userId: string;
  offerId: string;
  lenderId: string;
  lenderName: string;
  offerName: string;
  transactionId: string | null;
  principalCents: number;
  monthlyInterestRateBps: number;
  termMonths: number;
  initiationFeeCents: number;
  monthlyServiceFeeCents: number;
  totalRepayableCents: number;
  outstandingCents: number;
  status: LoanStatus;
  createdAt: string;
  nextDue?: Installment | null;
  installments?: Installment[];
  user?: Pick<User, 'id' | 'firstName' | 'lastName' | 'email'>;
}

export interface LenderDocument {
  id: string;
  type: DocumentType;
  fileName: string;
  url: string;
  status: 'UPLOADED' | 'ACCEPTED' | 'REJECTED';
  createdAt: string;
}

export interface LenderOrg {
  id: string;
  ownerUserId: string;
  name: string;
  tradingName: string | null;
  registrationNumber: string | null;
  ncrNumber: string | null;
  contactEmail: string;
  contactPhone: string;
  accreditationStatus: AccreditationStatus;
  assistedAccreditation: boolean;
  accreditationFeeCents: number;
  accreditationFeePaid: boolean;
  reviewNotes: string | null;
  accreditedAt: string | null;
  availableCents: number;
  totalLoadedCents: number;
  createdAt: string;
  documents?: LenderDocument[];
}

export interface LenderFunding {
  id: string;
  lenderId: string;
  type: FundingType;
  amountCents: number;
  reference: string;
  status: FundingStatus;
  createdAt: string;
  lender?: { id: string; name: string };
}

export interface LenderStats {
  availableCents: number;
  totalLoadedCents: number;
  outstandingCents: number;
  activeLoans: number;
  loansInArrears: number;
  totalAdvancedCents: number;
  totalRepaidCents: number;
  activeOffers: number;
}

export interface AffiliateSummary {
  commissionBalanceCents: number;
  lifetimeEarnedCents: number;
  pendingCents: number;
  referrals: number;
  bankName: string | null;
  bankAccountNumber: string | null;
}

export interface Referral {
  id: string;
  firstName: string;
  lastName: string;
  roles: Role[];
  kycStatus: KycStatus;
  createdAt: string;
}

export interface Commission {
  id: string;
  affiliateId: string;
  sourceUserId: string | null;
  type: CommissionType;
  amountCents: number;
  status: CommissionStatus;
  description: string;
  createdAt: string;
  affiliate?: Pick<User, 'id' | 'firstName' | 'lastName' | 'email'>;
}

export interface Payout {
  id: string;
  affiliateId: string;
  amountCents: number;
  status: PayoutStatus;
  bankName: string;
  bankAccountNumber: string;
  reference: string | null;
  createdAt: string;
  affiliate?: Pick<User, 'id' | 'firstName' | 'lastName' | 'email'>;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminStats {
  personalApplications?: number;
  users: { total: number; consumers: number; lenders: number; affiliates: number; newLast7Days: number };
  kycPending: number;
  lendersPendingReview: number;
  fundingPending: number;
  payoutsPending: number;
  commissionsPending: number;
  loans: { active: number; inArrears: number; outstandingCents: number; advancedCents: number };
  transactions: { last30DaysCount: number; last30DaysVolumeCents: number; last30DaysCreditCents: number; declineRate: number };
  lenderLiquidityCents: number;
  platformRevenueCents: number;
  dailyVolume: { date: string; walletCents: number; creditCents: number }[];
}

export interface AuditEntry {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  meta: unknown;
  createdAt: string;
}

export interface PlatformSettings {
  affordabilityRatioBps: number;
  maxRateBps: number;
  maxMonthlyServiceFeeCents: number;
  platformShareBps: number;
  assistedAccreditationFeeCents: number;
  commissionConsumerActivationCents: number;
  commissionLenderAccreditedCents: number;
  commissionLoanOriginationBps: number;
  minPayoutCents: number;
  platformBankDetails: string;
}

export interface QuoteResponse {
  principalCents: number;
  financedCents: number;
  monthlyInstallmentCents: number;
  totalRepayableCents: number;
  costOfCreditCents: number;
  schedule: { seq: number; amountCents: number; dueDate: string }[];
}
