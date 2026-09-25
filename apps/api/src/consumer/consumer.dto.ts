import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { EmploymentStatus, TxChannel } from '@xtra/shared';

const MAX_TX = 10_000_000; // R100 000 per transaction

export class KycDto {
  @Matches(/^\d{13}$/, { message: 'idNumber must be a 13-digit South African ID number' }) idNumber: string;
  @IsString() province: string;
  @IsEnum(EmploymentStatus) employmentStatus: EmploymentStatus;
  @IsOptional() @IsString() @MaxLength(120) employerName?: string;
  @IsInt() @Min(0) @Max(100_000_000) monthlyIncomeCents: number;
  @IsInt() @Min(0) @Max(100_000_000) monthlyExpensesCents: number;
  @IsBoolean() consentCreditCheck: boolean;
}

export class QuoteDto {
  @IsString() offerId: string;
  @IsInt() @Min(100) @Max(MAX_TX) amountCents: number;
}

export class PurchaseDto {
  @IsInt() @Min(100) @Max(MAX_TX) amountCents: number;
  @IsString() @MinLength(1) @MaxLength(120) merchantName: string;
  @IsOptional() @IsString() @MaxLength(60) merchantCategory?: string;
  @IsIn(Object.values(TxChannel)) channel: TxChannel;
  @IsString() @MinLength(8) @MaxLength(80) idempotencyKey: string;
}

export class AmountDto {
  @IsInt() @Min(100) @Max(MAX_TX) amountCents: number;
}
