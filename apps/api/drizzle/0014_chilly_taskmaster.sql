CREATE TABLE "loan_competition_consents" (
	"application_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"consent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "loan_competition_consents" ADD CONSTRAINT "loan_competition_consents_application_id_personal_loan_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."personal_loan_applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loan_competition_consents" ADD CONSTRAINT "loan_competition_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
INSERT INTO loan_demo_cases (id,title,stage,payload)
SELECT 'loan-training-' || lpad(n::text,2,'0'), title, stage,
jsonb_build_object('amountCents',n*50000,'termMonths',CASE WHEN n%3=0 THEN 12 WHEN n%3=1 THEN 3 ELSE 6 END,'purpose','Transport','nextActor',actor,'action',action,'description',description)
FROM (VALUES
(1,'Awaiting document review','SUBMITTED','Admin','Review identity and address','Training only: the request stays private before review.'),
(2,'Admin lender matching','UNDER_REVIEW','Admin','Match a lender','Choose a lender or invite several eligible lenders.'),
(3,'No existing matching product','NO_MATCH','Admin','Release for matching offers','Ask accredited lenders to create a suitable product after consent.'),
(4,'Competition consent required','CONSENT_REQUIRED','Applicant','Confirm competition consent','Administration cannot release the request before specific consent.'),
(5,'Open offer competition','COMPETITION_OPEN','Lender','Prepare a matching offer','Create or select a product. The first valid authorised offer wins.'),
(6,'More information needed','ACTION_REQUIRED','Applicant','Reply to information request','Supply the missing information through the approved process.'),
(7,'Offer ready to read','OFFERED','Applicant','Read the agreement','Review the quotation and decide whether to accept.'),
(8,'Accepted: funding needs release','ACCEPTED','Finance admin','Review funding release','A different authorised administrator releases funding when banking is active.'),
(9,'Provider funding confirmation pending','FUNDING_PENDING','Finance admin','Check funding status','Do not create debt or available wallet cash before provider success.'),
(10,'Wallet funded: demonstration','DISBURSED','Applicant','Manage wallet or request EFT','Training only. No real wallet balance was created.'),
(11,'EFT pending: demonstration','WITHDRAWAL_PENDING','Applicant','View transfer status','Pending transfers retain their cash hold until final provider outcome.'),
(12,'Human decline decision','DECLINED','Applicant','Read the decision','A human records the reason. AI does not automatically decline.')
) AS examples(n,title,stage,actor,action,description)
ON CONFLICT (id) DO NOTHING;
