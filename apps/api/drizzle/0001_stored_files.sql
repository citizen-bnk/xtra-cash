CREATE TABLE "stored_files" (
	"key" text PRIMARY KEY NOT NULL,
	"original_name" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"content" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
