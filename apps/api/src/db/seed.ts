/**
 * Demo data for local development. Runs the real services so seeded data follows the same rules
 * as production traffic (affordability, ledger, commissions...).
 *
 *   pnpm db:seed          # wipes and re-seeds (refuses when NODE_ENV=production)
 */
import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { sql, eq } from 'drizzle-orm';
import { makeSaId } from '@xtra/shared';
import { AppModule } from '../app.module';
import { DB } from '../common/db.module';
import { Db } from './client';
import { users, affiliateProfiles } from './schema';
import { AuthService } from '../auth/auth.service';
import { KycService } from '../consumer/kyc.service';
import { LenderService } from '../lender/lender.service';
import { AdminService } from '../admin/admin.service';
import { AuthorizationService } from '../consumer/authorization.service';
import { LoansService } from '../consumer/loans.service';
import { CardsService } from '../consumer/cards.service';
import { AffiliateService } from '../affiliate/affiliate.service';
import * as bcrypt from 'bcryptjs';

const PASSWORD = 'Passw0rd!';
const ADMIN_PASSWORD = 'Admin@12345';
const MINI_PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed a production database');
  process.env.ENABLE_SIMULATION = 'true';
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const db = app.get<Db>(DB);
  const auth = app.get(AuthService);
  const kyc = app.get(KycService);
  const lenders = app.get(LenderService);
  const admin = app.get(AdminService);
  const authz = app.get(AuthorizationService);
  const loans = app.get(LoansService);
  const cards = app.get(CardsService);
  const affiliates = app.get(AffiliateService);

  console.log('Resetting database…');
  const tables = await db.execute<{ tablename: string }>(sql`select tablename from pg_tables where schemaname = 'public'`);
  const names = tables.rows.map((r) => `"${r.tablename}"`).join(', ');
  if (names) await db.execute(sql.raw(`TRUNCATE ${names} RESTART IDENTITY CASCADE`));

  // ---- staff
  const staff = async (email: string, first: string, last: string, phone: string, roles: any[]) => {
    const [u] = await db
      .insert(users)
      .values({
        email,
        phone,
        firstName: first,
        lastName: last,
        roles,
        passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12),
        referralCode: `XCSTAFF${first.toUpperCase().slice(0, 3)}`,
      })
      .returning();
    return { id: u.id, email: u.email, roles: u.roles };
  };
  const superAdmin = await staff('superadmin@xtracash.co.za', 'Zanele', 'Mokoena', '+27820000001', ['SUPER_ADMIN', 'ADMIN']);
  await staff('ops@xtracash.co.za', 'Pieter', 'van Wyk', '+27820000002', ['ADMIN']);

  // ---- affiliate
  const aff = await auth.register({
    email: 'thabo.affiliate@example.com',
    phone: '0831110001',
    password: PASSWORD,
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
      password: PASSWORD,
      firstName: first,
      lastName: last,
      accountType: 'LENDER',
      lenderName: org,
      referralCode: withRef ? ref : undefined,
    });
    const u = { id: r.user.id, email, roles: r.user.roles };
    return u;
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
    const r = await auth.register({ email, phone, password: PASSWORD, firstName: first, lastName: last, accountType: 'CONSUMER', referralCode: withRef ? ref : undefined });
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
  process.env.AUTO_KYC = 'false';
  await consumer('kagiso@example.com', '0791110004', 'Kagiso', 'Molefe', '1988-06-30', 5789, {
    province: 'North West',
    employmentStatus: 'SELF_EMPLOYED',
    income: 1_200_000,
    expenses: 700_000,
  });
  delete process.env.AUTO_KYC;

  // ---- activity
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

  // Approve the first pending commission so the affiliate has a balance.
  const pending = await admin.commissionsList('PENDING');
  if (pending[0]) await affiliates.decideCommission(superAdmin, pending[0].id, true);

  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(affiliateProfiles).where(eq(affiliateProfiles.userId, aff.user.id));
  console.log(`\nSeed complete (${n ? 'affiliate ready' : ''}). Logins:
  Super-admin  superadmin@xtracash.co.za / ${ADMIN_PASSWORD}
  Admin        ops@xtracash.co.za        / ${ADMIN_PASSWORD}
  Consumer     naledi@example.com        / ${PASSWORD}   (salaried, Gauteng)
  Consumer     sipho@example.com         / ${PASSWORD}   (gig worker, KZN)
  Consumer     ayanda@example.com        / ${PASSWORD}   (student — no matching offers)
  Consumer     kagiso@example.com        / ${PASSWORD}   (KYC pending manual review)
  Lender       lindiwe@kasicapital.co.za / ${PASSWORD}   (accredited)
  Lender       bongani@ubuntucredit.co.za/ ${PASSWORD}   (accredited, assisted)
  Lender       fatima@mzansiquick.co.za  / ${PASSWORD}   (awaiting review)
  Affiliate    thabo.affiliate@example.com / ${PASSWORD} (referral code ${ref})
`);
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
