ALTER TABLE payday_employers ADD COLUMN IF NOT EXISTS meeting_notes text;

CREATE TABLE IF NOT EXISTS payday_meeting_evidence (
  id text PRIMARY KEY,
  employee_id text NOT NULL REFERENCES users(id),
  employer_id text REFERENCES payday_employers(id),
  consent_declaration text NOT NULL,
  consent_recorded_at timestamptz NOT NULL DEFAULT now(),
  storage_key text NOT NULL REFERENCES stored_files(key),
  sha256 text NOT NULL,
  mime_type text NOT NULL,
  transcript text,
  notes_json jsonb,
  transcription_status text NOT NULL CHECK (transcription_status IN ('COMPLETE','PENDING','FAILED')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payday_meeting_employee_idx ON payday_meeting_evidence(employee_id,created_at DESC);
CREATE INDEX IF NOT EXISTS payday_meeting_employer_idx ON payday_meeting_evidence(employer_id,created_at DESC);
