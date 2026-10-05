import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gte, lte, ne } from 'drizzle-orm';
import { ageOn, parseSaId, quoteLoan } from '@xtra/shared';
import { InjectDb } from '../common/db.module';
import { Db } from '../db/client';
import { kycProfiles, lenderOrgs, loanOffers, personalLoanApplications, personalVerifications, users } from '../db/schema';
import { CreditService } from '../consumer/credit.service';
import { offerCapacity } from '../consumer/credit-engine';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/auth';
import { CREDIT_BUREAU, FILE_STORAGE } from '../integrations/integrations.module';
import type { CreditBureau } from '../integrations/credit-bureau';
import type { FileStorage } from '../integrations/storage';
import { ApplicationReviewDto, PersonalApplicationDto, PrecheckDto, VerificationDecisionDto, VerificationDto } from './personal.dto';
import { decryptIdentity } from '../auth/identity-crypto';

export function validateIdentity(type: 'ID' | 'PASSPORT', value: string, dob?: string) {
  const number = value.trim().toUpperCase();
  if (type === 'ID') {
    const id = parseSaId(number);
    if (!id.valid) throw new BadRequestException(id.reason);
    return { number, dateOfBirth: id.dateOfBirth! };
  }
  if (!/^[A-Z0-9]{6,20}$/.test(number)) throw new BadRequestException('Enter a valid passport number (6–20 letters or numbers)');
  const dateOfBirth = dob ? new Date(dob) : null;
  if (dob && (!dateOfBirth || !Number.isFinite(dateOfBirth.getTime()))) throw new BadRequestException('Enter a valid date of birth');
  return { number, dateOfBirth };
}
export function presentVerification(v: typeof personalVerifications.$inferSelect | undefined) {
  if (!v) return { status: 'NOT_STARTED' as const };
  return { status: v.status, identityType: v.identityType, maskedIdentity: `••••${v.identityNumber.slice(-4)}`, mobile: v.mobile, address: v.address, reason: v.reason, createdAt: v.createdAt, userId: v.userId };
}

@Injectable()
export class PersonalLoanService {
  constructor(@InjectDb() private db: Db, private credit: CreditService, private audit: AuditService, @Inject(FILE_STORAGE) private storage: FileStorage, @Inject(CREDIT_BUREAU) private bureau: CreditBureau) {}

  async precheck(dto: PrecheckDto) {
    validateIdentity(dto.identityType, dto.identityNumber);
    const filters = [eq(loanOffers.productType, 'PERSONAL'), eq(loanOffers.active, true), eq(lenderOrgs.accreditationStatus, 'ACCREDITED')];
    if (dto.amountCents) filters.push(lte(loanOffers.minAmountCents, dto.amountCents), gte(loanOffers.maxAmountPerUserCents, dto.amountCents));
    if (dto.termMonths) filters.push(eq(loanOffers.termMonths, dto.termMonths));
    const [option] = await this.db.select({ id: loanOffers.id }).from(loanOffers).innerJoin(lenderOrgs, eq(loanOffers.lenderId, lenderOrgs.id)).where(and(...filters)).limit(1);
    // No identity lookup, credit decision, named lenders or raw identity logging on this public endpoint.
    return { potentialOptions: !!option, verificationRequired: true, message: option ? 'Personal loan products may fit your request. Complete KYC and FICA to check your match and see lenders.' : 'No personal loan products fit this request right now. You can still submit an application for platform review.', basis: 'Product availability only. Identity, affordability and lender approval are still required.' };
  }

  async verification(userId: string) { return presentVerification(await this.db.query.personalVerifications.findFirst({ where: eq(personalVerifications.userId, userId) })); }

