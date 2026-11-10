CREATE TABLE IF NOT EXISTS personal_application_vault_documents (
  application_id text NOT NULL REFERENCES personal_loan_applications(id) ON DELETE CASCADE,
  document_id text NOT NULL REFERENCES vault_documents(id) ON DELETE CASCADE,
  linked_by text NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT personal_app_vault_document PRIMARY KEY (application_id, document_id)
);
CREATE INDEX IF NOT EXISTS personal_app_vault_app ON personal_application_vault_documents(application_id);

-- Preserve evidence already present in the applicant vault when the request was submitted.
INSERT INTO personal_application_vault_documents (application_id, document_id, linked_by, created_at)
SELECT a.id, d.id, a.user_id, a.created_at
FROM personal_loan_applications a
JOIN vault_documents d ON d.user_id = a.user_id AND d.created_at <= a.created_at
ON CONFLICT (application_id, document_id) DO NOTHING;
