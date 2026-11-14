import { Body, Controller, Get, Param, Post, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, Public, Roles, type AuthUser } from '../common/auth';
import { RestaurantService } from './restaurant.service';

@Controller('restaurant-bills')
export class RestaurantController {
  constructor(private service: RestaurantService) {}

  @Public() @Get('merchant/:code') @Throttle({ default: { limit: 12, ttl: 60000 } })
  merchant(@Param('code') code: string) { return this.service.resolveMerchant(code); }

  @Roles('CONSUMER') @Post() @Throttle({ default: { limit: 8, ttl: 60000 } })
  create(@CurrentUser() user: AuthUser, @Body() body: { merchant: string; merchantCode?: string; reference: string; totalCents: number; items: { label: string; cents: number }[] }) { return this.service.create(user.id, body); }

  @Public() @Get(':token') @Throttle({ default: { limit: 30, ttl: 60000 } })
  view(@Param('token') token: string) { return this.service.view(token); }

  @Roles('CONSUMER') @Post(':token/claim') @Throttle({ default: { limit: 20, ttl: 60000 } })
  claim(@Param('token') token: string, @CurrentUser() user: AuthUser, @Body() body: { itemIds: string[] }) { return this.service.claim(token, user.id, body.itemIds); }

  @Roles('CONSUMER') @Post(':token/release') @Throttle({ default: { limit: 20, ttl: 60000 } })
  release(@Param('token') token: string, @CurrentUser() user: AuthUser, @Body() body: { itemIds: string[] }) { return this.service.release(token, user.id, body.itemIds); }

  @Roles('CONSUMER') @Post(':token/pay-wallet') @Throttle({ default: { limit: 8, ttl: 60000 } })
  payWallet(@Param('token') token: string, @CurrentUser() user: AuthUser, @Body() body: { idempotencyKey: string }) { return this.service.payFromWallet(token, user.id, body.idempotencyKey); }

  @Roles('CONSUMER') @Post(':token/original') @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 12 * 1024 * 1024 } }))
  attachOriginal(@Param('token') token: string, @CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File) { return this.service.attachOriginal(token, user.id, file); }
}

@Controller('me/receipts') @Roles('CONSUMER')
export class CustomerReceiptsController {
  constructor(private service: RestaurantService) {}

  @Get() list(@CurrentUser() user: AuthUser) { return this.service.receipts(user.id); }

  @Get(':id/original') async original(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const data = await this.service.receiptOriginal(user.id, id);
    return new StreamableFile(data.buffer, { type: 'application/octet-stream', disposition: `attachment; filename="${data.filename}"` });
  }

  @Post() @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 12 * 1024 * 1024 } }))
  archive(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File, @Body('title') title: string, @Body('digitizedJson') digitizedJson?: string) { return this.service.archive(user.id, file, title, digitizedJson); }
}

@Controller('me/restaurant-notifications') @Roles('CONSUMER')
export class RestaurantNotificationsController {
  constructor(private service: RestaurantService) {}
  @Get() list(@CurrentUser() user: AuthUser) { return this.service.notifications(user.id); }
  @Post(':id/read') read(@CurrentUser() user: AuthUser, @Param('id') id: string) { return this.service.readNotification(user.id, id); }
}
