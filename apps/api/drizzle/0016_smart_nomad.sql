CREATE TABLE "applicant_vaults" (
	"user_id" text PRIMARY KEY NOT NULL,
	"probation_started_at" timestamp with time zone NOT NULL,
	"identity_status" text DEFAULT 'BUILDING' NOT NULL,
	"risk_score" integer,
	"risk_confidence_bps" integer DEFAULT 0 NOT NULL,
	"true_disposable_income_cents" integer,
	"income_confidence_bps" integer DEFAULT 0 NOT NULL,
	"fraud_status" text DEFAULT 'MONITORING' NOT NULL,
	"fraud_score" integer,
	"location_consent_at" timestamp with time zone,
	"location_consent_revoked_at" timestamp with time zone,
	"home_base_model" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vault_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"original_name" text NOT NULL,
	"storage_key" text NOT NULL,
	"content_hash" text NOT NULL,
	"status" text DEFAULT 'RECEIVED' NOT NULL,
	"processing_note" text,
	"extracted" jsonb,
	"observed_from" timestamp with time zone,
	"observed_to" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vault_facts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"pillar" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"confidence_bps" integer DEFAULT 0 NOT NULL,
	"verified" integer DEFAULT 0 NOT NULL,
	"source_document_id" text,
	"effective_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vault_location_samples" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"location_encrypted" text NOT NULL,
	"accuracy_meters" integer NOT NULL,
	"source" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vault_processing_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'QUEUED' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"provider_reference" text,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "personal_loan_applications" ADD COLUMN "vault_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "applicant_vaults" ADD CONSTRAINT "applicant_vaults_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_documents" ADD CONSTRAINT "vault_documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_facts" ADD CONSTRAINT "vault_facts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_facts" ADD CONSTRAINT "vault_facts_source_document_id_vault_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."vault_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_location_samples" ADD CONSTRAINT "vault_location_samples_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_processing_jobs" ADD CONSTRAINT "vault_processing_jobs_document_id_vault_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."vault_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vault_document_user_hash" ON "vault_documents" USING btree ("user_id","content_hash");--> statement-breakpoint
CREATE INDEX "vault_document_user_type" ON "vault_documents" USING btree ("user_id","type","created_at");--> statement-breakpoint
CREATE INDEX "vault_fact_user_pillar" ON "vault_facts" USING btree ("user_id","pillar","created_at");--> statement-breakpoint
CREATE INDEX "vault_location_user_observed" ON "vault_location_samples" USING btree ("user_id","observed_at");--> statement-breakpoint
CREATE INDEX "vault_job_status_created" ON "vault_processing_jobs" USING btree ("status","created_at");--> statement-breakpoint
INSERT INTO "applicant_vaults" ("user_id", "probation_started_at")
SELECT "id", "created_at" FROM "users" WHERE 'CONSUMER' = ANY("roles")
ON CONFLICT ("user_id") DO NOTHING;
