CREATE TABLE user_signatures (
 user_id text PRIMARY KEY REFERENCES users(id),
 image_encrypted text NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE agreement_signatures (
 agreement_id text PRIMARY KEY REFERENCES personal_agreements(id),
 user_id text NOT NULL REFERENCES users(id),
 digest text NOT NULL,
 image_encrypted text NOT NULL,
 signed_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE wallet_deposits (
 id text PRIMARY KEY,
 user_id text NOT NULL REFERENCES users(id),
 amount_cents integer NOT NULL CHECK (amount_cents BETWEEN 100 AND 10000000),
 client_key text NOT NULL,
 reference text NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','CONFIRMED','REJECTED')),
 bank_reference text UNIQUE,
 note text,
 decided_by text REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 decided_at timestamptz,
 UNIQUE(user_id,client_key)
);
--> statement-breakpoint
CREATE TABLE activity_notifications (
 id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
 user_id text NOT NULL REFERENCES users(id),
 event_key text NOT NULL,
 application_id text REFERENCES personal_loan_applications(id),
 title text NOT NULL,
 body text NOT NULL,
 path text NOT NULL,
 cta text NOT NULL,
 owner text NOT NULL,
 read_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,event_key)
);
--> statement-breakpoint
CREATE INDEX activity_notifications_user_created ON activity_notifications(user_id,created_at DESC);
--> statement-breakpoint
CREATE TABLE notification_devices (
 id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
 user_id text NOT NULL REFERENCES users(id),
 endpoint_hash text NOT NULL UNIQUE,
 payload_encrypted text NOT NULL,
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE notification_deliveries (
 id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
 notification_id text NOT NULL REFERENCES activity_notifications(id),
 channel text NOT NULL CHECK(channel IN ('EMAIL','PUSH')),
 device_id text REFERENCES notification_devices(id),
 status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','SENDING','ACCEPTED','UNAVAILABLE','FAILED')),
 attempts integer NOT NULL DEFAULT 0,
 next_attempt timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz,
 provider_reference text,
 error_code text,
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX notification_email_once ON notification_deliveries(notification_id) WHERE channel='EMAIL';
--> statement-breakpoint
CREATE UNIQUE INDEX notification_push_once ON notification_deliveries(notification_id,device_id) WHERE channel='PUSH';
--> statement-breakpoint
CREATE FUNCTION enqueue_activity_notification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO notification_deliveries(notification_id,channel) VALUES(NEW.id,'EMAIL');
 INSERT INTO notification_deliveries(notification_id,channel,device_id)
 SELECT NEW.id,'PUSH',id FROM notification_devices WHERE user_id=NEW.user_id AND active;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER activity_notification_delivery AFTER INSERT ON activity_notifications
FOR EACH ROW EXECUTE FUNCTION enqueue_activity_notification();
--> statement-breakpoint
CREATE FUNCTION notify_loan_activity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE new_title text; new_body text; action_label text;
BEGIN
 IF TG_OP='INSERT' THEN
  INSERT INTO activity_notifications(user_id,event_key,application_id,title,body,path,cta,owner)
  SELECT l.owner_user_id,'submitted:'||NEW.id,NEW.id,'New loan request',
   'An applicant has submitted a loan request. Review the request and make an offer.',
   '/lender/applications/'||NEW.id,'View request','Lender'
  FROM lender_orgs l JOIN users u ON u.id=l.owner_user_id
  WHERE l.accreditation_status='ACCREDITED' AND u.status='ACTIVE' AND 'LENDER'=ANY(u.roles)
   AND l.owner_user_id<>NEW.user_id AND (NEW.lender_id IS NULL OR l.id=NEW.lender_id)
  ON CONFLICT DO NOTHING;
  new_title:='Loan request submitted'; new_body:='Your request is ready for lenders to consider.'; action_label:='View application';
 ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
  new_title:=CASE NEW.status WHEN 'OFFERED' THEN 'Your loan agreement is ready'
   WHEN 'ACCEPTED' THEN 'Your loan agreement is signed'
   WHEN 'DISBURSED' THEN 'Funds are in your wallet'
   WHEN 'ACTION_REQUIRED' THEN 'Your loan needs information'
   WHEN 'DECLINED' THEN 'Your loan decision is ready'
   WHEN 'FUNDING_FAILED' THEN 'Loan funding needs attention'
   WHEN 'FUNDING_PENDING' THEN 'Your loan funding is processing'
   WHEN 'CANCELLED' THEN 'Loan application cancelled' ELSE 'Loan application updated' END;
  new_body:=CASE NEW.status WHEN 'OFFERED' THEN 'Review the quotation and sign if you agree to the terms.'
   WHEN 'DISBURSED' THEN 'Your confirmed loan funds are available in your XTRA-CASH wallet.'
   WHEN 'ACCEPTED' THEN 'Your signed agreement is recorded. We will notify you when funding is confirmed.'
   ELSE 'Open your application to view its current status and next action.' END;
  action_label:='View application';
  IF NEW.status='ACCEPTED' THEN
   INSERT INTO activity_notifications(user_id,event_key,application_id,title,body,path,cta,owner)
   SELECT owner_user_id,'accepted:'||NEW.id,NEW.id,'Applicant signed your loan agreement',
    'The applicant accepted and signed. View the deposit reference and arrange funding.',
    '/lender/applications/'||NEW.id,'View signed loan','Lender'
   FROM lender_orgs WHERE id=NEW.lender_id ON CONFLICT DO NOTHING;
   INSERT INTO activity_notifications(user_id,event_key,application_id,title,body,path,cta,owner)
   SELECT id,'funding-required:'||NEW.id,NEW.id,'Loan awaiting lender deposit',
    'The applicant signed. Confirm the actual lender deposit when it arrives, then credit the wallet.',
    '/applications/'||NEW.id,'Review funding','Admin'
   FROM users WHERE status='ACTIVE' AND roles && ARRAY['ADMIN','SUPER_ADMIN']::role[]
    AND id<>NEW.user_id ON CONFLICT DO NOTHING;
  END IF;
 ELSE RETURN NEW;
 END IF;
 INSERT INTO activity_notifications(user_id,event_key,application_id,title,body,path,cta,owner)
 VALUES(NEW.user_id,'status:'||NEW.id||':'||NEW.status||':'||gen_random_uuid(),NEW.id,new_title,new_body,
 '/app/applications/'||NEW.id,action_label,'Applicant');
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER loan_activity_notifications AFTER INSERT OR UPDATE OF status ON personal_loan_applications
FOR EACH ROW EXECUTE FUNCTION notify_loan_activity();
--> statement-breakpoint
CREATE FUNCTION notify_candidate_offer() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO activity_notifications(user_id,event_key,application_id,title,body,path,cta,owner)
 SELECT user_id,'offer:'||NEW.id||':'||NEW.updated_at::text,NEW.application_id,'Your loan offer is ready',
  'A lender sent you an offer. Compare the terms and choose whether to continue.',
  '/app/applications/'||NEW.application_id,'View offers','Applicant'
 FROM personal_loan_applications WHERE id=NEW.application_id
 ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER candidate_offer_notification AFTER INSERT OR UPDATE ON application_candidate_offers
FOR EACH ROW WHEN (NEW.status='SUBMITTED') EXECUTE FUNCTION notify_candidate_offer();
--> statement-breakpoint
CREATE FUNCTION notify_wallet_deposit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  INSERT INTO activity_notifications(user_id,event_key,title,body,path,cta,owner)
  SELECT id,'wallet-review:'||NEW.id,'Wallet deposit awaiting confirmation',
   'A customer submitted a bank deposit reference. Reconcile the bank receipt before crediting funds.',
   '/money','Review deposit','Admin'
  FROM users WHERE status='ACTIVE' AND roles && ARRAY['ADMIN','SUPER_ADMIN']::role[] AND id<>NEW.user_id
  ON CONFLICT DO NOTHING;
 ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
  INSERT INTO activity_notifications(user_id,event_key,title,body,path,cta,owner)
  VALUES(NEW.user_id,'wallet-deposit:'||NEW.id||':'||NEW.status,
   CASE WHEN NEW.status='CONFIRMED' THEN 'Wallet top-up confirmed' ELSE 'Wallet deposit needs attention' END,
   CASE WHEN NEW.status='CONFIRMED' THEN 'Your confirmed deposit is available in your wallet.'
    ELSE 'Your bank deposit could not be confirmed. Open your wallet to view the update.' END,
   '/app/pay','View wallet','Applicant') ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER wallet_deposit_notification AFTER INSERT OR UPDATE OF status ON wallet_deposits
FOR EACH ROW EXECUTE FUNCTION notify_wallet_deposit();
