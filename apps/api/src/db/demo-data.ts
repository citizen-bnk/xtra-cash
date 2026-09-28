/**
 * The XTRA-CASH demo world: staff, an affiliate, three micro-lenders with offers, four shoppers and some
 * card activity. Built through the real services so it follows the same rules as production traffic
 * (affordability, ledger, commissions...).
 *
 * Used by `pnpm db:seed` (after wiping a local database) and by one-click demo sign-in
 * (`ENABLE_DEMO_LOGIN=true`), which builds it once on first use without touching other data.
 */
import type { INestApplicationContext } from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';
import * as bcrypt from 'bcryptjs';
import { makeSaId } from '@xtra/shared';
import { DB } from '../common/db.module';
import { Db } from './client';
import { users } from './schema';
import { AuthService } from '../auth/auth.service';
import { KycService } from '../consumer/kyc.service';
import { LenderService } from '../lender/lender.service';
import { AdminService } from '../admin/admin.service';
import { AuthorizationService } from '../consumer/authorization.service';
import { LoansService } from '../consumer/loans.service';
import { CardsService } from '../consumer/cards.service';
import { AffiliateService } from '../affiliate/affiliate.service';

export const DEMO_PASSWORD = 'Passw0rd!';
export const DEMO_ADMIN_PASSWORD = 'Admin@12345';
const MINI_PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');

export interface DemoStaffAccount {
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  referralCode: string;
}

/** Staff accounts for the local seed (documented in the README). */
export const SEED_STAFF: { superAdmin: DemoStaffAccount; ops: DemoStaffAccount } = {
  superAdmin: { email: 'superadmin@xtracash.co.za', phone: '+27820000001', firstName: 'Zanele', lastName: 'Mokoena', referralCode: 'XCSTAFFZAN' },
  ops: { email: 'ops@xtracash.co.za', phone: '+27820000002', firstName: 'Pieter', lastName: 'van Wyk', referralCode: 'XCSTAFFPIE' },
};

/**
 * Staff accounts built by one-click demo sign-in. They have their own addresses so a demo tile can never
 * sign someone in as the platform's real super-admin.
 */
export const DEMO_LOGIN_STAFF: typeof SEED_STAFF = {
  superAdmin: { email: 'demo.superadmin@xtracash.co.za', phone: '+27820000901', firstName: 'Zanele', lastName: 'Mokoena', referralCode: 'XCDEMOSUPA' },
  ops: { email: 'demo.ops@xtracash.co.za', phone: '+27820000902', firstName: 'Pieter', lastName: 'van Wyk', referralCode: 'XCDEMOOPS1' },
};

type Resolver = Pick<INestApplicationContext, 'get'> | Pick<ModuleRef, 'get'>;