  async submitVerification(u: AuthUser, dto: VerificationDto, files: { identity?: Express.Multer.File[]; address?: Express.Multer.File[] }) {
    const identity = validateIdentity(dto.identityType, dto.identityNumber, dto.dateOfBirth);
    if (!identity.dateOfBirth || ageOn(identity.dateOfBirth) < 18 || ageOn(identity.dateOfBirth) > 100) throw new BadRequestException('A valid date of birth for an adult is required');
    const current = await this.db.query.personalVerifications.findFirst({ where: eq(personalVerifications.userId, u.id) });
    if (current?.status === 'VERIFIED') throw new BadRequestException('Verified identity details cannot be replaced here. Contact support.');
    const idFile = files?.identity?.[0], addressFile = files?.address?.[0];
    if (!idFile || !addressFile) throw new BadRequestException('Upload your identity document and proof of residential address');
    for (const f of [idFile, addressFile]) if (!['application/pdf', 'image/jpeg', 'image/png'].includes(f.mimetype) || f.size > 1900000) throw new BadRequestException('Use a PDF, JPG or PNG under 1.9 MB per document');
    for (const f of [idFile, addressFile]) {
      const hex = f.buffer.subarray(0, 8).toString('hex');
      const valid = f.mimetype === 'application/pdf' ? f.buffer.subarray(0, 5).toString() === '%PDF-' : f.mimetype === 'image/png' ? hex === '89504e470d0a1a0a' : hex.startsWith('ffd8ff');
      if (!valid) throw new BadRequestException('The document content must be a PDF, JPG or PNG');
    }
    const account = await this.db.query.users.findFirst({ where: eq(users.id, u.id) });
    if (!account?.profileComplete) throw new BadRequestException('Complete your name and surname first');
    if (account.identityEncrypted && (account.identityType !== dto.identityType || decryptIdentity(account.identityEncrypted) !== identity.number)) throw new BadRequestException('The document must match the identity registered to your account');
    const identityNumber = dto.identityType === 'ID' ? identity.number : `PASSPORT:${identity.number}`;
    const existingKyc = await this.db.query.kycProfiles.findFirst({ where: eq(kycProfiles.userId, u.id) });
    if (existingKyc && existingKyc.idNumber !== identityNumber) throw new BadRequestException('This document does not match your submitted identity. Contact support.');
    const taken = await this.db.query.kycProfiles.findFirst({ where: eq(kycProfiles.idNumber, identityNumber) });
    if (taken && taken.userId !== u.id) throw new BadRequestException('This identity cannot be submitted. Contact support.');
    const [identityFileKey, addressFileKey] = await Promise.all([this.storage.put(idFile.buffer, idFile.originalname), this.storage.put(addressFile.buffer, addressFile.originalname)]);
    await this.db.transaction(async tx => {
      const saved = await tx.insert(personalVerifications).values({ userId: u.id, identityType: dto.identityType, identityNumber: identity.number, mobile: dto.mobile, address: dto.address.trim(), identityFileKey, addressFileKey, consentAt: new Date() }).onConflictDoUpdate({ target: personalVerifications.userId, setWhere: ne(personalVerifications.status, 'VERIFIED'), set: { identityType: dto.identityType, identityNumber: identity.number, mobile: dto.mobile, address: dto.address.trim(), identityFileKey, addressFileKey, status: 'PENDING', reason: null, reviewedById: null, consentAt: new Date() } }).returning({ id: personalVerifications.id });
      if (!saved.length) throw new BadRequestException('Verification has already been completed');
      if (!existingKyc) await tx.insert(kycProfiles).values({ userId: u.id, idNumber: identityNumber, dateOfBirth: identity.dateOfBirth!, province: dto.province, employmentStatus: dto.employmentStatus, monthlyIncomeCents: 0, monthlyExpensesCents: 0, consentAt: new Date(), status: 'PENDING' });
      await this.audit.log(u, 'personal_verification.submitted', 'user', u.id, {}, tx);
    });
    return this.verification(u.id);
  }

