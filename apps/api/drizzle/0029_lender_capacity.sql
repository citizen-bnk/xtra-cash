CREATE TABLE lender_capacity (
  lender_id text PRIMARY KEY REFERENCES lender_orgs(id),
  bnpl_limit integer NOT NULL CHECK (bnpl_limit >= 0),
  personal_limit integer NOT NULL CHECK (personal_limit >= 0),
  guarantee_limit integer NOT NULL CHECK (guarantee_limit >= 0),
  bnpl_customer_limit integer NOT NULL CHECK (bnpl_customer_limit BETWEEN 0 AND bnpl_limit),
  bnpl_committed integer NOT NULL DEFAULT 0 CHECK (bnpl_committed BETWEEN 0 AND bnpl_limit),
  personal_committed integer NOT NULL DEFAULT 0 CHECK (personal_committed BETWEEN 0 AND personal_limit)
);
--> statement-breakpoint
CREATE TABLE lender_bnpl_usage (
  lender_id text REFERENCES lender_capacity(lender_id),
  user_id text REFERENCES users(id),
  committed integer NOT NULL CHECK (committed >= 0),
  PRIMARY KEY (lender_id, user_id)
);
--> statement-breakpoint
CREATE TABLE lender_agreement_reservations (
  agreement_id text PRIMARY KEY REFERENCES personal_agreements(id),
  lender_id text NOT NULL REFERENCES lender_capacity(lender_id),
  principal integer NOT NULL CHECK (principal > 0)
);
--> statement-breakpoint
CREATE FUNCTION reserve_lender_bnpl_capacity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  capacity lender_capacity%ROWTYPE;
  used integer;
BEGIN
  IF NEW.transaction_id IS NULL THEN RETURN NEW; END IF;
  PERFORM 1 FROM loan_offers WHERE id = NEW.offer_id AND lender_id = NEW.lender_id
    AND active AND product_type = 'BNPL' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The BNPL offer is no longer active.' USING ERRCODE = 'PXC01';
  END IF;
  SELECT * INTO capacity FROM lender_capacity WHERE lender_id = NEW.lender_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT committed INTO used FROM lender_bnpl_usage WHERE lender_id = NEW.lender_id AND user_id = NEW.user_id;
  IF NEW.principal_cents > capacity.bnpl_limit - capacity.bnpl_committed
    OR NEW.principal_cents > capacity.bnpl_customer_limit - COALESCE(used, 0) THEN
    RAISE EXCEPTION 'The lender BNPL limit has been reached.' USING ERRCODE = 'PXC01';
  END IF;
  UPDATE lender_capacity SET bnpl_committed = bnpl_committed + NEW.principal_cents WHERE lender_id = NEW.lender_id;
  INSERT INTO lender_bnpl_usage VALUES (NEW.lender_id, NEW.user_id, NEW.principal_cents)
  ON CONFLICT (lender_id,user_id) DO UPDATE SET committed = lender_bnpl_usage.committed + excluded.committed;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER lender_bnpl_capacity_gate BEFORE INSERT ON loans
FOR EACH ROW EXECUTE FUNCTION reserve_lender_bnpl_capacity();
--> statement-breakpoint
CREATE FUNCTION reserve_lender_personal_capacity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  capacity lender_capacity%ROWTYPE;
  amount integer := (NEW.terms->>'principalCents')::integer;
