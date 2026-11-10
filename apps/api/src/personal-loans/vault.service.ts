import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { and, desc, eq, gte } from 'drizzle-orm';
import { InjectDb } from '../common/db.module';
import { Db } from '../db/client';
import { lenderOrgs, personalLoanApplications, personalVerifications, users, vaultDocumentReviews } from '../db/schema';
import { SettingsService } from '../common/settings.service';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/auth';
import { encryptIdentity } from '../auth/identity-crypto';
import { FILE_STORAGE } from '../integrations/integrations.module';
import type { FileStorage } from '../integrations/storage';
import { Inject } from '@nestjs/common';
import { applicantVaults, vaultApplicationValidations, vaultDocuments, vaultLocationSamples, vaultProcessingJobs, type VaultDocumentType, type VaultPillar } from './vault.schema';
import type { CompleteVaultValidationDto, StartVaultValidationDto, VaultLocationDto } from './vault.dto';
import { applicationLenderAccess } from './lender-ai.schema';

const DAY = 86_400_000;
const ACCEPTED_MIME = ['application/pdf', 'image/jpeg', 'image/png'];

@Injectable()
export class VaultService {
  constructor(
    @InjectDb() private db: Db,
    private settings: SettingsService,
    private audit: AuditService,
    @Inject(FILE_STORAGE) private storage: FileStorage,
  ) {}

  /** Store documents uploaded in the loan application in the applicant's reusable vault. */
  async ingestApplicationDocuments(actor: AuthUser, files: { type: 'ID_DOCUMENT' | 'PROOF_OF_ADDRESS'; file: Express.Multer.File }[]) {
    const results: { type: string; storageKey: string; id: string; status: string }[] = [];
    for (const { type, file } of files) {
      const contentHash = createHash('sha256').update(file.buffer).digest('hex');
      const duplicate = await this.db.query.vaultDocuments.findFirst({ where: and(eq(vaultDocuments.userId, actor.id), eq(vaultDocuments.contentHash, contentHash)) });
      if (duplicate) { results.push({ type, storageKey: duplicate.storageKey, id: duplicate.id, status: duplicate.status }); continue; }
      const storageKey = await this.storage.put(file.buffer, file.originalname);
      const [document] = await this.db.transaction(async tx => {
        const [created] = await tx.insert(vaultDocuments).values({ userId: actor.id, type, originalName: file.originalname.slice(0, 200), storageKey, contentHash, status: 'PROCESSING', processingNote: 'Securely received in your profile vault. Automated document extraction is waiting for the OCR provider to be activated.' }).onConflictDoNothing().returning();
        if (created) {
          await tx.insert(vaultProcessingJobs).values({ documentId: created.id, kind: 'OCR', status: 'AWAITING_PROVIDER' });
          await this.audit.log(actor, 'vault.application_document_received', 'vault_document', created.id, { type, sizeBytes: file.size }, tx);
          return [created];
        }
        const existing = await tx.query.vaultDocuments.findFirst({ where: and(eq(vaultDocuments.userId, actor.id), eq(vaultDocuments.contentHash, contentHash)) });
        return existing ? [existing] : [];
      });
      if (!document) throw new BadRequestException('Could not link the uploaded document to your profile vault. Please retry.');
      results.push({ type, storageKey: document.storageKey, id: document.id, status: document.status });
    }
    return results;
  }

  private async lenderApplication(actor: AuthUser, applicationId: string) {
    if (!actor.roles.includes('LENDER')) throw new ForbiddenException('Lender access is required.');
    const [app] = await this.db.select().from(personalLoanApplications).where(eq(personalLoanApplications.id, applicationId));
    const [org] = await this.db.select().from(lenderOrgs).where(and(eq(lenderOrgs.ownerUserId, actor.id), eq(lenderOrgs.accreditationStatus, 'ACCREDITED')));
    if (!app || !org) throw new NotFoundException();
    const [grant] = await this.db.select().from(applicationLenderAccess).where(and(eq(applicationLenderAccess.applicationId, applicationId), eq(applicationLenderAccess.lenderId, org.id), eq(applicationLenderAccess.active, 1)));
    const open = ['SUBMITTED', 'REFERRED', 'UNDER_REVIEW', 'ACTION_REQUIRED'].includes(app.status);
    if (app.lenderId !== org.id && !grant && !open) throw new NotFoundException();
    return { app, org };
  }

