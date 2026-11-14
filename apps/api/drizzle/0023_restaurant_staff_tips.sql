ALTER TABLE restaurant_merchants ADD COLUMN IF NOT EXISTS tips_enabled boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS restaurant_staff (
  id text PRIMARY KEY,
  merchant_id text NOT NULL REFERENCES restaurant_merchants(id),
  user_id text NOT NULL REFERENCES users(id),
  employee_code text NOT NULL UNIQUE CHECK (employee_code ~ '^[A-Z]{3}[0-9]{3}$'),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','SUSPENDED')),
  shift_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (merchant_id,user_id)
);
CREATE INDEX IF NOT EXISTS restaurant_staff_user_idx ON restaurant_staff(user_id);
ALTER TABLE restaurant_bills ADD COLUMN IF NOT EXISTS waiter_id text REFERENCES restaurant_staff(id);
CREATE TABLE IF NOT EXISTS restaurant_tips (
  id text PRIMARY KEY,
  bill_id text NOT NULL REFERENCES restaurant_bills(id),
  waiter_id text NOT NULL REFERENCES restaurant_staff(id),
  payer_id text NOT NULL REFERENCES users(id),
  journal_id text NOT NULL UNIQUE REFERENCES ledger_journals(id),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS restaurant_tips_waiter_idx ON restaurant_tips(waiter_id,created_at DESC);
