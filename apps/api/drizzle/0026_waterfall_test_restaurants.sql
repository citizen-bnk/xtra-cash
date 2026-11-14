ALTER TABLE restaurant_merchants
  ADD COLUMN IF NOT EXISTS is_training boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS qr_checked_at timestamptz;

ALTER TABLE restaurant_merchants ADD CONSTRAINT restaurant_training_no_settlement
  CHECK (NOT is_training OR (bank_recipient_token IS NULL AND settlement_reference IS NULL AND portal_user_id IS NULL));

-- These fixtures have no payout account or settlement reference.
INSERT INTO restaurant_merchants (id, qr_code, display_code, trading_name, status, is_training)
VALUES
  ('8466a511-32ab-4f49-8d22-001900001001', '000000000000000000000000000000000001', '123ABC', 'Casa Bella Mall of Africa · TEST', 'ACTIVE', true),
  ('8466a511-32ab-4f49-8d22-001900001002', '000000000000000000000000000000000002', '234BCD', 'Doppio Zero Mall of Africa · TEST', 'ACTIVE', true),
  ('8466a511-32ab-4f49-8d22-001900001003', '000000000000000000000000000000000003', '345CDE', 'Ocean Basket Mall of Africa · TEST', 'ACTIVE', true),
  ('8466a511-32ab-4f49-8d22-001900001004', '000000000000000000000000000000000004', '456DEF', 'RocoMamas Mall of Africa · TEST', 'ACTIVE', true)
ON CONFLICT (id) DO NOTHING;
