import { Body, Controller, Get, Headers, NotFoundException, Param, Post, Put } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { CurrentUser, Public, Roles, type AuthUser } from '../common/auth';
import { RestaurantPayoutService } from './restaurant-payout.service';

@Controller('restaurant-portal')
export class RestaurantPortalController {
  constructor(private service: RestaurantPayoutService) {}
  @Get() dashboard(@CurrentUser() user: AuthUser) { return this.service.dashboard(user.id, user.roles); }
  @Post('payouts') request(@CurrentUser() user: AuthUser, @Body() body: { merchantId: string }) { return this.service.requestPayout(user.id, user.roles, body.merchantId); }
  @Put('payout-mode') mode(@CurrentUser() user: AuthUser, @Body() body: { merchantId: string; mode: string }) { return this.service.setPayoutMode(user.id, body.merchantId, body.mode); }
  @Put('tips') tips(@CurrentUser() user: AuthUser, @Body() body: { merchantId: string; enabled: boolean }) { return this.service.setTips(user.id, body.merchantId, body.enabled); }
  @Post('staff') staff(@CurrentUser() user: AuthUser, @Body() body: { merchantId: string; email: string }) { return this.service.linkStaff(user.id, body.merchantId, body.email); }
  @Get('staff/:merchantId') listStaff(@CurrentUser() user: AuthUser, @Param('merchantId') merchantId: string) { return this.service.listStaff(user.id, merchantId); }
}

@Controller('restaurant-staff')
export class RestaurantStaffController {
  constructor(private service: RestaurantPayoutService) {}
  @Get('me') me(@CurrentUser() user: AuthUser) { return this.service.staffDashboard(user.id); }
  @Post('shift') shift(@CurrentUser() user: AuthUser) { return this.service.startShift(user.id); }
}

@Controller('admin/restaurant-merchants') @Roles('ADMIN', 'SUPER_ADMIN')
export class RestaurantAdminController {
  constructor(private service: RestaurantPayoutService) {}
  @Get() list() { return this.service.listMerchants(); }
  @Post() create(@Body() body: { tradingName: string; portalEmail: string; settlementReference?: string; bankAccountMask?: string; bankRecipientToken?: string }) { return this.service.createMerchant(body); }
  @Get(':id') dashboard(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.dashboard(user.id, user.roles, id); }
  @Put(':id') configure(@Param('id') id: string, @Body() body: { status?: string; qrChecked?: boolean; payoutMode?: string; settlementReference?: string; bankAccountMask?: string; bankRecipientToken?: string; portalEmail?: string }) { return this.service.configureMerchant(id, body); }
  @Post(':id/payouts') request(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.requestPayout(user.id, user.roles, id); }
  @Post('payouts/:id/record-bank-outcome') outcome(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: { paid: boolean; bankReference?: string; note?: string }) { return this.service.recordBankOutcome(id, body.paid === true, body.bankReference ?? '', body.note, user.id); }
}

@Public() @Controller('jobs/restaurant-payouts')
export class RestaurantPayoutJobController {
  constructor(private service: RestaurantPayoutService) {}
  @Get() daily(@Headers('authorization') authorization?: string) {
    const secret = process.env.CRON_SECRET;
    if (!secret) throw new NotFoundException();
    const expected = Buffer.from(`Bearer ${secret}`), actual = Buffer.from(authorization ?? '');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new NotFoundException();
    return this.service.queueDaily();
  }
}
