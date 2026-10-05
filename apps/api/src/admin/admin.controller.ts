import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ArrayNotEmpty, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Role } from '@xtra/shared';
import { CurrentUser, Roles, type AuthUser } from '../common/auth';
import { SettingsService } from '../common/settings.service';
import { AuditService } from '../common/audit.service';
import { KycService } from '../consumer/kyc.service';
import { LoansService } from '../consumer/loans.service';
import { LenderService } from '../lender/lender.service';
import { AffiliateService } from '../affiliate/affiliate.service';
import { AdminService } from './admin.service';

class DecisionDto {
  @IsBoolean() approve: boolean;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @IsOptional() @IsString() @MaxLength(80) reference?: string;
}
class StatusDto {
  @IsIn(['ACTIVE', 'SUSPENDED']) status: 'ACTIVE' | 'SUSPENDED';
}
class RolesDto {
  @IsArray() @ArrayNotEmpty() @IsIn(Object.values(Role), { each: true }) roles: Role[];
}
class LenderReviewDto {
  @IsIn(['UNDER_REVIEW', 'ACCREDITED', 'REJECTED', 'SUSPENDED']) status: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
class NcrDto {
  @IsString() @MaxLength(40) ncrNumber: string;
}
class DocReviewDto {
  @IsIn(['ACCEPTED', 'REJECTED']) status: 'ACCEPTED' | 'REJECTED';
}
class ActiveDto {
  @IsBoolean() active: boolean;
}
class SettingsDto {
  @IsOptional() @IsInt() @Min(500) @Max(8000) affordabilityRatioBps?: number;
  @IsOptional() @IsInt() @Min(0) @Max(2000) maxRateBps?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100_000) maxMonthlyServiceFeeCents?: number;
  @IsOptional() @IsInt() @Min(0) @Max(5000) platformShareBps?: number;
  @IsOptional() @IsInt() @Min(0) assistedAccreditationFeeCents?: number;
  @IsOptional() @IsInt() @Min(0) commissionConsumerActivationCents?: number;
  @IsOptional() @IsInt() @Min(0) commissionLenderAccreditedCents?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1000) commissionLoanOriginationBps?: number;
  @IsOptional() @IsInt() @Min(0) minPayoutCents?: number;
  @IsOptional() @IsString() @MaxLength(300) platformBankDetails?: string;
}

@Roles('ADMIN', 'SUPER_ADMIN')
@Controller('admin')
export class AdminController {
  constructor(
    private admin: AdminService,
    private kyc: KycService,
    private lenders: LenderService,
    private affiliates: AffiliateService,
    private loans: LoansService,
    private settings: SettingsService,
    private audit: AuditService,
  ) {}

  @Get('stats') stats() {
    return this.admin.stats();
  }

  // ----- users
  @Get('users') users(@Query() q: any) {
    return this.admin.users(q);
  }
  @Get('users/:id') user(@Param('id') id: string) {
    return this.admin.user(id);
  }
  @HttpCode(200) @Post('users/:id/status') userStatus(@CurrentUser() a: AuthUser, @Param('id') id: string, @Body() dto: StatusDto) {
    return this.admin.setUserStatus(a, id, dto.status);
  }
  @Roles('SUPER_ADMIN')
  @HttpCode(200)
  @Post('users/:id/roles')
  userRoles(@CurrentUser() a: AuthUser, @Param('id') id: string, @Body() dto: RolesDto) {
    return this.admin.setUserRoles(a, id, dto.roles);
  }

  // ----- KYC
  @Get('kyc') kycQueue(@Query('status') status?: string) {
    return this.admin.kycQueue(status || 'PENDING');
  }
  @HttpCode(200) @Post('kyc/:userId/decision') kycDecision(@CurrentUser() a: AuthUser, @Param('userId') id: string, @Body() dto: DecisionDto) {
    return this.kyc.decide(a, id, dto.approve, dto.reason);
  }