  async matches(userId: string, dto: PersonalApplicationDto) {
    const v = await this.verification(userId);
    if (v.status !== 'VERIFIED') return { locked: true, reason: 'Complete KYC and FICA before viewing matched lenders.', matches: [] };
    const ctx = await this.credit.context(userId, this.db, 'PERSONAL', dto);
    if (!ctx.profile) return { locked: true, reason: ctx.reasonIfNone, matches: [] };
    const matches = ctx.eligible.filter(o => o.termMonths === dto.termMonths && dto.amountCents >= o.minAmountCents && dto.amountCents <= offerCapacity(o, ctx.affordableCents)).map(o => {
      const q = quoteLoan(dto.amountCents, o);
      return { offerId: o.offerId, lenderName: o.lenderName, offerName: o.offerName, termMonths: o.termMonths, monthlyInstallmentCents: q.monthlyInstallmentCents, totalRepayableCents: q.totalRepayableCents, costOfCreditCents: q.costOfCreditCents };
    }).sort((a, b) => a.totalRepayableCents - b.totalRepayableCents);
    return { locked: false, reason: matches.length ? null : ctx.reasonIfNone ?? 'No personal loan offers match the requested amount, period and affordability right now.', matches };
  }

  async apply(u: AuthUser, dto: PersonalApplicationDto) {
    const user = await this.db.query.users.findFirst({ where: eq(users.id, u.id) });
    if (user?.status !== 'ACTIVE') throw new ForbiddenException('Account unavailable');
    if (!user.profileComplete) throw new BadRequestException('Complete your name and surname first');
    let lenderId: string | null = null;
    if (dto.offerId) {
      const match = await this.matches(u.id, dto);
      if (match.locked || !match.matches.some(m => m.offerId === dto.offerId)) throw new BadRequestException('This lender match is not available. Refresh your application.');
      const offer = await this.db.query.loanOffers.findFirst({ where: eq(loanOffers.id, dto.offerId) });
      lenderId = offer!.lenderId;
    }
    return this.db.transaction(async tx => {
      await tx.select({ id: users.id }).from(users).where(eq(users.id, u.id)).for('update');
      const existing = await tx.query.personalLoanApplications.findFirst({ where: and(eq(personalLoanApplications.userId, u.id), eq(personalLoanApplications.idempotencyKey, dto.idempotencyKey)) });
      if (existing && (!dto.offerId || existing.lenderId || existing.status === 'DECLINED')) return existing;
      const payload = { amountCents: dto.amountCents, termMonths: dto.termMonths, purpose: dto.purpose, monthlyIncomeCents: dto.monthlyIncomeCents, monthlyExpensesCents: dto.monthlyExpensesCents, offerId: dto.offerId ?? null, lenderId, status: lenderId ? 'REFERRED' as const : 'SUBMITTED' as const, consentAt: new Date() };
      const [app] = await tx.insert(personalLoanApplications).values({ ...payload, userId: u.id, idempotencyKey: dto.idempotencyKey }).onConflictDoUpdate({ target: [personalLoanApplications.userId, personalLoanApplications.idempotencyKey], set: payload }).returning();
      await this.audit.log(u, 'personal_loan.submitted', 'personal_loan_application', app.id, { referred: !!lenderId }, tx);
      return app;
    });
  }

