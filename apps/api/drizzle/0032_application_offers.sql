ALTER TABLE loan_offers ADD COLUMN application_id text REFERENCES personal_loan_applications(id);
--> statement-breakpoint
ALTER TABLE loan_offers ADD CONSTRAINT application_offer_personal_only
  CHECK (application_id IS NULL OR (product_type = 'PERSONAL' AND NOT welcome_only));
--> statement-breakpoint
CREATE INDEX application_offer_scope ON loan_offers(application_id) WHERE application_id IS NOT NULL;
--> statement-breakpoint
ALTER TABLE loan_offers ADD COLUMN welcome_fallback boolean NOT NULL DEFAULT false;
ALTER TABLE loan_offers ADD CONSTRAINT welcome_fallback_requires_bnpl
  CHECK (NOT welcome_fallback OR (welcome_only AND max_amount_per_user_cents <= 50000));
--> statement-breakpoint
CREATE UNIQUE INDEX one_platform_welcome_fallback ON loan_offers(welcome_fallback) WHERE welcome_fallback;
