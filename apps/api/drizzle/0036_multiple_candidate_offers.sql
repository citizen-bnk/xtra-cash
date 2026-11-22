DROP INDEX "candidate_offer_application_lender";
--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_offer_application_product" ON "application_candidate_offers" ("application_id", "lender_id", "offer_id");
--> statement-breakpoint
ALTER TABLE loan_offers ADD COLUMN funding_mode text NOT NULL DEFAULT 'PLATFORM' CHECK (funding_mode IN ('PLATFORM','LENDER_DEPOSIT'));
--> statement-breakpoint
-- Previously, only the manual offer endpoint created products with this name and application binding.
UPDATE loan_offers SET funding_mode='LENDER_DEPOSIT' WHERE application_id IS NOT NULL AND name='Personal loan' AND product_type='PERSONAL';
--> statement-breakpoint
CREATE OR REPLACE FUNCTION notify_wallet_deposit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' AND NEW.status='PENDING' THEN
  INSERT INTO activity_notifications(user_id,event_key,title,body,path,cta,owner)
  SELECT id,'wallet-review:'||NEW.id,'Wallet deposit awaiting confirmation',
   'A customer submitted a bank deposit reference. Reconcile the bank receipt before crediting funds.',
   '/money','Review deposit','Admin'
  FROM users WHERE status='ACTIVE' AND roles && ARRAY['ADMIN','SUPER_ADMIN']::role[] AND id<>NEW.user_id
  ON CONFLICT DO NOTHING;
 ELSIF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
  INSERT INTO activity_notifications(user_id,event_key,title,body,path,cta,owner)
  VALUES(NEW.user_id,'wallet-deposit:'||NEW.id||':'||NEW.status,
   CASE WHEN NEW.status='CONFIRMED' THEN 'Wallet top-up confirmed' ELSE 'Wallet deposit needs attention' END,
   CASE WHEN NEW.status='CONFIRMED' THEN 'Your confirmed deposit is available in your wallet.'
    ELSE 'Your bank deposit could not be confirmed. Open your wallet to view the update.' END,
   '/app/wallet','View wallet','Applicant') ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
