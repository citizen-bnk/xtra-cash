import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail() email: string;
  /** South African mobile number, e.g. 0821234567 or +27821234567 */
  @Matches(/^(\+27|0)[6-8][0-9]{8}$/, { message: 'phone must be a valid South African mobile number' })
  phone: string;
  @IsString() @MinLength(8) @MaxLength(72) password: string;
  @IsString() @MinLength(1) @MaxLength(60) firstName: string;
  @IsString() @MinLength(1) @MaxLength(60) lastName: string;
  @IsIn(['CONSUMER', 'LENDER', 'AFFILIATE']) accountType: 'CONSUMER' | 'LENDER' | 'AFFILIATE';
  @IsOptional() @IsString() @MaxLength(20) referralCode?: string;
  @IsOptional() @IsString() @MaxLength(120) lenderName?: string;
}

export class LoginDto {
  /** Email or phone */
  @IsString() identifier: string;
  @IsString() password: string;
}

export class RefreshDto {
  @IsString() refreshToken: string;
}
