import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsISO8601, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested, IsObject } from 'class-validator';
export class LocationTargetDto {
  @IsNumber() @Min(-90) @Max(90) latitude: number;
  @IsNumber() @Min(-180) @Max(180) longitude: number;
  @IsInt() @Min(50) @Max(5000) radiusMeters: number;
  @IsString() @MinLength(2) @MaxLength(160) label: string;
  @IsOptional() @IsString() @MaxLength(200) placeId?: string;
}
export class CampaignDto {
  @IsUUID() offerId: string;
  @IsString() @MinLength(2) @MaxLength(80) title: string;
  @IsString() @MinLength(5) @MaxLength(200) message: string;
  @IsISO8601() startsAt: string;
  @IsISO8601() endsAt: string;
}
export class CampaignStatusDto { @IsIn(['DRAFT', 'ACTIVE', 'PAUSED']) status: 'DRAFT' | 'ACTIVE' | 'PAUSED'; }
export class MarketingConsentDto { @IsBoolean() marketing: boolean; @IsBoolean() locationEnabled: boolean; }
export class MemberLocationDto {
  @IsNumber() @Min(-90) @Max(90) latitude: number;
  @IsNumber() @Min(-180) @Max(180) longitude: number;
  @IsNumber() @Min(0) @Max(1000) accuracy: number;
  @IsISO8601() capturedAt: string;
}
export class PushDeviceDto {
  @IsIn(['WEB', 'EXPO']) platform: 'WEB' | 'EXPO';
  @IsObject() payload: Record<string, unknown>;
}
export class CampaignEventDto { @IsIn(['OPEN', 'SHARE', 'APPLY']) kind: 'OPEN' | 'SHARE' | 'APPLY'; }