  async lenderReviewPack(actor: AuthUser, applicationId: string) {
    const { app } = await this.lenderApplication(actor, applicationId);
    const [status, docs, reviews, verification] = await Promise.all([
      this.status(app.userId),
      this.db.select().from(vaultDocuments).where(eq(vaultDocuments.userId, app.userId)).orderBy(desc(vaultDocuments.createdAt)),
      this.db.select().from(vaultDocumentReviews).where(eq(vaultDocumentReviews.applicationId, applicationId)).orderBy(desc(vaultDocumentReviews.createdAt)),
      this.db.query.personalVerifications.findFirst({ where: eq(personalVerifications.userId, app.userId) }),
    ]);
    const evidence = [...docs.map(d => ({ id: d.id, type: d.type, name: d.originalName, status: d.status, processingNote: d.processingNote, createdAt: d.createdAt })),
      ...(verification?.identityFileKey && !docs.some(d => d.type === 'ID_DOCUMENT') ? [{ id: 'verification:identity', type: 'ID_DOCUMENT', name: 'Identity document', status: verification.status, processingNote: verification.reason, createdAt: verification.createdAt }] : []),
      ...(verification?.addressFileKey && !docs.some(d => d.type === 'PROOF_OF_ADDRESS') ? [{ id: 'verification:address', type: 'PROOF_OF_ADDRESS', name: 'Proof of address', status: verification.status, processingNote: verification.reason, createdAt: verification.createdAt }] : [])];
    return { application: { id: app.id, status: app.status, amountCents: app.amountCents, termMonths: app.termMonths }, pillars: status.pillars,
      documents: evidence.map(d => ({ ...d, reviews: reviews.filter(r => r.documentId === d.id) })) };
  }

  async lenderDocument(actor: AuthUser, applicationId: string, documentId: string) {
    const { app } = await this.lenderApplication(actor, applicationId);
    const doc = await this.db.query.vaultDocuments.findFirst({ where: and(eq(vaultDocuments.id, documentId), eq(vaultDocuments.userId, app.userId)) });
    let fileName = doc?.originalName, storageKey: string | null | undefined = doc?.storageKey;
    if (!doc && documentId.startsWith('verification:')) {
      const verification = await this.db.query.personalVerifications.findFirst({ where: eq(personalVerifications.userId, app.userId) });
      const kind = documentId.slice('verification:'.length);
      storageKey = kind === 'identity' ? verification?.identityFileKey : kind === 'address' ? verification?.addressFileKey : null;
      fileName = kind === 'identity' ? 'identity-document' : 'proof-of-address';
    }
    if (!storageKey || !fileName) throw new NotFoundException();
    await this.audit.log(actor, 'vault.lender_document_viewed', 'vault_document', documentId, { applicationId });
    return { doc: { originalName: fileName }, buffer: await this.storage.get(storageKey) };
  }

  async lenderDocumentReview(actor: AuthUser, applicationId: string, documentId: string, status: 'ACCEPTED' | 'REJECTED' | 'REVOKED', comment: string) {
    const { app } = await this.lenderApplication(actor, applicationId);
    let doc = await this.db.query.vaultDocuments.findFirst({ where: and(eq(vaultDocuments.id, documentId), eq(vaultDocuments.userId, app.userId)) });
    if (!doc && documentId === 'verification:identity') doc = await this.db.query.vaultDocuments.findFirst({ where: and(eq(vaultDocuments.userId, app.userId), eq(vaultDocuments.type, 'ID_DOCUMENT')) });
    if (!doc && documentId === 'verification:address') doc = await this.db.query.vaultDocuments.findFirst({ where: and(eq(vaultDocuments.userId, app.userId), eq(vaultDocuments.type, 'PROOF_OF_ADDRESS')) });
    if (!doc && !['verification:identity', 'verification:address'].includes(documentId)) throw new NotFoundException();
    await this.db.transaction(async tx => {
      const reviewDocumentId = doc?.id ?? documentId;
      await tx.insert(vaultDocumentReviews).values({ applicationId, userId: app.userId, documentId: reviewDocumentId, status, comment: comment.trim(), reviewerUserId: actor.id });
      if (doc) await tx.update(vaultDocuments).set({ status, processingNote: comment.trim() }).where(eq(vaultDocuments.id, doc.id));
      await this.audit.log(actor, `vault.document_${status.toLowerCase()}`, 'vault_document', reviewDocumentId, { applicationId, comment: comment.trim() }, tx);
    });
    return this.lenderReviewPack(actor, applicationId);
  }

