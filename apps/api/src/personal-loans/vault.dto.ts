import { Equals, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class VaultDocumentDto {
  @IsIn(['ID_DOCUMENT', 'PROOF_OF_ADDRESS', 'BANK_STATEMENT', 'PROOF_OF_INCOME'])
  type: 'ID_DOCUMENT' | 'PROOF_OF_ADDRESS' | 'BANK_STATEMENT' | 'PROOF_OF_INCOME';
  @Equals('true') consent: string;
  @IsOptional() @IsDateString() observedFrom?: string;
  @IsOptional() @IsDateString() observedTo?: string;
}

export class VaultLocationConsentDto {
  @IsBoolean() enabled: boolean;
}

export class VaultLocationDto {
  @IsNumber() @Min(-90) @Max(90) latitude: number;
  @IsNumber() @Min(-180) @Max(180) longitude: number;
  @IsInt() @Min(1) @Max(5000) accuracyMeters: number;
  @IsDateString() observedAt: string;
  @IsIn(['FOREGROUND', 'BACKGROUND_DAILY']) source: 'FOREGROUND' | 'BACKGROUND_DAILY';
}

export class StartVaultValidationDto {
  @IsInt() @Min(50000) @Max(10000000) amountCents: number;
  @IsInt() @Min(1) @Max(24) termMonths: number;
}
class VaultValidationResponseDto {
  @IsIn(['ID', 'RISK', 'INCOME', 'FRAUD']) pillar: 'ID' | 'RISK' | 'INCOME' | 'FRAUD';
  @IsIn(['CONFIRMED', 'ANSWERED', 'SKIPPED']) disposition: 'CONFIRMED' | 'ANSWERED' | 'SKIPPED';
  @IsOptional() @IsString() @MaxLength(1000) answer?: string;
}
export class CompleteVaultValidationDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => VaultValidationResponseDto)
  responses: VaultValidationResponseDto[];
}