  // ----- Credit Mall: lenders, documents, funding, offers
  @Get('lenders') lendersList(@Query('status') status?: string) {
    return this.admin.lendersList(status);
  }
  @Get('lenders/:id') lender(@Param('id') id: string) {
    return this.admin.lender(id);
  }
  @HttpCode(200) @Post('lenders/:id/review') review(@CurrentUser() a: AuthUser, @Param('id') id: string, @Body() dto: LenderReviewDto) {
    return this.admin.reviewLender(a, id, dto.status, dto.notes);
  }
  @HttpCode(200) @Post('lenders/:id/ncr') ncr(@CurrentUser() a: AuthUser, @Param('id') id: string, @Body() dto: NcrDto) {
    return this.admin.setLenderNcr(a, id, dto.ncrNumber);
  }
  @HttpCode(200)
  @Post('lenders/:id/documents/:docId')
  reviewDoc(@CurrentUser() a: AuthUser, @Param('id') id: string, @Param('docId') docId: string, @Body() dto: DocReviewDto) {
    return this.admin.reviewDocument(a, id, docId, dto.status);
  }
  @Get('lenders/:id/documents/:docId/file')
  async docFile(@Param('id') id: string, @Param('docId') docId: string, @Res() res: Response) {
    const { doc, buffer } = await this.lenders.documentFile(id, docId);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.fileName)}"`);
    res.send(buffer);
  }
  @Get('funding') funding(@Query('status') status?: string) {
    return this.admin.funding(status);
  }
  @HttpCode(200) @Post('funding/:id/decision') fundingDecision(@CurrentUser() a: AuthUser, @Param('id') id: string, @Body() dto: DecisionDto) {
    return this.lenders.decideFunding(a, id, dto.approve);
  }
  @Get('offers') offers() {
    return this.admin.offers();
  }
  @HttpCode(200) @Post('offers/:id/active') offerActive(@CurrentUser() a: AuthUser, @Param('id') id: string, @Body() dto: ActiveDto) {
    return this.admin.setOfferActive(a, id, dto.active);
  }

  // ----- lending book
  @Get('loans') loansPage(@Query() q: any) {
    return this.admin.loansPage(q);
  }
  @Get('transactions') transactions(@Query() q: any) {
    return this.admin.transactions(q);
  }

  // ----- affiliates
  @Get('commissions') commissions(@Query('status') status?: string) {
    return this.admin.commissionsList(status);
  }
  @HttpCode(200) @Post('commissions/:id/decision') commissionDecision(@CurrentUser() a: AuthUser, @Param('id') id: string, @Body() dto: DecisionDto) {
    return this.affiliates.decideCommission(a, id, dto.approve);
  }
  @Get('payouts') payouts(@Query('status') status?: string) {
    return this.admin.payoutsList(status);
  }
  @HttpCode(200) @Post('payouts/:id/decision') payoutDecision(@CurrentUser() a: AuthUser, @Param('id') id: string, @Body() dto: DecisionDto) {
    return this.affiliates.decidePayout(a, id, dto.approve, dto.reference);
  }

  // ----- platform
  @Get('settings') getSettings() {
    return this.settings.get();
  }
  @Roles('SUPER_ADMIN')
  @Put('settings')
  async saveSettings(@CurrentUser() a: AuthUser, @Body() dto: SettingsDto) {
    const s = await this.settings.update(dto);
    await this.audit.log(a, 'settings.updated', 'settings', null, dto as any);
    return s;
  }
  @Get('audit') auditLog(@Query() q: any) {
    return this.admin.auditLog(q);
  }
  @Get('ledger/check') ledger() {
    return this.admin.ledgerCheck();
  }
  @Get('reports/revenue') revenue() { return this.admin.revenueDetails(); }
  @HttpCode(200) @Post('jobs/arrears') async arrears(@CurrentUser() a: AuthUser) {
    const r = await this.loans.runArrears();
    await this.audit.log(a, 'job.arrears', 'job', null, r);
    return r;
  }
}
