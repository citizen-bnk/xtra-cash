import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { and, desc, eq, gte } from 'drizzle-orm';
import { InjectDb } from '../common/db.module';
import { Db } from '../db/client';
import { personalVerifications, users } from '../db/schema';
import { SettingsService } from '../common/settings.service';
import { AuditService } from '../common/audit.service';
import type { AuthUser } from '../common/auth';
import { encryptIdentity } from '../auth/identity-crypto';
import { FILE_STORAGE } from '../integrations/integrations.module';
import type { FileStorage } from '../integrations/storage';
import { Inject } from '@nestjs/common';
import { applicantVaults, vaultApplicationValidations, vaultDocuments, vaultLocationSamples, vaultProcessingJobs, type VaultDocumentType, type VaultPillar } from './vault.schema';
import type { CompleteVaultValidationDto, StartVaultValidationDto, VaultLocationDto } from './vault.dto';

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

  private async ensure(userId: string) {
    const user = await this.db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) throw new NotFoundException();
    await this.db.insert(applicantVaults).values({ userId, probationStartedAt: user.createdAt }).onConflictDoNothing();
    return user;
  }

  async status(userId: string) {
    const user = await this.ensure(userId);
    const [vault, verification, documents, settings] = await Promise.all([
      this.db.query.applicantVaults.findFirst({ where: eq(applicantVaults.userId, userId) }),
      this.db.query.personalVerifications.findFirst({ where: eq(personalVerifications.userId, userId) }),
      this.db.select({ id: vaultDocuments.id, type: vaultDocuments.type, status: vaultDocuments.status, createdAt: vaultDocuments.createdAt, observedFrom: vaultDocuments.observedFrom, observedTo: vaultDocuments.observedTo }).from(vaultDocuments).where(eq(vaultDocuments.userId, userId)).orderBy(desc(vaultDocuments.createdAt)),
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
