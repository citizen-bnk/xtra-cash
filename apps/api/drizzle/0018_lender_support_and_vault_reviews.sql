CREATE TABLE IF NOT EXISTS lender_support_sessions (
  id text PRIMARY KEY,
  code_hash text NOT NULL UNIQUE,
  admin_user_id text NOT NULL REFERENCES users(id),
  admin_session_id text NOT NULL REFERENCES refresh_tokens(id),
  lender_user_id text NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lender_support_sessions_expiry_idx ON lender_support_sessions(expires_at);

CREATE TABLE IF NOT EXISTS vault_document_reviews (
  id text PRIMARY KEY,
  application_id text NOT NULL REFERENCES personal_loan_applications(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('ACCEPTED','REJECTED','REVOKED')),
  comment text NOT NULL,
  reviewer_user_id text NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vault_document_review_app_doc_created ON vault_document_reviews(application_id, document_id, created_at);

-- Repair legacy applicant profiles where loan data was saved only on the application.
-- The newest application is the source for previously missing self-declared finances.
WITH latest_applications AS (
  SELECT DISTINCT ON (user_id) user_id, monthly_income_cents, monthly_expenses_cents
  FROM personal_loan_applications
  ORDER BY user_id, created_at DESC
)
UPDATE kyc_profiles AS k
SET monthly_income_cents = CASE WHEN k.monthly_income_cents = 0 AND latest.monthly_income_cents > 0 THEN latest.monthly_income_cents ELSE k.monthly_income_cents END,
    monthly_expenses_cents = CASE WHEN k.monthly_expenses_cents = 0 AND latest.monthly_expenses_cents > 0 THEN latest.monthly_expenses_cents ELSE k.monthly_expenses_cents END,
    updated_at = now()
FROM latest_applications AS latest
WHERE k.user_id = latest.user_id
  AND ((k.monthly_income_cents = 0 AND latest.monthly_income_cents > 0)
    OR (k.monthly_expenses_cents = 0 AND latest.monthly_expenses_cents > 0));
