import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser, Roles, type AuthUser } from '../common/auth';
import { LoansService } from '../consumer/loans.service';
import { LenderService } from './lender.service';
import { CriteriaDto, DocumentDto, FundingDto, LenderOrgDto, OfferDto, SubmitAccreditationDto, UpdateOfferDto } from './lender.dto';

@Roles('LENDER')
@Controller('lender')
export class LenderController {
  constructor(private lender: LenderService, private loans: LoansService) {}

  @Get('org')
  org(@CurrentUser() u: AuthUser) {
    return this.lender.orgFor(u.id);
  }

  @Put('org')
  saveOrg(@CurrentUser() u: AuthUser, @Body() dto: LenderOrgDto) {
    return this.lender.saveOrg(u, dto);
  }

  @Post('documents')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
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
