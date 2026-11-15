CREATE TABLE personal_checkout (
 application_id text PRIMARY KEY REFERENCES personal_loan_applications(id),
 user_id text NOT NULL REFERENCES users(id),
 repayment_session text NOT NULL,
 mandate_reference text,
 agreement_digest text,
 signature_png text,
 signed_at timestamptz
);
