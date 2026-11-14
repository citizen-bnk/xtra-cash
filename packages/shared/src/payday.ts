/** XTRA Payday is an employer distribution channel within XTRA-CASH. */
export const PAYDAY_STAGES = ['NEW', 'CONTACTED', 'QUALIFIED', 'MEETING', 'PROPOSAL', 'SIGNED', 'PAYROLL_TESTING', 'ACTIVE', 'SUSPENDED', 'LOST'] as const;
export type PaydayStage = typeof PAYDAY_STAGES[number];
export const PAYDAY_POLICY = { version: 'ZA-GAUTENG-2026-01', commissionCents: 200000, bufferCents: 40000, onboardingCents: 60000, basicCents: 550000, weeklyHours: 40 } as const;
export interface PaydayLeadInput {
  clientKey: string; legalName: string; registrationNumber: string; contactName: string;
  contactChannel: string; address: string; headcount: number; permissionReference: string;
  nextAction: string; followUpAt: string; ownerId?: string;
}
export interface PaydayVisitInput { clientKey: string; employerId: string; outcome: string; notes: string; nextAction: string; followUpAt: string }
export interface PaydayEmployer extends Omit<PaydayLeadInput, 'clientKey'> {
  meetingNotes?: string | null;
  id: string; ownerId: string; stage: PaydayStage; version: number; createdAt: string;
  agreementReference: string | null; lenderReference: string | null; payrollReference: string | null;
  policyVersion: string; commissionCents: number; bufferCents: number; onboardingCents: number;
}
export interface PaydayRecovery {
  receiptsCents: number; additionalCostsCents: number; contributionCents: number;
  thresholdCents: number; remainingCents: number; ready: boolean; onboardingReady: boolean;
  unverifiedReceipts: number; exposureCents: number;
}
export interface PaydayAward { id: string; employerId: string; repId: string; amountCents: number; approvedBy: string; approvedAt: string; paidBy: string | null; paidAt: string | null; paymentReference: string | null }
export interface PaydayEntry { id: string; employerId: string; kind: 'RECEIPT' | 'COST' | 'REVERSAL'; amountCents: number; reference: string; evidence: string; lenderId: string | null; createdBy: string; verifiedBy: string | null; rejectedAt:string|null; settledAt: string; reversesId: string | null }
export interface PaydayVisit extends PaydayVisitInput { id: string; repId: string; createdAt: string }
export interface PaydayDetail { employer: PaydayEmployer; recovery: PaydayRecovery; visits: PaydayVisit[]; entries: PaydayEntry[]; award: PaydayAward | null }
export interface PaydayKit { id: string; userId: string; item: string; quantity: number; issuedAt: string; acknowledgedAt: string | null; returnedAt: string | null }
export interface PaydayList { items: (PaydayEmployer & { recovery: PaydayRecovery; award: PaydayAward | null })[]; total: number; page: number; totalPages: number }
export interface PaydayEmployee {
  userId:string; employeeNumber:string; territory:string; status:'ONBOARDING'|'ACTIVE'|'INACTIVE';
  basicCents:number; weeklyHours:number; startDate:string; employmentReference:string;
  emergencyContact:string|null; passwordChangeRequired:boolean; onboardingAcknowledgedAt:string|null;
}
export interface PaydayMe extends PaydayEmployee { firstName:string; lastName:string; email:string|null; phone:string|null; trainingComplete:boolean; policy:typeof PAYDAY_POLICY }
export interface PaydayCourse { id:string; title:string; content:string; required:boolean; revision:number; completed:boolean }
export interface PaydayStatement {
  id:string; userId:string; period:string; basicCents:number; otherCents:number; commissionCents:number;
  deductions:{label:string;cents:number}[]; netCents:number; status:'DRAFT'|'PUBLISHED'|'PAID'|'CANCELED';
  payrollEvidence:string; createdBy:string; approvedBy:string|null; paidAt:string|null; paymentReference:string|null;
}
export interface PaydayEmployeeRow { employee:PaydayEmployee; user:{id:string;firstName:string;lastName:string;email:string|null} }
export interface PaydayEmployeeDetail { employee:PaydayEmployee; user:{firstName:string;lastName:string;email:string|null}; trainingComplete:boolean; completions:{moduleId:string;revision:number;createdAt:string}[]; kit:PaydayKit[]; statements:PaydayStatement[]; earnedAwards:(PaydayAward&{statementId:string|null})[] }