BEGIN
  IF OLD.status = 'OFFERED' AND NEW.status = 'ACCEPTED' THEN
    PERFORM 1 FROM lender_orgs WHERE id = NEW.lender_id AND accreditation_status = 'ACCREDITED' FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The lender is no longer accepting agreements.' USING ERRCODE = 'PXC01';
    END IF;
    PERFORM 1 FROM loan_offers WHERE id = NEW.terms->>'offerId' AND lender_id = NEW.lender_id
      AND active AND product_type = 'PERSONAL' FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The personal loan offer is no longer active.' USING ERRCODE = 'PXC01';
    END IF;
    SELECT * INTO capacity FROM lender_capacity WHERE lender_id = NEW.lender_id FOR UPDATE;
    IF FOUND THEN
      IF amount > capacity.personal_limit - capacity.personal_committed THEN
        RAISE EXCEPTION 'The lender personal loan allocation has been reached.' USING ERRCODE = 'PXC01';
      END IF;
      UPDATE lender_capacity SET personal_committed = personal_committed + amount WHERE lender_id = NEW.lender_id;
      INSERT INTO lender_agreement_reservations VALUES (NEW.id, NEW.lender_id, amount);
    END IF;
  END IF;
  IF OLD.status = 'ACCEPTED' AND NEW.status = 'CANCELLED' THEN
    DELETE FROM lender_agreement_reservations WHERE agreement_id = NEW.id RETURNING principal INTO amount;
    IF FOUND THEN
      UPDATE lender_capacity SET personal_committed = personal_committed - amount WHERE lender_id = NEW.lender_id;
    END IF;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER lender_personal_capacity_gate AFTER UPDATE OF status ON personal_agreements
FOR EACH ROW EXECUTE FUNCTION reserve_lender_personal_capacity();
--> statement-breakpoint
-- Initialise one eligible live lender using up to R200,000 of reconciled lender funds.
WITH candidate AS (
  SELECT l.id, LEAST(l.available_cents, 20000000) AS pool
  FROM lender_orgs l
  JOIN users u ON u.id = l.owner_user_id
  WHERE l.accreditation_status = 'ACCREDITED'
    AND l.ncr_number IS NOT NULL
    AND u.status = 'ACTIVE'
    AND l.available_cents >= 1600000
    AND concat_ws(' ', l.name, l.contact_email, l.ncr_number) !~* '(demo|sample|test|\.invalid|example\.)'
    AND (NOT l.fee_commitment_required OR EXISTS (
      SELECT 1 FROM lender_fee_commitments c WHERE c.lender_id = l.id AND c.paid_at IS NOT NULL
    ))
    AND EXISTS (
      SELECT 1 FROM lender_funding f JOIN ledger_journals j ON j.ref_id = f.id AND j.type = 'lender_load'
      WHERE f.lender_id = l.id AND f.type = 'LOAD' AND f.status = 'CONFIRMED' AND f.decided_by_id IS NOT NULL
    )
    AND l.available_cents = (
      SELECT COALESCE(-SUM(e.amount_cents),0) FROM ledger_entries e WHERE e.account = 'liability:lender_funds:' || l.id
    )
    AND NOT EXISTS (SELECT 1 FROM personal_agreements a WHERE a.lender_id = l.id AND a.status = 'ACCEPTED')
    AND EXISTS (SELECT 1 FROM loan_offers o WHERE o.lender_id = l.id AND o.active AND o.product_type = 'BNPL' AND o.min_amount_cents <= 150000)
    AND EXISTS (SELECT 1 FROM loan_offers o WHERE o.lender_id = l.id AND o.active AND o.product_type = 'PERSONAL' AND o.min_amount_cents <= LEAST(l.available_cents, 20000000) / 2)
  ORDER BY l.available_cents DESC, l.id
  LIMIT 1
  FOR UPDATE OF l
), inserted AS (
  INSERT INTO lender_capacity (lender_id, bnpl_limit, personal_limit, guarantee_limit, bnpl_customer_limit)
  SELECT id, pool / 4, pool - pool / 4 - pool / 8, pool / 8, 150000 FROM candidate
  ON CONFLICT (lender_id) DO NOTHING
  RETURNING *
)
INSERT INTO audit_logs (id, action, entity_type, entity_id, meta)
SELECT 'lender-capacity-bootstrap-' || lender_id, 'lender.capacity_initialized', 'lender', lender_id,
  jsonb_build_object('bnplLimit', bnpl_limit, 'personalLimit', personal_limit,
    'guaranteeLimit', guarantee_limit, 'bnplCustomerLimit', bnpl_customer_limit, 'basis', 'confirmed_reconciled_lender_funds')
FROM inserted;
