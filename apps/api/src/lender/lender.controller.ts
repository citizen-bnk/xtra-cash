import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser, Roles, type AuthUser } from '../common/auth';
import { LoansService } from '../consumer/loans.service';
import { LenderService } from './lender.service';
import { SettingsService } from '../common/settings.service';
import { CriteriaDto, DocumentDto, FundingDto, LenderOrgDto, OfferDto, SubmitAccreditationDto, UpdateOfferDto } from './lender.dto';
import { OfferAssistantService } from './offer-assistant.service';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { Throttle } from '@nestjs/throttler';
class AssistantMessageDto {
  @IsIn(['user', 'assistant']) role: 'user' | 'assistant';
  @IsString() @MinLength(1) @MaxLength(2000) content: string;
}
class AssistantDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(12) @ValidateNested({ each: true }) @Type(() => AssistantMessageDto) messages: AssistantMessageDto[];
}

@Roles('LENDER')
@Controller('lender')
export class LenderController {
  constructor(private lender: LenderService, private loans: LoansService, private settings: SettingsService, private assistant: OfferAssistantService) {}

  @Post('offers/assistant')
  @HttpCode(200)
  @Throttle({ default: { limit: 8, ttl: 60000 } })
  assist(@CurrentUser() u: AuthUser, @Body() dto: AssistantDto) { return this.assistant.reply(u, dto.messages); }

  /** Where lenders send EFTs to load their stall, plus the current regulatory caps for offers. */
  @Get('funding-instructions')
  async instructions() {
    const s = await this.settings.get();
    return {
      bankDetails: s.platformBankDetails,
      maxRateBps: s.maxRateBps,
      maxMonthlyServiceFeeCents: s.maxMonthlyServiceFeeCents,
      assistedAccreditationFeeCents: s.assistedAccreditationFeeCents,
      platformShareBps: s.platformShareBps,
    };
  }

  @Get('org')
  org(@CurrentUser() u: AuthUser) {
    return this.lender.orgFor(u.id);
  }

  @Put('org')
  saveOrg(@CurrentUser() u: AuthUser, @Body() dto: LenderOrgDto) {
    return this.lender.saveOrg(u, dto);
  }

  @Post('documents')
  // Vercel functions accept request bodies up to 4.5 MB.
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 4 * 1024 * 1024 } }))
  upload(@CurrentUser() u: AuthUser, @Body() dto: DocumentDto, @UploadedFile() file: Express.Multer.File) {
    return this.lender.uploadDocument(u, dto.type, file);
  }

  @Get('documents/:id/file')
  async file(@CurrentUser() u: AuthUser, @Param('id') id: string, @Res() res: Response) {
    const org = await this.lender.orgFor(u.id);
    const { doc, buffer } = await this.lender.documentFile(org.id, id);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.fileName)}"`);
    res.send(buffer);
  }

  @HttpCode(200)
  @Post('accreditation/submit')
  submit(@CurrentUser() u: AuthUser, @Body() dto: SubmitAccreditationDto) {
    return this.lender.submitAccreditation(u, dto.assisted);
  }

  @HttpCode(200)
  @Post('accreditation/pay-fee')
  payFee(@CurrentUser() u: AuthUser) {
    return this.lender.payAccreditationFee(u);
  }

  @Get('stats')
  async stats(@CurrentUser() u: AuthUser) {
    const org = await this.lender.orgFor(u.id);
    return this.lender.stats(org.id);
  }

  @Get('funding')
  async funding(@CurrentUser() u: AuthUser) {
    const org = await this.lender.orgFor(u.id);
    return this.lender.listFunding(org.id);
  }

  @Post('funding')
  requestFunding(@CurrentUser() u: AuthUser, @Body() dto: FundingDto) {
    return this.lender.requestFunding(u, dto);
  }

  @Get('offers')
  async offers(@CurrentUser() u: AuthUser) {
    const org = await this.lender.orgFor(u.id);
    return this.lender.listOffers(org.id);
  }

  @Post('offers')
  createOffer(@CurrentUser() u: AuthUser, @Body() dto: OfferDto) {
    return this.lender.createOffer(u, dto);
  }

  @Put('offers/:id')
  updateOffer(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateOfferDto) {
    return this.lender.updateOffer(u, id, dto);
  }

  @HttpCode(200)
  @Post('offers/preview-reach')
  reach(@Body() dto: CriteriaDto) {
    return this.lender.previewReach(dto);
  }

  @Get('loans')
  async loansList(@CurrentUser() u: AuthUser, @Query() q: { page?: string; status?: string }) {
    const org = await this.lender.orgFor(u.id);
    return this.loans.page({ lenderId: org.id, status: q.status }, q);
  }
}