  async runLenderEvaluation(actor: AuthUser, applicationId: string) {
    const { app } = await this.lenderApplication(actor, applicationId);
    const status = await this.status(app.userId);
    const pillars = status.pillars;
    const steps: { pillar: VaultPillar; status: string; prompt: string; reason: string }[] = [
      { pillar: 'ID', status: pillars.id.status, prompt: 'Review the identity evidence and confirm the applicant matches the submitted documents.', reason: 'Identity evidence and applicant details.' },
      { pillar: 'RISK', status: pillars.risk.status, prompt: 'Review available transaction history and identify unexplained risk indicators.', reason: 'Cash flow and existing repayment obligations.' },
      { pillar: 'INCOME', status: pillars.income.status, prompt: 'Compare declared income with the evidence currently available.', reason: 'Income and affordability evidence.' },
      { pillar: 'FRAUD', status: pillars.fraud.status, prompt: 'Review the current fraud and address consistency indicators.', reason: 'Potential identity or location anomalies.' },
    ];
    const [validation] = await this.db.insert(vaultApplicationValidations).values({ userId: app.userId, amountCents: app.amountCents, termMonths: app.termMonths, status: 'COMPLETED', model: 'LENDER_REVIEW_V1', result: { steps, pending: steps.filter(s => !['VERIFIED', 'CALCULATED', 'MONITORING'].includes(s.status)).map(s => s.pillar) }, expiresAt: new Date(Date.now() + 30 * DAY), completedAt: new Date() }).returning();
    await this.audit.log(actor, 'vault.lender_evaluation_run', 'personal_loan_application', applicationId, { validationId: validation.id, model: validation.model });
    return { validation, pillars };
  }

