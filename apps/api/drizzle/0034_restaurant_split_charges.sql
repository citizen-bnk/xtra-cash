ALTER TABLE restaurant_bill_items ADD COLUMN tax_cents integer NOT NULL DEFAULT 0
  CHECK (tax_cents >= 0 AND tax_cents <= amount_cents);
--> statement-breakpoint
ALTER TABLE restaurant_bill_items ADD COLUMN bill_tip_cents integer NOT NULL DEFAULT 0
  CHECK (bill_tip_cents >= 0 AND bill_tip_cents + tax_cents <= amount_cents);
