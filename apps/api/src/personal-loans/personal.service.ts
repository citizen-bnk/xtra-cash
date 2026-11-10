import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gte, lte, ne, or, inArray } from 'drizzle-orm';
import { applicationLenderAccess, competitionConsents, loanCompetitions } from './lender-ai.schema';
import {RoutingService} from './routing';
import { ageOn, parseSaId, quoteLoan } from '@xtra/shared';
import { InjectDb } from '../common/db.module';
import { Db } from '../db/client';
import { applicationVaultDocuments, kycProfiles, lenderOrgs, loanOffers, personalLoanApplications, personalVerifications, users, vaultDocuments } from '../db/schema';
import { CreditService } from '../consumer/credit.service';
import { offerCapacity } from '../consumer/credit-engine';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/auth';
import { CREDIT_BUREAU, FILE_STORAGE } from '../integrations/integrations.module';
import type { CreditBureau } from '../integrations/credit-bureau';
import type { FileStorage } from '../integrations/storage';
import { AmendPersonalApplicationDto, ApplicationReviewDto, PersonalApplicationDto, PrecheckDto, VerificationDecisionDto, VerificationDto } from './personal.dto';
import { decryptIdentity } from '../auth/identity-crypto';
import { applicationEvents } from './settlement.schema';
import { VaultService } from './vault.service';

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
  constructor(@InjectDb() private db: Db, private credit: CreditService, private audit: AuditService, @Inject(FILE_STORAGE) private storage: FileStorage, @Inject(CREDIT_BUREAU) private bureau: CreditBureau,private routing:RoutingService, private vaults: VaultService) {}

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
    const [identityVaultDoc, addressVaultDoc] = await this.vaults.ingestApplicationDocuments(u, [
      { type: 'ID_DOCUMENT', file: idFile },
      { type: 'PROOF_OF_ADDRESS', file: addressFile },
    ]);
    const identityFileKey = identityVaultDoc.storageKey, addressFileKey = addressVaultDoc.storageKey;
    await this.db.transaction(async tx => {
      const saved = await tx.insert(personalVerifications).values({ userId: u.id, identityType: dto.identityType, identityNumber: identity.number, mobile: dto.mobile, address: dto.address.trim(), identityFileKey, addressFileKey, consentAt: new Date() }).onConflictDoUpdate({ target: personalVerifications.userId, setWhere: ne(personalVerifications.status, 'VERIFIED'), set: { identityType: dto.identityType, identityNumber: identity.number, mobile: dto.mobile, address: dto.address.trim(), identityFileKey, addressFileKey, status: 'PENDING', reason: null, reviewedById: null, consentAt: new Date() } }).returning({ id: personalVerifications.id });
      if (!saved.length) throw new BadRequestException('Verification has already been completed');
      if (!existingKyc) await tx.insert(kycProfiles).values({ userId: u.id, idNumber: identityNumber, dateOfBirth: identity.dateOfBirth!, province: dto.province, employmentStatus: dto.employmentStatus, monthlyIncomeCents: 0, monthlyExpensesCents: 0, consentAt: new Date(), status: 'PENDING' });
      await this.audit.log(u, 'personal_verification.submitted', 'user', u.id, {}, tx);
    });
    return this.verification(u.id);
  }

  async matches(userId: string, dto: PersonalApplicationDto) {
    return { locked: true, matches: [], reason: 'Your request is sent to all active accredited lenders. You do not select a lender; a lender will make an offer if it fits their criteria.' };
  }

  async apply(u: AuthUser, dto: PersonalApplicationDto) {
    const user = await this.db.query.users.findFirst({ where: eq(users.id, u.id) });
    if (user?.status !== 'ACTIVE') throw new ForbiddenException('Account unavailable');
    if (!user.profileComplete) throw new BadRequestException('Complete your name and surname first');
    const vaultSnapshot = await this.vaults.loanSnapshot(u.id, dto.vaultValidationId);
    const policy=await this.routing.policy();
    if(dto.offerId) throw new BadRequestException('Lender selection is not part of the XTRA-CASH request flow. Lenders receive the request and make offers directly.');
    if((dto.latitude===undefined)!==(dto.longitude===undefined))throw new BadRequestException('Provide both location coordinates.');
    if(dto.latitude!==undefined&&!dto.routingConsent)throw new BadRequestException('Routing consent is required to supply matching location.');
    const routingConsent = dto.routingConsent !== false;
    const lenderId: string | null = null;
    return this.db.transaction(async tx => {
      await tx.select({ id: users.id }).from(users).where(eq(users.id, u.id)).for('update');
      const currentKyc = await tx.query.kycProfiles.findFirst({ where: eq(kycProfiles.userId, u.id) });
      if (!currentKyc) throw new BadRequestException('Complete your verified profile before applying.');
      // The account profile is canonical. Financial values in older clients' application
      // payloads are intentionally ignored; the form must save them to the profile first.
      const monthlyIncomeCents = currentKyc.monthlyIncomeCents;
      const monthlyExpensesCents = currentKyc.monthlyExpensesCents;
      if (monthlyIncomeCents <= 0 || monthlyExpensesCents < 0) throw new BadRequestException('Complete your monthly income and expenses in your saved profile before submitting this loan request.');
      const existing = await tx.query.personalLoanApplications.findFirst({ where: and(eq(personalLoanApplications.userId, u.id), eq(personalLoanApplications.idempotencyKey, dto.idempotencyKey)) });
      if (existing) {
        if (['SUBMITTED','REFERRED','UNDER_REVIEW','ACTION_REQUIRED'].includes(existing.status) && existing.lenderId === null) {
          const [synced] = await tx.update(personalLoanApplications).set({ monthlyIncomeCents, monthlyExpensesCents, vaultSnapshot, vaultValidationId: dto.vaultValidationId ?? existing.vaultValidationId }).where(eq(personalLoanApplications.id, existing.id)).returning();
          return synced;
        }
        return existing;
      }
      const payload = { amountCents: dto.amountCents, termMonths: dto.termMonths, purpose: dto.purpose ?? 'Other', monthlyIncomeCents, monthlyExpensesCents, offerId: dto.offerId ?? null, lenderId, status: lenderId ? 'REFERRED' as const : 'SUBMITTED' as const, consentAt: new Date(), vaultSnapshot, vaultValidationId: dto.vaultValidationId ?? null };
      const [app] = await tx.insert(personalLoanApplications).values({ ...payload, userId: u.id, idempotencyKey: dto.idempotencyKey }).onConflictDoUpdate({ target: [personalLoanApplications.userId, personalLoanApplications.idempotencyKey], set: payload }).returning();
      await this.audit.log(u, 'personal_loan.submitted', 'personal_loan_application', app.id, { referred: !!lenderId }, tx);
      await this.routing.record(app.id,policy.mode,routingConsent,dto.latitude!==undefined?{latitude:dto.latitude,longitude:dto.longitude!}:undefined,tx);
      if (routingConsent) await tx.insert(competitionConsents).values({ applicationId: app.id, userId: u.id }).onConflictDoNothing();
      await tx.insert(loanCompetitions).values({ applicationId: app.id, releasedBy: u.id, authorityReference: 'APPLICANT_SUBMISSION' }).onConflictDoNothing();
      const evidence = await tx.select({ id: vaultDocuments.id }).from(vaultDocuments).where(and(eq(vaultDocuments.userId, u.id), lte(vaultDocuments.createdAt, app.createdAt)));
      if (evidence.length) await tx.insert(applicationVaultDocuments).values(evidence.map(doc => ({ applicationId: app.id, documentId: doc.id, linkedBy: u.id }))).onConflictDoNothing();
      await tx.insert(applicationEvents).values({applicationId:app.id,actorId:u.id,status:app.status,message:lenderId?'Your application was sent to the selected lender for review.':'Your application was submitted for review.'});
      return app;
    }).then(async app=>(await this.db.query.personalLoanApplications.findFirst({where:eq(personalLoanApplications.id,app.id)}))!);
  }

  list(userId: string) { return this.db.query.personalLoanApplications.findMany({ where: eq(personalLoanApplications.userId, userId), orderBy: desc(personalLoanApplications.createdAt), limit: 30 }); }
  async amendApplication(actor: AuthUser, id: string, dto: AmendPersonalApplicationDto) {
    const isAdmin = actor.roles.some(r => r === 'ADMIN' || r === 'SUPER_ADMIN');
    return this.db.transaction(async tx => {
      const [app] = await tx.select().from(personalLoanApplications).where(eq(personalLoanApplications.id, id)).for('update');
      if (!app || (app.userId !== actor.id && !isAdmin)) throw new NotFoundException();
      if (!['SUBMITTED', 'REFERRED', 'UNDER_REVIEW', 'ACTION_REQUIRED'].includes(app.status)) throw new BadRequestException('This application can no longer be amended. Contact support if something is incorrect.');
      if (!Object.keys(dto).length) throw new BadRequestException('Enter at least one change.');
      if (!isAdmin && ('monthlyIncomeCents' in dto || 'monthlyExpensesCents' in dto)) throw new ForbiddenException('Update income and expenses in your profile so all applications use the same source of truth.');
      const [profile] = await tx.select().from(kycProfiles).where(eq(kycProfiles.userId, app.userId)).for('update');
      if (isAdmin && (dto.monthlyIncomeCents !== undefined || dto.monthlyExpensesCents !== undefined) && !profile) throw new BadRequestException('Applicant profile financial record is missing.');
      if (isAdmin && profile && (dto.monthlyIncomeCents !== undefined || dto.monthlyExpensesCents !== undefined)) {
        await tx.update(kycProfiles).set({ monthlyIncomeCents: dto.monthlyIncomeCents ?? profile.monthlyIncomeCents, monthlyExpensesCents: dto.monthlyExpensesCents ?? profile.monthlyExpensesCents }).where(eq(kycProfiles.userId, app.userId));
      }
      const monthlyIncomeCents = isAdmin ? dto.monthlyIncomeCents ?? profile?.monthlyIncomeCents ?? app.monthlyIncomeCents : app.monthlyIncomeCents;
      const monthlyExpensesCents = isAdmin ? dto.monthlyExpensesCents ?? profile?.monthlyExpensesCents ?? app.monthlyExpensesCents : app.monthlyExpensesCents;
      if (monthlyIncomeCents <= 0 || monthlyExpensesCents < 0) throw new BadRequestException('Income and expenses must remain valid profile values.');
      const values = { amountCents: dto.amountCents ?? app.amountCents, termMonths: dto.termMonths ?? app.termMonths, purpose: dto.purpose ?? app.purpose, monthlyIncomeCents, monthlyExpensesCents };
      const [updated] = await tx.update(personalLoanApplications).set({ ...values, offerId: null, vaultValidationId: null }).where(eq(personalLoanApplications.id, id)).returning();
      const changes = Object.fromEntries(Object.entries(values).filter(([key, value]) => value !== (app as any)[key]).map(([key, value]) => [key, { from: (app as any)[key], to: value }]));
      await tx.insert(applicationEvents).values({ applicationId: id, actorId: actor.id, status: app.status, message: `${isAdmin ? 'XTRA-CASH admin' : 'Applicant'} amended the application${Object.keys(changes).length ? `: ${Object.keys(changes).join(', ')}` : ''}.` });
      await this.audit.log(actor, 'personal_loan.amended', 'personal_loan_application', id, { adminIntervention: isAdmin, changes }, tx);
      return updated;
    });
  }
  async lenderList(u: AuthUser) {
    const org = await this.db.query.lenderOrgs.findFirst({ where: eq(lenderOrgs.ownerUserId, u.id) });
    if (!org) throw new NotFoundException();
    if (org.accreditationStatus !== 'ACCREDITED') return [];
    const grants=await this.db.select({id:applicationLenderAccess.applicationId}).from(applicationLenderAccess).where(and(eq(applicationLenderAccess.lenderId,org.id),eq(applicationLenderAccess.active,1)));
    const rows=await this.db.select({ ...applicationFields, firstName: users.firstName, lastName: users.lastName }).from(personalLoanApplications).innerJoin(users, eq(users.id, personalLoanApplications.userId)).where(or(inArray(personalLoanApplications.status,['SUBMITTED','REFERRED','UNDER_REVIEW','ACTION_REQUIRED']),eq(personalLoanApplications.lenderId, org.id),inArray(personalLoanApplications.id,grants.map(g=>g.id)))).orderBy(desc(personalLoanApplications.createdAt)).limit(100);
    return rows.map(r=>({...r,reviewNotes:r.lenderId===org.id?r.reviewNotes:null,accessMode:r.lenderId===org.id?'SELECTED_LENDER':'OPEN_POOL'}));
  }
  reviewApplications() { return this.db.select({ ...applicationFields, firstName: users.firstName, lastName: users.lastName }).from(personalLoanApplications).innerJoin(users, eq(users.id, personalLoanApplications.userId)).orderBy(desc(personalLoanApplications.createdAt)).limit(100); }
  async reviewApplication(actor: AuthUser, id: string, dto: ApplicationReviewDto) {
    const staff = actor.roles.some(r => r === 'ADMIN' || r === 'SUPER_ADMIN');
    const org = staff ? null : await this.db.query.lenderOrgs.findFirst({ where: eq(lenderOrgs.ownerUserId, actor.id) });
    if (!staff && (!org || org.accreditationStatus !== 'ACCREDITED')) throw new ForbiddenException();
    return this.db.transaction(async tx => {
      const [app] = await tx.select().from(personalLoanApplications).where(eq(personalLoanApplications.id, id)).for('update');
      if (!app || (!staff && app.lenderId !== org!.id && !['SUBMITTED','REFERRED','UNDER_REVIEW','ACTION_REQUIRED'].includes(app.status))) throw new NotFoundException();
      if (!['SUBMITTED','REFERRED','UNDER_REVIEW','ACTION_REQUIRED'].includes(app.status)) throw new BadRequestException('This application already has a decision and cannot be changed by review');
      const [updated] = await tx.update(personalLoanApplications).set({ status: dto.action === 'DECLINE' ? 'DECLINED' : 'UNDER_REVIEW', reviewNotes: dto.notes.trim(), reviewedAt: new Date() }).where(eq(personalLoanApplications.id, id)).returning();
      await this.audit.log(actor, 'personal_loan.reviewed', 'personal_loan_application', id, { action: dto.action }, tx);
      await tx.insert(applicationEvents).values({applicationId:id,actorId:actor.id,status:updated.status,message:dto.notes.trim()});
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
