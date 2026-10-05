import { Equals, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { EmploymentStatus, PROVINCES } from '@xtra/shared';
export class PrecheckDto {
  @IsIn(['ID', 'PASSPORT']) identityType: 'ID' | 'PASSPORT';
  @IsString() @MinLength(6) @MaxLength(20) identityNumber: string;
  @IsOptional() @IsInt() @Min(50000) @Max(10000000) amountCents?: number;
  @IsOptional() @IsInt() @Min(1) @Max(24) termMonths?: number;
  @IsBoolean() @Equals(true) consent: boolean;
}
export class PersonalApplicationDto {
  @IsInt() @Min(50000) @Max(10000000) amountCents: number;
  @IsInt() @Min(1) @Max(24) termMonths: number;
  @IsIn(['Home & repairs', 'Education', 'Medical', 'Transport', 'Debt consolidation', 'Other']) purpose: string;
  @IsInt() @Min(1) @Max(100000000) monthlyIncomeCents: number;
  @IsInt() @Min(0) @Max(100000000) monthlyExpensesCents: number;
  @IsBoolean() @Equals(true) consent: boolean;
  @IsString() @MinLength(8) @MaxLength(80) idempotencyKey: string;
  @IsOptional() @IsString() @MaxLength(80) offerId?: string;
}
export class VerificationDto {
  @IsIn(['ID', 'PASSPORT']) identityType: 'ID' | 'PASSPORT';
  @IsString() @MinLength(6) @MaxLength(20) identityNumber: string;
  @Matches(/^(\+27|0)[6-8]\d{8}$/) mobile: string;
  @IsString() @MinLength(10) @MaxLength(500) address: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsIn(PROVINCES as unknown as string[]) province: string;
  @IsEnum(EmploymentStatus) employmentStatus: EmploymentStatus;
  @Equals('true') consent: string;
}
export class VerificationDecisionDto {
  @IsBoolean() approve: boolean;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(500) reason?: string;
}
export class ApplicationReviewDto {
  @IsIn(['REVIEW', 'DECLINE']) action: 'REVIEW' | 'DECLINE';
  @IsString() @MinLength(3) @MaxLength(500) notes: string;
}
