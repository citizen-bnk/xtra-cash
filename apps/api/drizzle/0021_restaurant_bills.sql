CREATE TABLE IF NOT EXISTS restaurant_merchants (
  id text PRIMARY KEY,
  qr_code text NOT NULL UNIQUE,
  trading_name text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','SUSPENDED')),
  settlement_reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS restaurant_bills (
  id text PRIMARY KEY,
  share_token text NOT NULL UNIQUE,
  creator_id text NOT NULL REFERENCES users(id),
  merchant_id text REFERENCES restaurant_merchants(id),
  merchant_name text NOT NULL,
  bill_reference text NOT NULL,
  total_cents integer NOT NULL CHECK (total_cents > 0),
  service_day date NOT NULL DEFAULT ((now() AT TIME ZONE 'Africa/Johannesburg')::date),
  original_storage_key text REFERENCES stored_files(key),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','FUNDED','SETTLED','CANCELLED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  settled_at timestamptz
);
CREATE INDEX IF NOT EXISTS restaurant_bills_creator_idx ON restaurant_bills(creator_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_bills_merchant_reference_day_idx ON restaurant_bills(merchant_id,bill_reference,service_day) WHERE merchant_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS restaurant_bill_items (
  id text PRIMARY KEY,
  bill_id text NOT NULL REFERENCES restaurant_bills(id) ON DELETE CASCADE,
  label text NOT NULL,
  position integer NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  claimed_by text REFERENCES users(id),
  status text NOT NULL DEFAULT 'UNCLAIMED' CHECK (status IN ('UNCLAIMED','CLAIMED','PAYMENT_PENDING','PAID')),
  payment_reference text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS restaurant_bill_items_bill_idx ON restaurant_bill_items(bill_id);
CREATE TABLE IF NOT EXISTS restaurant_bill_participants (
  bill_id text NOT NULL REFERENCES restaurant_bills(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id),
  joined_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz,
  PRIMARY KEY (bill_id, user_id)
);
CREATE TABLE IF NOT EXISTS customer_receipts (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  bill_id text REFERENCES restaurant_bills(id),
  kind text NOT NULL CHECK (kind IN ('RESTAURANT_SHARE','PERSONAL_ARCHIVE')),
  title text NOT NULL,
  original_storage_key text REFERENCES stored_files(key),
  digitized_json jsonb,
  total_cents integer,
  emailed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_receipts_user_idx ON customer_receipts(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS restaurant_bill_notifications (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  bill_id text NOT NULL REFERENCES restaurant_bills(id),
  kind text NOT NULL CHECK (kind IN ('BILL_FUNDED','BILL_SETTLED')),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS restaurant_bill_notifications_user_idx ON restaurant_bill_notifications(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_bill_notifications_unique_idx ON restaurant_bill_notifications(user_id,bill_id,kind);
