ALTER TABLE lender_orgs ADD COLUMN fee_commitment_required boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE lender_orgs ALTER COLUMN fee_commitment_required SET DEFAULT true;
--> statement-breakpoint
CREATE TABLE lender_fee_commitments (
  lender_id text PRIMARY KEY REFERENCES lender_orgs(id),
  projected_fees_cents integer NOT NULL CHECK (projected_fees_cents > 0),
  commitment_cents integer GENERATED ALWAYS AS (round(projected_fees_cents::numeric * 0.03)::integer) STORED,
  agreement_reference text NOT NULL,
  forecast_basis text NOT NULL,
  payment_reference text UNIQUE,
  paid_at timestamptz,
  CHECK ((paid_at IS NULL) = (payment_reference IS NULL))
);
--> statement-breakpoint
CREATE FUNCTION enforce_lender_fee_commitment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.active AND EXISTS (
    SELECT 1 FROM lender_orgs WHERE id = NEW.lender_id AND fee_commitment_required
  ) AND NOT EXISTS (
    SELECT 1 FROM lender_fee_commitments WHERE lender_id = NEW.lender_id AND paid_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'The lender must pay its platform fee commitment before activating offers.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER loan_offer_fee_commitment_gate
BEFORE INSERT OR UPDATE OF active, lender_id ON loan_offers
FOR EACH ROW EXECUTE FUNCTION enforce_lender_fee_commitment();
