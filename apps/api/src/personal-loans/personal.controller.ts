import { Body, Controller, Get, HttpCode, Param, Post, Put, Res, UploadedFile, UploadedFiles, UseInterceptors, BadRequestException } from '@nestjs/common';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { FileFieldsInterceptor, FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser, Public, Roles, type AuthUser } from '../common/auth';
import { PersonalLoanService } from './personal.service';
import { AmendPersonalApplicationDto, ApplicationReviewDto, PersonalApplicationDto, PrecheckDto, VerificationDecisionDto, VerificationDto } from './personal.dto';
import { VaultService } from './vault.service';
import { CompleteVaultValidationDto, StartVaultValidationDto, VaultDocumentDto, VaultLocationConsentDto, VaultLocationDto } from './vault.dto';
class LenderDocumentReviewDto { @IsIn(['ACCEPTED', 'REJECTED', 'REVOKED']) status: 'ACCEPTED'|'REJECTED'|'REVOKED'; @IsString() @MinLength(3) @MaxLength(1000) comment: string; }
@Controller('personal-loans')
export class PersonalLoanController {
  constructor(private personal: PersonalLoanService, private vaults: VaultService) {}
  @Public() @Post('precheck') @HttpCode(200) @Throttle({ default: { limit: 10, ttl: 60000 } })
  precheck(@Body() dto: PrecheckDto) { return this.personal.precheck(dto); }
  @Get('verification') verification(@CurrentUser() u: AuthUser) { return this.personal.verification(u.id); }
  @Post('verification')
  @UseInterceptors(FileFieldsInterceptor([{ name: 'identity', maxCount: 1 }, { name: 'address', maxCount: 1 }], { limits: { fileSize: 1900000, files: 2, fieldSize: 2000 } }))
  submitVerification(@CurrentUser() u: AuthUser, @Body() dto: VerificationDto, @UploadedFiles() files: { identity?: Express.Multer.File[]; address?: Express.Multer.File[] }) { return this.personal.submitVerification(u, dto, files); }
  @Post('matches') @HttpCode(200) matches(@CurrentUser() u: AuthUser, @Body() dto: PersonalApplicationDto) { return this.personal.matches(u.id, dto); }
  @Get('applications') applications(@CurrentUser() u: AuthUser) { return this.personal.list(u.id); }
  @Post('applications') apply(@CurrentUser() u: AuthUser, @Body() dto: PersonalApplicationDto) { return this.personal.apply(u, dto); }
  @Get('vault') vault(@CurrentUser() u: AuthUser) { return this.vaults.status(u.id); }
  @Roles('LENDER', 'ADMIN', 'SUPER_ADMIN') @Get('applications/:id/lender-review-pack') lenderReviewPack(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.vaults.lenderReviewPack(u, id); }
  @Put('applications/:id') amendApplication(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: AmendPersonalApplicationDto) { return this.personal.amendApplication(u, id, dto); }
  @Post('applications/:id/documents') @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10000000, files: 1, fieldSize: 2000 } }))
  uploadApplicationDocument(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: VaultDocumentDto, @UploadedFile() file: Express.Multer.File) { return this.vaults.uploadForApplication(u, id, dto.type, dto.consent, file); }
  @Roles('LENDER', 'ADMIN', 'SUPER_ADMIN') @Post('applications/:id/lender-evaluation') runLenderEvaluation(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.vaults.runLenderEvaluation(u, id); }
  @Roles('LENDER', 'ADMIN', 'SUPER_ADMIN') @Post('applications/:id/documents/:docId/review') reviewVaultDocument(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('docId') docId: string, @Body() dto: LenderDocumentReviewDto) { return this.vaults.lenderDocumentReview(u, id, docId, dto.status, dto.comment); }
  @Get('applications/:id/documents/:docId/file') async lenderVaultDocument(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('docId') docId: string, @Res() res: Response) {
    const { doc, buffer } = await this.vaults.applicationDocumentFile(u, id, docId);
    const pdf = buffer.subarray(0, 5).toString() === '%PDF-', png = buffer.subarray(0, 4).toString('hex') === '89504e47';
    res.setHeader('Content-Type', pdf ? 'application/pdf' : png ? 'image/png' : 'image/jpeg'); res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.originalName)}"`); res.setHeader('Cache-Control', 'no-store'); res.send(buffer);
  }
  @Post('vault/documents') @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10000000, files: 1, fieldSize: 2000 } }))
  uploadVaultDocument(@CurrentUser() u: AuthUser, @Body() dto: VaultDocumentDto, @UploadedFile() file: Express.Multer.File) { return this.vaults.upload(u, dto.type, file, dto.observedFrom, dto.observedTo); }
  @Put('vault/location-consent') locationConsent(@CurrentUser() u: AuthUser, @Body() dto: VaultLocationConsentDto) { return this.vaults.setLocationConsent(u, dto.enabled); }
  @Post('vault/location') location(@CurrentUser() u: AuthUser, @Body() dto: VaultLocationDto) { return this.vaults.location(u, dto); }
  @Post('vault/application-validations') startVaultValidation(@CurrentUser() u: AuthUser, @Body() dto: StartVaultValidationDto) { return this.vaults.startValidation(u, dto); }
  @Put('vault/application-validations/:id') completeVaultValidation(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: CompleteVaultValidationDto) { return this.vaults.completeValidation(u, id, dto); }
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