  list(userId: string) { return this.db.query.personalLoanApplications.findMany({ where: eq(personalLoanApplications.userId, userId), orderBy: desc(personalLoanApplications.createdAt), limit: 30 }); }
  async lenderList(u: AuthUser) {
    const org = await this.db.query.lenderOrgs.findFirst({ where: eq(lenderOrgs.ownerUserId, u.id) });
    if (!org) throw new NotFoundException();
    if (org.accreditationStatus !== 'ACCREDITED') return [];
    return this.db.select({ ...applicationFields, firstName: users.firstName, lastName: users.lastName }).from(personalLoanApplications).innerJoin(users, eq(users.id, personalLoanApplications.userId)).where(eq(personalLoanApplications.lenderId, org.id)).orderBy(desc(personalLoanApplications.createdAt)).limit(100);
  }
  reviewApplications() { return this.db.select({ ...applicationFields, firstName: users.firstName, lastName: users.lastName }).from(personalLoanApplications).innerJoin(users, eq(users.id, personalLoanApplications.userId)).orderBy(desc(personalLoanApplications.createdAt)).limit(100); }
  async reviewApplication(actor: AuthUser, id: string, dto: ApplicationReviewDto) {
    const staff = actor.roles.some(r => r === 'ADMIN' || r === 'SUPER_ADMIN');
    const org = staff ? null : await this.db.query.lenderOrgs.findFirst({ where: eq(lenderOrgs.ownerUserId, actor.id) });
    if (!staff && (!org || org.accreditationStatus !== 'ACCREDITED')) throw new ForbiddenException();
    return this.db.transaction(async tx => {
      const [app] = await tx.select().from(personalLoanApplications).where(eq(personalLoanApplications.id, id)).for('update');
      if (!app || (!staff && app.lenderId !== org!.id)) throw new NotFoundException();
      if (app.status === 'DECLINED') throw new BadRequestException('This application has already been declined');
      const [updated] = await tx.update(personalLoanApplications).set({ status: dto.action === 'DECLINE' ? 'DECLINED' : 'UNDER_REVIEW', reviewNotes: dto.notes.trim(), reviewedAt: new Date() }).where(eq(personalLoanApplications.id, id)).returning();
      await this.audit.log(actor, 'personal_loan.reviewed', 'personal_loan_application', id, { action: dto.action }, tx);
      return updated;
    });
  }
  async reviewVerifications() {
    const rows = await this.db.select({ verification: personalVerifications, firstName: users.firstName, lastName: users.lastName }).from(personalVerifications).innerJoin(users, eq(users.id, personalVerifications.userId)).orderBy(desc(personalVerifications.createdAt)).limit(100);
    return rows.map(r => ({ ...presentVerification(r.verification), firstName: r.firstName, lastName: r.lastName }));
  }
  async document(actor: AuthUser, userId: string, kind: string) {
    if (actor.id !== userId && !actor.roles.some(r => r === 'ADMIN' || r === 'SUPER_ADMIN')) throw new ForbiddenException();
    if (!['identity', 'address'].includes(kind)) throw new NotFoundException();
    const v = await this.db.query.personalVerifications.findFirst({ where: eq(personalVerifications.userId, userId) });
    if (!v) throw new NotFoundException();
    await this.audit.log(actor, 'personal_verification.document_viewed', 'user', userId, { kind });
    return this.storage.get(kind === 'identity' ? v.identityFileKey : v.addressFileKey);
  }
  async decide(actor: AuthUser, userId: string, dto: VerificationDecisionDto) {
    const v = await this.db.query.personalVerifications.findFirst({ where: eq(personalVerifications.userId, userId) });
    if (!v || v.status !== 'PENDING') throw new BadRequestException('No pending verification');
    if (!dto.approve && !dto.reason?.trim()) throw new BadRequestException('Explain what the applicant must correct');
    await this.db.transaction(async tx => {
      const [updated] = await tx.update(personalVerifications).set({ status: dto.approve ? 'VERIFIED' : 'REJECTED', reason: dto.reason ?? null, reviewedById: actor.id }).where(and(eq(personalVerifications.userId, userId), eq(personalVerifications.status, 'PENDING'))).returning();
      if (!updated) throw new BadRequestException('Verification was already reviewed');
      // Document review does not fabricate a bureau score or authorise a loan.
      if (dto.approve) await tx.update(kycProfiles).set({ status: 'VERIFIED', verifiedAt: new Date() }).where(eq(kycProfiles.userId, userId));
      await this.audit.log(actor, 'personal_verification.reviewed', 'user', userId, { approved: dto.approve }, tx);
    });
    return this.verification(userId);
  }
}
const applicationFields = {
  id: personalLoanApplications.id, userId: personalLoanApplications.userId, amountCents: personalLoanApplications.amountCents,
  termMonths: personalLoanApplications.termMonths, purpose: personalLoanApplications.purpose, monthlyIncomeCents: personalLoanApplications.monthlyIncomeCents,
  monthlyExpensesCents: personalLoanApplications.monthlyExpensesCents, status: personalLoanApplications.status,
  lenderId: personalLoanApplications.lenderId, createdAt: personalLoanApplications.createdAt, reviewNotes: personalLoanApplications.reviewNotes,
};
