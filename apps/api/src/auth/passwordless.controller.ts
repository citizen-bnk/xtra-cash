import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, Public, type AuthUser } from '../common/auth';
import { CompleteProfileDto, OtpFinishDto, OtpStartDto, SocialFinishDto, SocialStartDto } from './passwordless.dto';
import { PasswordlessService } from './passwordless.service';
@Controller('auth/passwordless')
export class PasswordlessController {
  constructor(private service: PasswordlessService) {}
  @Public() @Get('configuration') configuration() { return this.service.configuration(); }
  @Public() @Post('social/start') @HttpCode(200) @Throttle({ default: { limit: 5, ttl: 60000 } }) start(@Body() dto: SocialStartDto) { return this.service.socialStart(dto); }
  @Public() @Post('social/finish') @HttpCode(200) @Throttle({ default: { limit: 10, ttl: 60000 } }) finish(@Body() dto: SocialFinishDto) { return this.service.socialFinish(dto); }
  @Public() @Post('whatsapp/send') @HttpCode(200) @Throttle({ default: { limit: 3, ttl: 300000 } }) send(@Body() dto: OtpStartDto) { return this.service.sendOtp(dto); }
  @Public() @Post('whatsapp/verify') @HttpCode(200) @Throttle({ default: { limit: 10, ttl: 300000 } }) verify(@Body() dto: OtpFinishDto) { return this.service.verifyOtp(dto); }
  @Get('identity') identity(@CurrentUser() u: AuthUser) { return this.service.identity(u); }
  @Post('profile-prefill') @HttpCode(200) prefill(@CurrentUser() u: AuthUser) { return this.service.prefill(u); }
  @Put('profile') profile(@CurrentUser() u: AuthUser, @Body() dto: CompleteProfileDto) { return this.service.completeProfile(u, dto); }
}
