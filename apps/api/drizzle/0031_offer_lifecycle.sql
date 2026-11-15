ALTER TABLE loan_offers ADD COLUMN suspended boolean NOT NULL DEFAULT false;
ALTER TABLE loan_offers ADD CONSTRAINT offer_suspended_inactive CHECK (NOT suspended OR NOT active);
--> statement-breakpoint
CREATE TABLE lender_offer_followers (
  offer_id text NOT NULL REFERENCES loan_offers(id),
  user_id text NOT NULL REFERENCES users(id),
  PRIMARY KEY (offer_id,user_id)
);
--> statement-breakpoint
CREATE TABLE lender_offer_updates (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  offer_id text NOT NULL REFERENCES loan_offers(id),
  user_id text NOT NULL REFERENCES users(id),
  application_id text,
  title text NOT NULL,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lender_offer_updates_user_created ON lender_offer_updates(user_id,created_at DESC);
--> statement-breakpoint
CREATE FUNCTION notify_lender_offer_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  heading text;
BEGIN
  IF (to_jsonb(OLD) - 'updated_at') = (to_jsonb(NEW) - 'updated_at') THEN RETURN NEW; END IF;
  IF NOT OLD.active AND NOT NEW.active AND OLD.suspended = NEW.suspended THEN RETURN NEW; END IF;
  heading := CASE WHEN NEW.suspended THEN 'Offer suspended'
    WHEN NOT NEW.active THEN 'Offer paused' WHEN NOT OLD.active THEN 'Offer available again'
    ELSE 'Offer terms updated' END;
  INSERT INTO lender_offer_updates (offer_id,user_id,application_id,title,description)
  SELECT NEW.id, a.user_id, a.id, heading,
    NEW.name || '. Review current terms or other available offers.'
  FROM personal_loan_applications a
  WHERE a.offer_id = NEW.id AND a.status IN ('SUBMITTED','REFERRED','UNDER_REVIEW','ACTION_REQUIRED','OFFERED');
  INSERT INTO lender_offer_updates (offer_id,user_id,title,description)
  SELECT NEW.id, f.user_id, heading, NEW.name || '. Check your current purchase credit.'
  FROM lender_offer_followers f WHERE f.offer_id = NEW.id
    AND NOT EXISTS (SELECT 1 FROM personal_loan_applications a WHERE a.user_id = f.user_id
      AND a.offer_id = NEW.id AND a.status IN ('SUBMITTED','REFERRED','UNDER_REVIEW','ACTION_REQUIRED','OFFERED'));
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER lender_offer_change_notification AFTER UPDATE ON loan_offers
FOR EACH ROW EXECUTE FUNCTION notify_lender_offer_change();
