CREATE TABLE personal_guarantees (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  application_id text NOT NULL REFERENCES personal_loan_applications(id),
  applicant_id text NOT NULL REFERENCES users(id),
  signer_id text NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK (kind IN ('FAMILY','EMPLOYER')),
  status text NOT NULL DEFAULT 'REVIEW' CHECK (status IN ('REVIEW','READY','SIGNED','DECLINED','CANCELLED')),
  principal_cents integer NOT NULL CHECK (principal_cents > 0),
  term_months integer NOT NULL CHECK (term_months > 0),
  lender_id text REFERENCES lender_orgs(id),
  employer_id text REFERENCES payday_employers(id),
  authority_reference text,
  terms text,
  digest text,
  expires_at timestamptz,
  signed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (applicant_id <> signer_id),
  CHECK (status NOT IN ('READY','SIGNED') OR (
    lender_id IS NOT NULL AND terms IS NOT NULL AND digest IS NOT NULL AND expires_at IS NOT NULL
    AND (kind = 'FAMILY' OR (employer_id IS NOT NULL AND authority_reference IS NOT NULL))
  )),
  CHECK (status <> 'SIGNED' OR signed_at IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX one_live_guarantee_per_application ON personal_guarantees(application_id)
  WHERE status IN ('REVIEW','READY','SIGNED');
--> statement-breakpoint
CREATE INDEX personal_guarantees_signer ON personal_guarantees(signer_id,created_at DESC);
CREATE INDEX personal_guarantees_lender ON personal_guarantees(lender_id) WHERE status = 'SIGNED';
--> statement-breakpoint
CREATE FUNCTION protect_signed_guarantee_terms() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM personal_guarantees g WHERE g.application_id=NEW.id AND g.status='SIGNED'
      AND (g.principal_cents<>NEW.amount_cents OR g.term_months<>NEW.term_months OR
        (NEW.lender_id IS NOT NULL AND NEW.lender_id<>g.lender_id))
  ) THEN
    RAISE EXCEPTION 'A signed guarantee fixes the application amount, term and lender.' USING ERRCODE='PXC01';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER protect_signed_guarantee_terms BEFORE UPDATE OF amount_cents,term_months,lender_id ON personal_loan_applications
FOR EACH ROW EXECUTE FUNCTION protect_signed_guarantee_terms();
