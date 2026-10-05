import { Equals, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
export class IdentitySignupDto {
  @IsIn(['ID', 'PASSPORT']) identityType: 'ID' | 'PASSPORT';
  @IsString() @MinLength(6) @MaxLength(20) identityNumber: string;
  @IsIn(['CONSUMER', 'LENDER', 'AFFILIATE']) accountType: 'CONSUMER' | 'LENDER' | 'AFFILIATE';
  @Equals(true) consent: boolean;
}
export class SocialStartDto extends IdentitySignupDto { @IsIn(['google', 'apple']) provider: 'google' | 'apple'; }
export class SocialFinishDto {
  @IsString() @MinLength(32) @MaxLength(100) state: string;
  @IsString() @MinLength(32) @MaxLength(100) binding: string;
  @IsString() @MinLength(1) @MaxLength(3000) code: string;
}
export class OtpStartDto extends IdentitySignupDto { @Matches(/^(\+27|0)[6-8]\d{8}$/) mobile: string; }
export class OtpFinishDto {
  @IsString() @MinLength(10) @MaxLength(80) challengeId: string;
  @Matches(/^\d{6}$/) code: string;
}
export class CompleteProfileDto {
  @IsString() @MinLength(1) @MaxLength(80) firstName: string;
  @IsString() @MinLength(1) @MaxLength(80) lastName: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) lenderName?: string;
}
