CREATE TABLE "work_assistant_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"mode" text DEFAULT 'MANUAL' NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"max_amount_rand" integer DEFAULT 5000 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_assistant_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"scope" text NOT NULL,
	"encrypted" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "work_assistant_preferences" ADD CONSTRAINT "work_assistant_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_assistant_tasks" ADD CONSTRAINT "work_assistant_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;