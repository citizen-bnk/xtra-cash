ALTER TABLE restaurant_merchants ADD COLUMN IF NOT EXISTS display_code text;
ALTER TABLE restaurant_merchants ADD COLUMN IF NOT EXISTS payout_mode text NOT NULL DEFAULT 'ON_DEMAND' CHECK (payout_mode IN ('ON_DEMAND','DAILY'));
ALTER TABLE restaurant_merchants ADD COLUMN IF NOT EXISTS portal_user_id text REFERENCES users(id);
ALTER TABLE restaurant_merchants ADD COLUMN IF NOT EXISTS bank_account_mask text;
ALTER TABLE restaurant_merchants ADD COLUMN IF NOT EXISTS bank_recipient_token text;
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_merchants_display_code_idx ON restaurant_merchants(display_code);
DO $$
DECLARE merchant_row record; candidate text;
BEGIN
  FOR merchant_row IN SELECT id FROM restaurant_merchants WHERE display_code IS NULL LOOP
    LOOP
      candidate := chr(65 + floor(random()*26)::int) || chr(65 + floor(random()*26)::int) || chr(65 + floor(random()*26)::int)
        || floor(random()*10)::int::text || floor(random()*10)::int::text || floor(random()*10)::int::text;
      BEGIN
        UPDATE restaurant_merchants SET display_code=candidate WHERE id=merchant_row.id;
        EXIT;
      EXCEPTION WHEN unique_violation THEN NULL;
      END;
    END LOOP;
  END LOOP;
END $$;
CREATE INDEX IF NOT EXISTS restaurant_merchants_portal_user_idx ON restaurant_merchants(portal_user_id);
CREATE TABLE IF NOT EXISTS restaurant_payouts (
  id text PRIMARY KEY,
  merchant_id text NOT NULL REFERENCES restaurant_merchants(id),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  payout_reference text NOT NULL UNIQUE,
  mode text NOT NULL CHECK (mode IN ('ON_DEMAND','DAILY')),
  status text NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED','PROCESSING','PAID','FAILED')),
  bank_reference text,
  failure_reason text,
  requested_by text REFERENCES users(id),
  confirmed_by text REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  paid_at timestamptz
);
CREATE INDEX IF NOT EXISTS restaurant_payouts_merchant_idx ON restaurant_payouts(merchant_id,created_at DESC);
CREATE TABLE IF NOT EXISTS restaurant_payout_items (
  payout_id text NOT NULL REFERENCES restaurant_payouts(id) ON DELETE CASCADE,
  item_id text NOT NULL UNIQUE REFERENCES restaurant_bill_items(id),
  PRIMARY KEY (payout_id,item_id)
);
