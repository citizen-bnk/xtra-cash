CREATE TABLE "auth_challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"secret_hash" text NOT NULL,
	"binding_hash" text NOT NULL,
	"payload" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_challenges_secret_hash_unique" UNIQUE("secret_hash")
);
--> statement-breakpoint
CREATE TABLE "login_identities" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"subject" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "personal_loan_applications" ADD COLUMN "review_notes" text;--> statement-breakpoint
ALTER TABLE "personal_loan_applications" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "identity_type" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "identity_encrypted" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "identity_hash" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "profile_complete" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "login_identities" ADD CONSTRAINT "login_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "login_provider_subject" ON "login_identities" USING btree ("provider","subject");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_identity_hash_unique" UNIQUE("identity_hash");