/** Runs `fn` with some env flags set, then restores them. The demo build needs simulation and manual-KYC switches. */
async function withEnv<T>(vars: Record<string, string>, fn: () => Promise<T>): Promise<T> {
  const before: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) {
    before[k] = process.env[k];
    process.env[k] = vars[k];
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

export async function buildDemoData(app: Resolver, staffAccounts = SEED_STAFF) {
  const get = <T>(token: any): T => (app as any).get(token, { strict: false });
  const db = get<Db>(DB);
  const auth = get<AuthService>(AuthService);
  const kyc = get<KycService>(KycService);
  const lenders = get<LenderService>(LenderService);
  const admin = get<AdminService>(AdminService);
  const authz = get<AuthorizationService>(AuthorizationService);
  const loans = get<LoansService>(LoansService);
  const cards = get<CardsService>(CardsService);
  const affiliates = get<AffiliateService>(AffiliateService);

  // ---- staff
  const staff = async (a: DemoStaffAccount, roles: any[]) => {
    const [u] = await db
      .insert(users)
      .values({
        email: a.email,
        phone: a.phone,
        firstName: a.firstName,
        lastName: a.lastName,
        roles,
        passwordHash: await bcrypt.hash(DEMO_ADMIN_PASSWORD, 12),
        referralCode: a.referralCode,
      })
      .returning();
    return { id: u.id, email: u.email, roles: u.roles };
  };
  const superAdmin = await staff(staffAccounts.superAdmin, ['SUPER_ADMIN', 'ADMIN']);
  await staff(staffAccounts.ops, ['ADMIN']);

  // ---- affiliate
  const aff = await auth.register({
    email: 'thabo.affiliate@example.com',
    phone: '0831110001',
    password: DEMO_PASSWORD,
    firstName: 'Thabo',
    lastName: 'Nkosi',
    accountType: 'AFFILIATE',
  });
  await affiliates.saveBank(aff.user.id, { bankName: 'Capitec', bankAccountNumber: '1234567890' });
  const ref = aff.user.referralCode;

  // ---- lenders
  const makeLender = async (email: string, phone: string, first: string, last: string, org: string, withRef: boolean) => {
    const r = await auth.register({
      email,
      phone,
      password: DEMO_PASSWORD,
      firstName: first,
      lastName: last,
      accountType: 'LENDER',
      lenderName: org,
      referralCode: withRef ? ref : undefined,
    });
    return { id: r.user.id, email, roles: r.user.roles };
  };
  const kasiOwner = await makeLender('lindiwe@kasicapital.co.za', '0721110001', 'Lindiwe', 'Dlamini', 'Kasi Capital Microfinance', true);
  const ubuntuOwner = await makeLender('bongani@ubuntucredit.co.za', '0721110002', 'Bongani', 'Zulu', 'Ubuntu Credit Co-op', false);
  const mzansiOwner = await makeLender('fatima@mzansiquick.co.za', '0721110003', 'Fatima', 'Patel', 'Mzansi Quick Loans', true);

  const docs = async (u: any) => {
    for (const type of ['CIPC_REGISTRATION', 'BANK_CONFIRMATION', 'DIRECTOR_ID', 'FICA_PROOF_OF_ADDRESS', 'NCR_CERTIFICATE']) {
      await lenders.uploadDocument(u, type, { buffer: MINI_PDF, originalname: `${type.toLowerCase()}.pdf`, mimetype: 'application/pdf' } as any);
    }
  };

  await lenders.saveOrg(kasiOwner, {
    name: 'Kasi Capital Microfinance',
    tradingName: 'Kasi Capital',
    registrationNumber: '2019/123456/07',
    ncrNumber: 'NCRCP12345',
    contactEmail: 'lindiwe@kasicapital.co.za',
    contactPhone: '0721110001',
  });
  await docs(kasiOwner);
  await lenders.submitAccreditation(kasiOwner, false);

  await lenders.saveOrg(ubuntuOwner, {
    name: 'Ubuntu Credit Co-op',
    registrationNumber: '2021/654321/07',
    contactEmail: 'bongani@ubuntucredit.co.za',
    contactPhone: '0721110002',
  });
  await lenders.submitAccreditation(ubuntuOwner, true); // assisted accreditation
  await lenders.payAccreditationFee(ubuntuOwner);

  await lenders.saveOrg(mzansiOwner, {
    name: 'Mzansi Quick Loans',
    registrationNumber: '2023/777777/07',
    ncrNumber: 'NCRCP99999',
    contactEmail: 'fatima@mzansiquick.co.za',
    contactPhone: '0721110003',
  });
  await docs(mzansiOwner);
  await lenders.submitAccreditation(mzansiOwner, false); // left in the admin review queue

  const kasi = await lenders.orgFor(kasiOwner.id);
  const ubuntu = await lenders.orgFor(ubuntuOwner.id);
  await admin.reviewLender(superAdmin, kasi.id, 'UNDER_REVIEW');
  await admin.reviewLender(superAdmin, kasi.id, 'ACCREDITED', 'All documents verified');
  await admin.setLenderNcr(superAdmin, ubuntu.id, 'NCRCP55555');
  await admin.reviewLender(superAdmin, ubuntu.id, 'ACCREDITED', 'Assisted accreditation completed by XTRA-CASH compliance');

  // Fund the stalls (EFT confirmed by back office)
  for (const [owner, amount] of [
    [kasiOwner, 25_000_000],
    [ubuntuOwner, 15_000_000],
  ] as const) {
    const f = await lenders.requestFunding(owner, { type: 'LOAD', amountCents: amount });
    await lenders.decideFunding(superAdmin, f.id, true);
  }
  await lenders.requestFunding(ubuntuOwner, { type: 'LOAD', amountCents: 5_000_000 }); // pending in admin queue

  // Offers
  await lenders.createOffer(kasiOwner, {
    name: 'Everyday Xtra',
    description: 'Small top-ups for groceries and essentials, repaid over 3 months.',
    monthlyInterestRateBps: 300,
    termMonths: 3,
    initiationFeeCents: 5_000,
    monthlyServiceFeeCents: 2_500,
    minAmountCents: 10_000,
    maxAmountPerUserCents: 300_000,
    minMonthlyIncomeCents: 350_000,
    minCreditScore: 550,
    minAge: 18,
    maxAge: 70,
    employmentStatuses: [],
    provinces: [],
  });
  await lenders.createOffer(kasiOwner, {
    name: 'Salary Advance Plus',
    description: 'Bigger purchases for salaried customers, 6 months.',
    monthlyInterestRateBps: 250,
    termMonths: 6,
    initiationFeeCents: 15_000,
    monthlyServiceFeeCents: 4_900,
    minAmountCents: 50_000,
    maxAmountPerUserCents: 800_000,
    minMonthlyIncomeCents: 800_000,
    minCreditScore: 620,
    minAge: 21,
    maxAge: 65,
    employmentStatuses: ['EMPLOYED_FULL_TIME', 'EMPLOYED_PART_TIME'],
    provinces: [],
  });
  await lenders.createOffer(ubuntuOwner, {
    name: 'Gig Worker Boost',
    description: 'For drivers, traders and hustlers. 2-month repayment.',
    monthlyInterestRateBps: 400,
    termMonths: 2,
    initiationFeeCents: 0,
    monthlyServiceFeeCents: 2_000,
    minAmountCents: 5_000,
    maxAmountPerUserCents: 150_000,
    minMonthlyIncomeCents: 200_000,
    minCreditScore: 500,
    minAge: 18,
    maxAge: 60,
    employmentStatuses: ['GIG_WORKER', 'INFORMAL_TRADER', 'SELF_EMPLOYED'],
    provinces: ['Gauteng', 'KwaZulu-Natal', 'Western Cape'],
  });

  // ---- consumers
  const consumer = async (
    email: string,
    phone: string,
    first: string,
    last: string,
    dob: string,
    seq: number,
    k: { province: string; employmentStatus: any; income: number; expenses: number; employer?: string },
    withRef = true,
  ) => {
    const r = await auth.register({ email, phone, password: DEMO_PASSWORD, firstName: first, lastName: last, accountType: 'CONSUMER', referralCode: withRef ? ref : undefined });
    await kyc.submit(r.user.id, {
      idNumber: makeSaId(new Date(dob), seq),
      province: k.province,
      employmentStatus: k.employmentStatus,
      employerName: k.employer,
      monthlyIncomeCents: k.income,
      monthlyExpensesCents: k.expenses,
      consentCreditCheck: true,
    });
    return r.user;
  };

  const naledi = await consumer('naledi@example.com', '0791110001', 'Naledi', 'Khumalo', '1994-03-14', 5123, {
    province: 'Gauteng',
    employmentStatus: 'EMPLOYED_FULL_TIME',
    employer: 'Netcare',
    income: 1_800_000,
    expenses: 900_000,
  });
  const sipho = await consumer('sipho@example.com', '0791110002', 'Sipho', 'Mthembu', '1999-08-02', 5456, {
    province: 'KwaZulu-Natal',
    employmentStatus: 'GIG_WORKER',
    income: 650_000,
    expenses: 380_000,
  });
  await consumer('ayanda@example.com', '0791110003', 'Ayanda', 'Mabena', '2004-11-20', 1234, {
    province: 'Western Cape',
    employmentStatus: 'STUDENT',
    income: 250_000,
    expenses: 200_000,
  }, false);
  await withEnv({ AUTO_KYC: 'false' }, () =>
    consumer('kagiso@example.com', '0791110004', 'Kagiso', 'Molefe', '1988-06-30', 5789, {
      province: 'North West',
      employmentStatus: 'SELF_EMPLOYED',
      income: 1_200_000,
      expenses: 700_000,
    }),
  );

  // ---- activity (mock top-ups need simulation mode)
  await withEnv({ ENABLE_SIMULATION: 'true' }, async () => {
    const [nCard] = await cards.list(naledi.id);
    const [sCard] = await cards.list(sipho.id);
    await loans.topUp(naledi.id, 50_000);
    const t1 = await authz.authorize({ cardId: nCard.id, userId: naledi.id, amountCents: 185_000, merchantName: 'Shoprite Soweto', merchantCategory: 'Groceries', channel: 'IN_STORE', idempotencyKey: 'seed-1' });
    await authz.authorize({ cardId: nCard.id, userId: naledi.id, amountCents: 42_000, merchantName: 'Takealot', merchantCategory: 'Online retail', channel: 'ONLINE', idempotencyKey: 'seed-2' });
    await authz.authorize({ cardId: sCard.id, userId: sipho.id, amountCents: 30_000, merchantName: 'Engen Umlazi', merchantCategory: 'Fuel', channel: 'IN_STORE', idempotencyKey: 'seed-3' });
    await authz.authorize({ cardId: sCard.id, userId: sipho.id, amountCents: 9_000_000, merchantName: 'Game Pavilion', merchantCategory: 'Electronics', channel: 'IN_STORE', idempotencyKey: 'seed-4' }); // declined

    const firstLoan = t1.loans?.[0];
    if (firstLoan) {
      await loans.topUp(naledi.id, 30_000);
      await loans.repay(naledi.id, firstLoan.id, 30_000);
    }
  });

  // Approve the first pending commission so the affiliate has a balance.
  const pending = await admin.commissionsList('PENDING');
  if (pending[0]) await affiliates.decideCommission(superAdmin, pending[0].id, true);

  return { affiliateReferralCode: ref };
}
