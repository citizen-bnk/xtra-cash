import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, Public, Roles, type AuthUser } from '../common/auth';
import { CampaignDto, CampaignEventDto, CampaignStatusDto, MarketingConsentDto, MemberLocationDto, PushDeviceDto } from './marketing.dto';
import { MarketingService } from './marketing.service';

@Controller('lender/marketing') @Roles('LENDER')
export class LenderMarketingController {
  constructor(private service: MarketingService) {}
  @Get('campaigns') list(@CurrentUser() u: AuthUser) { return this.service.list(u.id); }
  @Post('campaigns') create(@CurrentUser() u: AuthUser, @Body() dto: CampaignDto) { return this.service.create(u, dto); }
  @Put('campaigns/:id/status') status(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: CampaignStatusDto) { return this.service.status(u, id, dto.status); }
  @Get('places') @Throttle({ default: { limit: 12, ttl: 60000 } }) places(@Query('q') q = '', @Query('lat') lat?: string, @Query('lng') lng?: string) { return this.service.places(q, lat === undefined ? undefined : Number(lat), lng === undefined ? undefined : Number(lng)); }
}
@Controller('marketing') @Roles('CONSUMER')
export class MemberMarketingController {
  constructor(private service: MarketingService) {}
  @Get('preferences') preferences(@CurrentUser() u: AuthUser) { return this.service.preferences(u.id); }
  @Put('preferences') consent(@CurrentUser() u: AuthUser, @Body() dto: MarketingConsentDto) { return this.service.consent(u, dto); }
  @Post('devices') device(@CurrentUser() u: AuthUser, @Body() dto: PushDeviceDto) { return this.service.device(u.id, dto); }
  @Delete('devices/:id') remove(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.service.removeDevice(u.id, id); }
  @Post('location') @Throttle({ default: { limit: 12, ttl: 60000 } }) location(@CurrentUser() u: AuthUser, @Body() dto: MemberLocationDto) { return this.service.nearby(u.id, dto); }
  @Get('regions') regions(@CurrentUser() u: AuthUser) { return this.service.regions(u.id); }
  @Get('campaigns/:id') details(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.service.memberDetails(u.id, id); }
  @Post('campaigns/:id/events') event(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: CampaignEventDto) { return this.service.event(u.id, id, dto.kind); }
}
@Controller('campaigns')
export class PublicCampaignController {
  constructor(private service: MarketingService) {}
  @Public() @Get(':id') details(@Param('id') id: string) { return this.service.details(id); }
}
