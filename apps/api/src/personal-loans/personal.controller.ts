import { Body, Controller, Get, HttpCode, Param, Post, Res, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser, Public, Roles, type AuthUser } from '../common/auth';
import { PersonalLoanService } from './personal.service';
import { ApplicationReviewDto, PersonalApplicationDto, PrecheckDto, VerificationDecisionDto, VerificationDto } from './personal.dto';
@Controller('personal-loans')
export class PersonalLoanController {
  constructor(private personal: PersonalLoanService) {}
  @Public() @Post('precheck') @HttpCode(200) @Throttle({ default: { limit: 10, ttl: 60000 } })
  precheck(@Body() dto: PrecheckDto) { return this.personal.precheck(dto); }
  @Get('verification') verification(@CurrentUser() u: AuthUser) { return this.personal.verification(u.id); }
  @Post('verification')
  @UseInterceptors(FileFieldsInterceptor([{ name: 'identity', maxCount: 1 }, { name: 'address', maxCount: 1 }], { limits: { fileSize: 1900000, files: 2, fieldSize: 2000 } }))
  submitVerification(@CurrentUser() u: AuthUser, @Body() dto: VerificationDto, @UploadedFiles() files: { identity?: Express.Multer.File[]; address?: Express.Multer.File[] }) { return this.personal.submitVerification(u, dto, files); }
  @Post('matches') @HttpCode(200) matches(@CurrentUser() u: AuthUser, @Body() dto: PersonalApplicationDto) { return this.personal.matches(u.id, dto); }
  @Get('applications') applications(@CurrentUser() u: AuthUser) { return this.personal.list(u.id); }
  @Post('applications') apply(@CurrentUser() u: AuthUser, @Body() dto: PersonalApplicationDto) { return this.personal.apply(u, dto); }
  @Get('documents/:userId/:kind') async document(@CurrentUser() u: AuthUser, @Param('userId') userId: string, @Param('kind') kind: string, @Res() res: Response) {
    const buffer = await this.personal.document(u, userId, kind);
    const pdf = buffer.subarray(0, 5).toString() === '%PDF-', png = buffer.subarray(0, 4).toString('hex') === '89504e47';
    res.setHeader('Content-Type', pdf ? 'application/pdf' : png ? 'image/png' : 'image/jpeg'); res.setHeader('Content-Disposition', `attachment; filename="verification-document.${pdf ? 'pdf' : png ? 'png' : 'jpg'}"`); res.setHeader('Cache-Control', 'no-store'); res.send(buffer);
  }
  @Roles('ADMIN', 'SUPER_ADMIN') @Get('review/applications') reviewApplications() { return this.personal.reviewApplications(); }
  @Roles('ADMIN', 'SUPER_ADMIN') @Get('review/verification') reviewVerification() { return this.personal.reviewVerifications(); }
  @Roles('ADMIN', 'SUPER_ADMIN') @Post('review/verification/:userId')
  decide(@CurrentUser() u: AuthUser, @Param('userId') userId: string, @Body() dto: VerificationDecisionDto) { return this.personal.decide(u, userId, dto); }
  @Roles('ADMIN', 'SUPER_ADMIN', 'LENDER') @Post('applications/:id/review')
  reviewApplication(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ApplicationReviewDto) { return this.personal.reviewApplication(u, id, dto); }
}
@Roles('LENDER') @Controller('lender')
export class PersonalLenderController {
  constructor(private personal: PersonalLoanService) {}
  @Get('personal-applications') applications(@CurrentUser() u: AuthUser) { return this.personal.lenderList(u); }
}