  private async ensure(userId: string) {
    const user = await this.db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) throw new NotFoundException();
    await this.db.insert(applicantVaults).values({ userId, probationStartedAt: user.createdAt }).onConflictDoNothing();
    return user;
  }

  private async syncLegacyVerificationDocuments(userId: string) {
    const verification = await this.db.query.personalVerifications.findFirst({ where: eq(personalVerifications.userId, userId) });
    if (!verification) return;
    const legacy = [
      { type: 'ID_DOCUMENT' as const, key: verification.identityFileKey, name: 'Identity document' },
      { type: 'PROOF_OF_ADDRESS' as const, key: verification.addressFileKey, name: 'Proof of address' },
    ];
    for (const item of legacy) {
      const [existingType] = await this.db.select({ id: vaultDocuments.id }).from(vaultDocuments).where(and(eq(vaultDocuments.userId, userId), eq(vaultDocuments.type, item.type))).limit(1);
      if (existingType) continue;
      try {
        const buffer = await this.storage.get(item.key), contentHash = createHash('sha256').update(buffer).digest('hex');
        const [duplicate] = await this.db.select({ id: vaultDocuments.id }).from(vaultDocuments).where(and(eq(vaultDocuments.userId, userId), eq(vaultDocuments.contentHash, contentHash))).limit(1);
        if (duplicate) continue;
        const [doc] = await this.db.insert(vaultDocuments).values({ userId, type: item.type, originalName: item.name, storageKey: item.key, contentHash, status: 'PROCESSING', processingNote: 'Securely linked from your existing verification profile. Automated extraction is waiting for the OCR provider to be activated.' }).onConflictDoNothing().returning();
        if (doc) await this.db.insert(vaultProcessingJobs).values({ documentId: doc.id, kind: 'OCR', status: 'AWAITING_PROVIDER' });
      } catch { /* Keep the verification record intact if a legacy file is unavailable. */ }
    }
  }

  async status(userId: string) {
    const user = await this.ensure(userId);
    await this.syncLegacyVerificationDocuments(userId);
    const [vault, verification, documents, settings] = await Promise.all([
      this.db.query.applicantVaults.findFirst({ where: eq(applicantVaults.userId, userId) }),
      this.db.query.personalVerifications.findFirst({ where: eq(personalVerifications.userId, userId) }),
      this.db.select({ id: vaultDocuments.id, type: vaultDocuments.type, originalName: vaultDocuments.originalName, status: vaultDocuments.status, processingNote: vaultDocuments.processingNote, createdAt: vaultDocuments.createdAt, observedFrom: vaultDocuments.observedFrom, observedTo: vaultDocuments.observedTo }).from(vaultDocuments).where(eq(vaultDocuments.userId, userId)).orderBy(desc(vaultDocuments.createdAt)),
      this.settings.get(),
    ]);
    const newest = (type: VaultDocumentType) => documents.find((d) => d.type === type);
    const identity = verification ? { status: verification.status, updatedAt: verification.createdAt } : newest('ID_DOCUMENT');
    const address = verification ? { status: verification.status, updatedAt: verification.createdAt } : newest('PROOF_OF_ADDRESS');
    const bank = newest('BANK_STATEMENT');
    const income = newest('PROOF_OF_INCOME');
    const required = [
      { key: 'identity', label: 'Identity document', supplied: !!identity, status: identity?.status ?? 'MISSING' },
      { key: 'address', label: 'Proof of address', supplied: !!address, status: address?.status ?? 'MISSING' },
      { key: 'bank', label: '3 months of bank statements', supplied: !!bank, status: bank?.status ?? 'MISSING' },
      { key: 'income', label: 'Proof of income', supplied: !!income, status: income?.status ?? 'MISSING' },
    ];
    const probationDays = settings.applicantProbationDays;
    const probationEndsAt = new Date(user.createdAt.getTime() + probationDays * DAY);
    const probationComplete = probationDays === 0 || probationEndsAt <= new Date();
    const fastTrackReady = required.every((item) => item.supplied);
    const eligible = probationComplete || fastTrackReady;
    const idVerified = verification?.status === 'VERIFIED';
    const statementProcessed = bank?.status === 'PROCESSED';
    const incomeProcessed = income?.status === 'PROCESSED';
    return {
      eligible,
      eligibilityBasis: probationComplete ? 'PROBATION_COMPLETE' : fastTrackReady ? 'FAST_TRACK_EVIDENCE' : 'PROBATION',
      probation: { days: probationDays, startedAt: user.createdAt, endsAt: probationEndsAt, complete: probationComplete, daysRemaining: probationComplete ? 0 : Math.max(1, Math.ceil((probationEndsAt.getTime() - Date.now()) / DAY)) },
      fastTrack: { ready: fastTrackReady, required },
      pillars: {
        id: { status: idVerified ? 'VERIFIED' : identity && address ? 'IN_REVIEW' : 'BUILDING', confidenceBps: idVerified ? 10000 : identity ? 3000 : 0 },
        risk: { status: statementProcessed ? 'CALCULATED' : bank ? 'PROCESSING' : 'BUILDING', score: vault?.riskScore ?? null, confidenceBps: vault?.riskConfidenceBps ?? 0 },
        income: { status: statementProcessed && incomeProcessed ? 'VERIFIED' : bank || income ? 'PROCESSING' : 'BUILDING', trueDisposableIncomeCents: vault?.trueDisposableIncomeCents ?? null, confidenceBps: vault?.incomeConfidenceBps ?? 0 },
        fraud: { status: vault?.fraudStatus ?? 'MONITORING', score: vault?.fraudScore ?? null, homeBase: vault?.homeBaseModel ?? { sampleCount: 0, confidenceBps: 0, addressConsistent: null } },
      },
      locationMonitoring: { enabled: !!vault?.locationConsentAt && !vault.locationConsentRevokedAt, consentAt: vault?.locationConsentAt ?? null },
      documents,
    };
  }

  async startValidation(actor: AuthUser, dto: StartVaultValidationDto) {
    const status = await this.status(actor.id);
    const steps: { pillar: VaultPillar; status: string; prompt: string; reason: string }[] = [
      { pillar: 'ID', status: status.pillars.id.status, prompt: status.pillars.id.status === 'VERIFIED' ? 'Confirm that your verified identity details are still current.' : 'Your identity evidence is incomplete or still under review. Add any clarification that may help the lender.', reason: 'Identity and address evidence must describe the same person.' },
      { pillar: 'RISK', status: status.pillars.risk.status, prompt: status.pillars.risk.score == null ? 'Transaction analysis is incomplete. You may add context about returned payments, missed debits or unusual transactions.' : 'Confirm that the risk summary reflects your recent banking behaviour.', reason: 'Unexplained transaction patterns may require lender review.' },
      { pillar: 'INCOME', status: status.pillars.income.status, prompt: status.pillars.income.trueDisposableIncomeCents == null ? 'Verified disposable income is not available yet. Add current income or expense context if useful.' : `Confirm that your verified disposable income of R${(status.pillars.income.trueDisposableIncomeCents / 100).toFixed(2)} is still representative.`, reason: 'Income evidence and bank deposits should agree.' },
      { pillar: 'FRAUD', status: status.pillars.fraud.status, prompt: 'Confirm that your identity, address and device activity belong to you. Explain any recent move or unusual location if relevant.', reason: 'Contradictory identity or address signals must be investigated, not automatically declined.' },
    ];
    const [check] = await this.db.insert(vaultApplicationValidations).values({ userId: actor.id, amountCents: dto.amountCents, termMonths: dto.termMonths, result: { steps }, expiresAt: new Date(Date.now() + DAY) }).returning();
    await this.audit.log(actor, 'vault.application_validation_started', 'vault_validation', check.id, { amountCents: dto.amountCents, termMonths: dto.termMonths });
    return check;
  }

  async completeValidation(actor: AuthUser, id: string, dto: CompleteVaultValidationDto) {
    const check = await this.db.query.vaultApplicationValidations.findFirst({ where: and(eq(vaultApplicationValidations.id, id), eq(vaultApplicationValidations.userId, actor.id)) });
    if (!check || check.expiresAt <= new Date()) throw new BadRequestException('This validation has expired. Start again.');
    if (check.status === 'COMPLETED') return check;
    const expected: VaultPillar[] = ['ID', 'RISK', 'INCOME', 'FRAUD'];
    if (new Set(dto.responses.map((r) => r.pillar)).size !== expected.length || expected.some((p) => !dto.responses.some((r) => r.pillar === p))) throw new BadRequestException('Confirm, answer or skip each verification pillar');
    for (const response of dto.responses) if (response.disposition === 'ANSWERED' && (response.answer?.trim().length ?? 0) < 3) throw new BadRequestException(`Add a short clarification for ${response.pillar}`);
    const pending = dto.responses.filter((r) => r.disposition === 'SKIPPED').map((r) => r.pillar);
    const [updated] = await this.db.update(vaultApplicationValidations).set({ status: 'COMPLETED', completedAt: new Date(), result: { ...(check.result as any), responses: dto.responses.map((r) => ({ ...r, answer: r.answer?.trim() })), pending } }).where(and(eq(vaultApplicationValidations.id, id), eq(vaultApplicationValidations.status, 'OPEN'))).returning();
    await this.audit.log(actor, 'vault.application_validation_completed', 'vault_validation', id, { pending }, undefined);
    return updated ?? check;
  }

  async assertEligible(userId: string, validationId?: string) {
    const status = await this.status(userId);
    const validation = validationId ? await this.db.query.vaultApplicationValidations.findFirst({ where: and(eq(vaultApplicationValidations.id, validationId), eq(vaultApplicationValidations.userId, userId), eq(vaultApplicationValidations.status, 'COMPLETED')) }) : null;
    if (validation && validation.expiresAt <= new Date()) throw new ForbiddenException('Your four-pillar validation has expired. Run it again.');
    if (!status.eligible && !validation) throw new ForbiddenException({
      message: `Your ${status.probation.days}-day eligibility period is still active. Add the missing vault evidence to fast-track your loan request.`,
      code: 'VAULT_PROBATION',
      vault: status,
    });
    return { status, validation };
  }

  async loanSnapshot(userId: string, validationId?: string) {
    const { status, validation } = await this.assertEligible(userId, validationId);
    return {
      capturedAt: new Date().toISOString(),
      eligibilityBasis: validation ? 'FOUR_PILLAR_VALIDATION' : status.eligibilityBasis,
      pillars: status.pillars,
      evidence: status.fastTrack.required.map(({ key, supplied, status: evidenceStatus }) => ({ key, supplied, status: evidenceStatus })),
      validation: validation ? { id: validation.id, model: validation.model, pending: validation.result.pending ?? [] } : null,
    };
  }

  async upload(actor: AuthUser, type: VaultDocumentType, file: Express.Multer.File, observedFrom?: string, observedTo?: string) {
    await this.ensure(actor.id);
    if (!file) throw new BadRequestException('Choose a document to upload');
    if (!ACCEPTED_MIME.includes(file.mimetype) || file.size > 10_000_000) throw new BadRequestException('Use a PDF, JPG or PNG under 10 MB');
    const prefix = file.buffer.subarray(0, 8).toString('hex');
    const valid = file.mimetype === 'application/pdf' ? file.buffer.subarray(0, 5).toString() === '%PDF-' : file.mimetype === 'image/png' ? prefix === '89504e470d0a1a0a' : prefix.startsWith('ffd8ff');
    if (!valid) throw new BadRequestException('The document content does not match its file type');
    // Statement coverage is determined from the document by the lender/analysis provider.
    // Keep legacy date fields optional for older clients, but never require them.
    const from = observedFrom ? new Date(observedFrom) : null, to = observedTo ? new Date(observedTo) : null;
    const contentHash = createHash('sha256').update(file.buffer).digest('hex');
    const duplicate = await this.db.query.vaultDocuments.findFirst({ where: and(eq(vaultDocuments.userId, actor.id), eq(vaultDocuments.contentHash, contentHash)) });
    if (duplicate) return this.status(actor.id);
    const storageKey = await this.storage.put(file.buffer, file.originalname);
    await this.db.transaction(async (tx) => {
      const [document] = await tx.insert(vaultDocuments).values({ userId: actor.id, type, originalName: file.originalname.slice(0, 200), storageKey, contentHash, status: 'PROCESSING', processingNote: 'Securely received. Automated extraction provider is awaiting activation.', observedFrom: from, observedTo: to }).returning();
      await tx.insert(vaultProcessingJobs).values({ documentId: document.id, kind: type === 'BANK_STATEMENT' ? 'TRANSACTION_ANALYSIS' : 'OCR', status: 'AWAITING_PROVIDER' });
      await this.audit.log(actor, 'vault.document_received', 'vault_document', document.id, { type, sizeBytes: file.size }, tx);
    });
    return this.status(actor.id);
  }

  async setLocationConsent(actor: AuthUser, enabled: boolean) {
    await this.ensure(actor.id);
    const now = new Date();
    await this.db.update(applicantVaults).set(enabled ? { locationConsentAt: now, locationConsentRevokedAt: null, updatedAt: now } : { locationConsentRevokedAt: now, updatedAt: now }).where(eq(applicantVaults.userId, actor.id));
    await this.audit.log(actor, enabled ? 'vault.location_consent_granted' : 'vault.location_consent_revoked', 'applicant_vault', actor.id, {});
    return this.status(actor.id);
  }

  async location(actor: AuthUser, dto: VaultLocationDto) {
    const vault = await this.db.query.applicantVaults.findFirst({ where: eq(applicantVaults.userId, actor.id) });
    if (!vault?.locationConsentAt || vault.locationConsentRevokedAt) throw new ForbiddenException('Enable optional location monitoring first');
    const observedAt = new Date(dto.observedAt);
    if (Math.abs(Date.now() - observedAt.getTime()) > 2 * DAY) throw new BadRequestException('Location sample is outside the accepted time window');
    const [latest] = await this.db.select({ observedAt: vaultLocationSamples.observedAt }).from(vaultLocationSamples).where(and(eq(vaultLocationSamples.userId, actor.id), gte(vaultLocationSamples.observedAt, new Date(Date.now() - 20 * 3_600_000)))).limit(1);
    if (latest) return this.status(actor.id);
    const encrypted = encryptIdentity(JSON.stringify({ latitude: dto.latitude, longitude: dto.longitude }));
    await this.db.transaction(async (tx) => {
      await tx.insert(vaultLocationSamples).values({ userId: actor.id, locationEncrypted: encrypted, accuracyMeters: dto.accuracyMeters, source: dto.source, observedAt });
      const samples = await tx.select({ id: vaultLocationSamples.id }).from(vaultLocationSamples).where(eq(vaultLocationSamples.userId, actor.id));
      await tx.update(applicantVaults).set({ homeBaseModel: { sampleCount: samples.length, confidenceBps: Math.min(9000, samples.length * 300), addressConsistent: null }, updatedAt: new Date() }).where(eq(applicantVaults.userId, actor.id));
      await this.audit.log(actor, 'vault.location_sample_received', 'applicant_vault', actor.id, { source: dto.source, accuracyMeters: dto.accuracyMeters }, tx);
    });
    return this.status(actor.id);
  }
}
