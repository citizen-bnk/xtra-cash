ALTER TABLE loan_offers ADD COLUMN welcome_only boolean NOT NULL DEFAULT false;
ALTER TABLE loan_offers ADD COLUMN income_multiple integer NOT NULL DEFAULT 0 CHECK (income_multiple BETWEEN 0 AND 20);
ALTER TABLE loan_offers ADD CONSTRAINT welcome_bnpl_only CHECK (NOT welcome_only OR product_type = 'BNPL');
--> statement-breakpoint
CREATE FUNCTION enforce_welcome_bnpl() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  welcome boolean;
  multiple integer;
  maximum integer;
  income integer;
BEGIN
  IF NEW.transaction_id IS NULL THEN RETURN NEW; END IF;
  SELECT welcome_only, income_multiple, max_amount_per_user_cents INTO welcome, multiple, maximum
    FROM loan_offers WHERE id = NEW.offer_id;
  IF welcome AND EXISTS (SELECT 1 FROM loans WHERE user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'The welcome offer is available for your first loan.' USING ERRCODE = 'PXC01';
  END IF;
  SELECT monthly_income_cents INTO income FROM kyc_profiles WHERE user_id = NEW.user_id AND status = 'VERIFIED';
  IF multiple > 0 AND (income IS NULL OR income::bigint < maximum::bigint * multiple) THEN
    RAISE EXCEPTION 'Your verified income does not meet this offer requirement.' USING ERRCODE = 'PXC01';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER welcome_bnpl_gate BEFORE INSERT ON loans
FOR EACH ROW EXECUTE FUNCTION enforce_welcome_bnpl();
--> statement-breakpoint
INSERT INTO loan_offers (
  id, lender_id, name, description, product_type, active, monthly_interest_rate_bps,
  term_months, initiation_fee_cents, monthly_service_fee_cents, min_amount_cents,
  max_amount_per_user_cents, min_monthly_income_cents, min_credit_score, min_age,
  max_age, employment_statuses, provinces, welcome_only, income_multiple
)
SELECT 'welcome-' || o.id, o.lender_id, 'Welcome BNPL',
  'Your first XTRA-CASH purchase. Review repayment terms before using credit.',
  'BNPL', true, o.monthly_interest_rate_bps, o.term_months, o.initiation_fee_cents,
  o.monthly_service_fee_cents, o.min_amount_cents, 50000,
  GREATEST(o.min_monthly_income_cents, 200000), o.min_credit_score, o.min_age,
  o.max_age, o.employment_statuses, o.provinces, true, 4
FROM loan_offers o
JOIN lender_capacity c ON c.lender_id = o.lender_id
JOIN lender_orgs l ON l.id = o.lender_id
JOIN audit_logs a ON a.entity_id = l.id AND a.action = 'lender.capacity_initialized'
WHERE l.accreditation_status = 'ACCREDITED' AND o.active AND o.product_type = 'BNPL'
  AND NOT o.welcome_only AND o.min_amount_cents <= 50000 AND o.max_amount_per_user_cents >= 50000
  AND c.bnpl_limit - c.bnpl_committed >= 50000 AND c.bnpl_customer_limit >= 50000
  AND NOT EXISTS (SELECT 1 FROM loan_offers w WHERE w.lender_id = l.id AND w.welcome_only)
ORDER BY o.monthly_interest_rate_bps, o.id LIMIT 1
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
CREATE FUNCTION require_welcome_offer() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.active AND NEW.product_type = 'PERSONAL'
    AND EXISTS (SELECT 1 FROM lender_orgs WHERE id = NEW.lender_id AND fee_commitment_required)
    AND NOT EXISTS (
      SELECT 1 FROM loan_offers o JOIN lender_capacity c ON c.lender_id = o.lender_id
      WHERE o.lender_id = NEW.lender_id AND o.active AND o.welcome_only
        AND c.bnpl_limit - c.bnpl_committed >= o.min_amount_cents
        AND c.bnpl_customer_limit >= o.min_amount_cents
    ) THEN
    RAISE EXCEPTION 'Activate a funded Welcome BNPL offer first.' USING ERRCODE = 'PXC01';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER lender_welcome_activation_gate BEFORE INSERT OR UPDATE OF active,product_type,lender_id ON loan_offers
FOR EACH ROW EXECUTE FUNCTION require_welcome_offer();
