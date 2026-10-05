import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { DocumentType, EmploymentStatus, PROVINCES } from '@xtra/shared';

export class LenderOrgDto {
  @IsString() @MinLength(2) @MaxLength(120) name: string;
  @IsOptional() @IsString() @MaxLength(120) tradingName?: string;
  @IsOptional() @IsString() @MaxLength(40) registrationNumber?: string;
  @IsOptional() @IsString() @MaxLength(40) ncrNumber?: string;
  @IsEmail() contactEmail: string;
  @IsString() @MinLength(10) @MaxLength(15) contactPhone: string;
}

export class SubmitAccreditationDto {
  @IsBoolean() assisted: boolean;
}

export class DocumentDto {
  @IsEnum(DocumentType) type: DocumentType;
}

export class FundingDto {
  @IsIn(['LOAD', 'WITHDRAWAL']) type: 'LOAD' | 'WITHDRAWAL';
  @IsInt() @Min(10_000) @Max(1_000_000_000) amountCents: number;
}

export class CriteriaDto {
  @IsInt() @Min(0) minMonthlyIncomeCents: number;
  @IsInt() @Min(0) @Max(999) minCreditScore: number;
  @IsInt() @Min(18) @Max(100) minAge: number;
  @IsInt() @Min(18) @Max(100) maxAge: number;
  @IsArray() @ArrayUnique() @IsEnum(EmploymentStatus, { each: true }) employmentStatuses: EmploymentStatus[];
  @IsArray() @ArrayUnique() @IsIn(PROVINCES as unknown as string[], { each: true }) provinces: string[];
}

export class OfferDto extends CriteriaDto {
  @IsOptional() @IsIn(['BNPL', 'PERSONAL']) productType?: 'BNPL' | 'PERSONAL';
  @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsInt() @Min(0) @Max(2_000) monthlyInterestRateBps: number;
  @IsInt() @Min(1) @Max(24) termMonths: number;
  @IsInt() @Min(0) @Max(200_000) initiationFeeCents: number;
  @IsInt() @Min(0) @Max(100_000) monthlyServiceFeeCents: number;
  @IsInt() @Min(5_000) minAmountCents: number;
  @IsInt() @Min(5_000) @Max(10_000_000) maxAmountPerUserCents: number;
}

import { PartialType } from '@nestjs/swagger';
export class UpdateOfferDto extends PartialType(OfferDto) {}
