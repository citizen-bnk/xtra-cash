import { randomUUID } from 'crypto';
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from '../db/schema';

const id = () => text('id').primaryKey().$defaultFn(() => randomUUID());
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () => ts('created_at').notNull().defaultNow();

export type VaultDocumentType = 'ID_DOCUMENT' | 'PROOF_OF_ADDRESS' | 'BANK_STATEMENT' | 'PROOF_OF_INCOME';
export type VaultPillar = 'ID' | 'RISK' | 'INCOME' | 'FRAUD';

export const applicantVaults = pgTable('applicant_vaults', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  probationStartedAt: ts('probation_started_at').notNull(),
  identityStatus: text('identity_status').notNull().default('BUILDING'),
  riskScore: integer('risk_score'),
  riskConfidenceBps: integer('risk_confidence_bps').notNull().default(0),
  trueDisposableIncomeCents: integer('true_disposable_income_cents'),
  incomeConfidenceBps: integer('income_confidence_bps').notNull().default(0),
  fraudStatus: text('fraud_status').notNull().default('MONITORING'),
  fraudScore: integer('fraud_score'),
  locationConsentAt: ts('location_consent_at'),
  locationConsentRevokedAt: ts('location_consent_revoked_at'),
  homeBaseModel: jsonb('home_base_model').$type<{ sampleCount: number; confidenceBps: number; addressConsistent: boolean | null }>(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const vaultDocuments = pgTable('vault_documents', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').$type<VaultDocumentType>().notNull(),
  originalName: text('original_name').notNull(),
  storageKey: text('storage_key').notNull(),
  contentHash: text('content_hash').notNull(),
  status: text('status').notNull().default('RECEIVED'),
  processingNote: text('processing_note'),
  extracted: jsonb('extracted').$type<Record<string, unknown>>(),
  observedFrom: ts('observed_from'),
  observedTo: ts('observed_to'),
  processedAt: ts('processed_at'),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('vault_document_user_hash').on(t.userId, t.contentHash),
  index('vault_document_user_type').on(t.userId, t.type, t.createdAt),
]);

export const vaultProcessingJobs = pgTable('vault_processing_jobs', {
  id: id(),
  documentId: text('document_id').notNull().references(() => vaultDocuments.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  status: text('status').notNull().default('QUEUED'),
  attempts: integer('attempts').notNull().default(0),
  providerReference: text('provider_reference'),
  errorCode: text('error_code'),
  createdAt: createdAt(),
  startedAt: ts('started_at'),
  completedAt: ts('completed_at'),
}, (t) => [index('vault_job_status_created').on(t.status, t.createdAt)]);

export const vaultApplicationValidations = pgTable('vault_application_validations', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  amountCents: integer('amount_cents').notNull(),
  termMonths: integer('term_months').notNull(),
  status: text('status').notNull().default('OPEN'),
  model: text('model').notNull().default('RULES_V1'),
  result: jsonb('result').$type<{ steps: { pillar: VaultPillar; status: string; prompt: string; reason: string }[]; responses?: { pillar: VaultPillar; disposition: 'CONFIRMED' | 'ANSWERED' | 'SKIPPED'; answer?: string }[]; pending?: VaultPillar[] }>().notNull(),
  expiresAt: ts('expires_at').notNull(),
  completedAt: ts('completed_at'),
  createdAt: createdAt(),
}, (t) => [index('vault_validation_user_created').on(t.userId, t.createdAt)]);

/** Append-only derived facts. Raw evidence remains in private file storage. */
export const vaultFacts = pgTable('vault_facts', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  pillar: text('pillar').$type<VaultPillar>().notNull(),
  key: text('key').notNull(),
  value: jsonb('value').notNull(),
  confidenceBps: integer('confidence_bps').notNull().default(0),
  verified: integer('verified').notNull().default(0),
  sourceDocumentId: text('source_document_id').references(() => vaultDocuments.id),
  effectiveAt: ts('effective_at').notNull().defaultNow(),
  supersededAt: ts('superseded_at'),
  createdAt: createdAt(),
}, (t) => [index('vault_fact_user_pillar').on(t.userId, t.pillar, t.createdAt)]);

/** Exact coordinates are encrypted by the application; APIs expose only the aggregate model. */
export const vaultLocationSamples = pgTable('vault_location_samples', {
  id: id(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  locationEncrypted: text('location_encrypted').notNull(),
  accuracyMeters: integer('accuracy_meters').notNull(),
  source: text('source').notNull(),
  observedAt: ts('observed_at').notNull(),
  createdAt: createdAt(),
}, (t) => [index('vault_location_user_observed').on(t.userId, t.observedAt)]);
