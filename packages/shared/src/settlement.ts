import type { PersonalLoanApplication } from "./types";
export interface MoneyConfiguration {
  enabled: boolean;
  agreementsEnabled: boolean;
  missing: string[];
  provider: string;
  currency: string;
}
export interface MoneyMovement {
  id: string;
  kind: "FUNDING" | "WITHDRAWAL";
  amountCents: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  failureCode: string | null;
  providerReference: string | null;
  userId: string;
  attempts: number;
}
export interface PersonalSettlement {
  humanReviewPending?:boolean;
  application: PersonalLoanApplication;
  agreement: null | {
    id: string;
    content: string;
    digest: string;
    status: string;
    expiresAt: string;
    acceptedAt: string | null;
    approvedBy: string;
    loanId: string | null;
    terms: {
      principalCents: number;
      monthlyInstallmentCents: number;
      totalRepayableCents: number;
      termMonths: number;
    };
  };
  timeline: {
    id: string;
    status: string;
    message: string;
    createdAt: string;
  }[];
  funding: MoneyMovement[];
  configuration: MoneyConfiguration;
}
export interface WalletState {
  availableCents: number;
  heldCents: number;
  configuration: MoneyConfiguration;
  beneficiaries: {
    id: string;
    bankCode: string;
    last4: string;
    status: string;
    verifiedAt: string | null;
  }[];
  movements: MoneyMovement[];
}
