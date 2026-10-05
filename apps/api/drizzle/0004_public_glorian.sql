CREATE TABLE "passkeys" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"public_key" text NOT NULL,
	"counter" integer DEFAULT 0 NOT NULL,
	"transports" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rp_id" text NOT NULL,
	"name" text DEFAULT 'My passkey' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "service_drafts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"encrypted" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD COLUMN "authenticated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
UPDATE "refresh_tokens" SET "authenticated_at" = "created_at";--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD COLUMN "replacement_encrypted" text;--> statement-breakpoint
ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_drafts" ADD CONSTRAINT "service_drafts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
