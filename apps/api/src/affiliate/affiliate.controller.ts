import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { CurrentUser, type AuthUser } from '../common/auth';
import { AffiliateService, BankDto, PayoutDto } from './affiliate.service';

/** Any signed-in user can join the affiliate programme; endpoints check for an affiliate profile. */
@Controller('affiliate')
export class AffiliateController {
  constructor(private affiliates: AffiliateService) {}

  @Post('join')
  join(@CurrentUser() u: AuthUser) {
    return this.affiliates.join(u);
  }

  @Get('summary')
  summary(@CurrentUser() u: AuthUser) {
    return this.affiliates.summary(u.id);
  }

  @Get('referrals')
  referrals(@CurrentUser() u: AuthUser) {
    return this.affiliates.referrals(u.id);
  }

  @Get('commissions')
  commissions(@CurrentUser() u: AuthUser) {
    return this.affiliates.commissions(u.id);
  }

  @Get('payouts')
  payouts(@CurrentUser() u: AuthUser) {
    return this.affiliates.payouts(u.id);
  }

  @Post('payouts')
  requestPayout(@CurrentUser() u: AuthUser, @Body() dto: PayoutDto) {
    return this.affiliates.requestPayout(u, dto.amountCents);
  }

  @Put('bank')
  bank(@CurrentUser() u: AuthUser, @Body() dto: BankDto) {
    return this.affiliates.saveBank(u.id, dto);
  }
}
