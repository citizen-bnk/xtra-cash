// Mirrors the Prisma enums in apps/api/prisma/schema.prisma.
// Kept as const objects so they work in React Native, Next.js and NestJS alike.

export const Role = {
  CONSUMER: 'CONSUMER',
  LENDER: 'LENDER',
  AFFILIATE: 'AFFILIATE',
  ADMIN: 'ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const KycStatus = {
  NOT_STARTED: 'NOT_STARTED',
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  REJECTED: 'REJECTED',
} as const;
export type KycStatus = (typeof KycStatus)[keyof typeof KycStatus];

export const EmploymentStatus = {
  EMPLOYED_FULL_TIME: 'EMPLOYED_FULL_TIME',
  EMPLOYED_PART_TIME: 'EMPLOYED_PART_TIME',
  SELF_EMPLOYED: 'SELF_EMPLOYED',
  INFORMAL_TRADER: 'INFORMAL_TRADER',
  GIG_WORKER: 'GIG_WORKER',
  UNEMPLOYED: 'UNEMPLOYED',
  STUDENT: 'STUDENT',
  PENSIONER: 'PENSIONER',
} as const;
export type EmploymentStatus = (typeof EmploymentStatus)[keyof typeof EmploymentStatus];

export const EMPLOYMENT_LABELS: Record<EmploymentStatus, string> = {
  EMPLOYED_FULL_TIME: 'Employed full-time',
  EMPLOYED_PART_TIME: 'Employed part-time',
  SELF_EMPLOYED: 'Self-employed',
  INFORMAL_TRADER: 'Informal trader',
  GIG_WORKER: 'Gig / delivery worker',
  UNEMPLOYED: 'Unemployed',
  STUDENT: 'Student',
  PENSIONER: 'Pensioner',
};

export const PROVINCES = [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'North West',
  'Northern Cape',
  'Western Cape',
] as const;
export type Province = (typeof PROVINCES)[number];

export const AccreditationStatus = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  ACCREDITED: 'ACCREDITED',
  REJECTED: 'REJECTED',
  SUSPENDED: 'SUSPENDED',
} as const;
export type AccreditationStatus = (typeof AccreditationStatus)[keyof typeof AccreditationStatus];

export const DocumentType = {
  NCR_CERTIFICATE: 'NCR_CERTIFICATE',
  CIPC_REGISTRATION: 'CIPC_REGISTRATION',
  TAX_CLEARANCE: 'TAX_CLEARANCE',
  BANK_CONFIRMATION: 'BANK_CONFIRMATION',
  DIRECTOR_ID: 'DIRECTOR_ID',
  FICA_PROOF_OF_ADDRESS: 'FICA_PROOF_OF_ADDRESS',
} as const;
export type DocumentType = (typeof DocumentType)[keyof typeof DocumentType];

export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  NCR_CERTIFICATE: 'NCR registration certificate',
  CIPC_REGISTRATION: 'CIPC company registration',
  TAX_CLEARANCE: 'SARS tax clearance / TCS pin',
  BANK_CONFIRMATION: 'Bank account confirmation letter',
  DIRECTOR_ID: 'Director ID document',
  FICA_PROOF_OF_ADDRESS: 'FICA proof of address',
};

export const REQUIRED_DOCUMENTS: DocumentType[] = [
  'CIPC_REGISTRATION',
  'BANK_CONFIRMATION',
  'DIRECTOR_ID',
  'FICA_PROOF_OF_ADDRESS',
];

export const CardStatus = { ACTIVE: 'ACTIVE', FROZEN: 'FROZEN', CANCELLED: 'CANCELLED' } as const;
export type CardStatus = (typeof CardStatus)[keyof typeof CardStatus];

export const TxStatus = { APPROVED: 'APPROVED', DECLINED: 'DECLINED', REVERSED: 'REVERSED' } as const;
export type TxStatus = (typeof TxStatus)[keyof typeof TxStatus];

export const TxChannel = { ONLINE: 'ONLINE', IN_STORE: 'IN_STORE', MARKETPLACE: 'MARKETPLACE' } as const;
export type TxChannel = (typeof TxChannel)[keyof typeof TxChannel];

export const LoanStatus = {
  ACTIVE: 'ACTIVE',
  IN_ARREARS: 'IN_ARREARS',
  SETTLED: 'SETTLED',
  DEFAULTED: 'DEFAULTED',
} as const;
export type LoanStatus = (typeof LoanStatus)[keyof typeof LoanStatus];

export const InstallmentStatus = { DUE: 'DUE', PAID: 'PAID', OVERDUE: 'OVERDUE' } as const;
export type InstallmentStatus = (typeof InstallmentStatus)[keyof typeof InstallmentStatus];

export const FundingType = { LOAD: 'LOAD', WITHDRAWAL: 'WITHDRAWAL' } as const;
export type FundingType = (typeof FundingType)[keyof typeof FundingType];

export const FundingStatus = { PENDING: 'PENDING', CONFIRMED: 'CONFIRMED', REJECTED: 'REJECTED' } as const;
export type FundingStatus = (typeof FundingStatus)[keyof typeof FundingStatus];

export const CommissionType = {
  CONSUMER_ACTIVATION: 'CONSUMER_ACTIVATION',
  LENDER_ACCREDITED: 'LENDER_ACCREDITED',
  LOAN_ORIGINATION: 'LOAN_ORIGINATION',
} as const;
export type CommissionType = (typeof CommissionType)[keyof typeof CommissionType];

export const CommissionStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  PAID: 'PAID',
  REJECTED: 'REJECTED',
} as const;
export type CommissionStatus = (typeof CommissionStatus)[keyof typeof CommissionStatus];

export const PayoutStatus = {
  REQUESTED: 'REQUESTED',
  PAID: 'PAID',
  REJECTED: 'REJECTED',
} as const;
export type PayoutStatus = (typeof PayoutStatus)[keyof typeof PayoutStatus];
