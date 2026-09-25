import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { CurrentUser, type AuthUser } from '../common/auth';
import { InjectDb } from '../common/db.module';
import { Db } from '../db/client';
import { affiliateProfiles, commissions, lenderOrgs, users } from '../db/schema';
import { sanitizeUser } from '../common/pagination';
import { KycService } from './kyc.service';
import { CreditService } from './credit.service';
import { CardsService } from './cards.service';
import { AuthorizationService } from './authorization.service';
import { LoansService } from './loans.service';
import { AmountDto, KycDto, PurchaseDto, QuoteDto } from './consumer.dto';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { and, sql } from 'drizzle-orm';

@Controller('me')
export class ConsumerController {
  constructor(
    @InjectDb() private db: Db,
    private kyc: KycService,
    private credit: CreditService,
    private cards: CardsService,
    private authz: AuthorizationService,
    private loans: LoansService,
  ) {}

  @Get()
  async me(@CurrentUser() u: AuthUser) {
    const user = await this.db.query.users.findFirst({ where: eq(users.id, u.id), with: { kyc: true } });
    if (!user) throw new NotFoundException();
    const lender = await this.db.query.lenderOrgs.findFirst({ where: eq(lenderOrgs.ownerUserId, u.id) });
    const aff = await this.db.query.affiliateProfiles.findFirst({ where: eq(affiliateProfiles.userId, u.id) });
    let affiliate = null;
    if (aff) {
      const [{ pending }] = await this.db
        .select({ pending: sql<string>`coalesce(sum(${commissions.amountCents}), 0)` })
        .from(commissions)
        .where(and(eq(commissions.affiliateId, u.id), eq(commissions.status, 'PENDING')));
      const [{ refs }] = await this.db.select({ refs: sql<string>`count(*)` }).from(users).where(eq(users.referredById, u.id));
      affiliate = {
        commissionBalanceCents: aff.commissionBalanceCents,
        lifetimeEarnedCents: aff.lifetimeEarnedCents,
        pendingCents: Number(pending),
        referrals: Number(refs),
        bankName: aff.bankName,
        bankAccountNumber: aff.bankAccountNumber,
      };
    }
    const { kyc, walletBalanceCents, ...rest } = sanitizeUser(user);
    return { ...rest, kyc: kyc ?? null, walletBalanceCents, lender: lender ?? null, affiliate };
  }

  @Put('kyc')
  submitKyc(@CurrentUser() u: AuthUser, @Body() dto: KycDto) {
    return this.kyc.submit(u.id, dto);
  }

  @Get('balance')
  balance(@CurrentUser() u: AuthUser) {
    return this.credit.balance(u.id);
  }

  @HttpCode(200)
  @Post('quote')
  quote(@CurrentUser() u: AuthUser, @Body() dto: QuoteDto) {
    return this.credit.quote(u.id, dto.offerId, dto.amountCents);
  }

  @Get('cards')
  listCards(@CurrentUser() u: AuthUser) {
    return this.cards.list(u.id);
  }

  @Post('cards')
  issueCard(@CurrentUser() u: AuthUser) {
    return this.cards.issue(u.id);
  }

  @HttpCode(200)
  @Post('cards/:id/freeze')
  freeze(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.cards.setFrozen(u.id, id, true);
  }

  @HttpCode(200)
  @Post('cards/:id/unfreeze')
  unfreeze(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.cards.setFrozen(u.id, id, false);
  }

  /**
   * In-app payment (XTRA-CASH marketplace, QR / online checkout) and demo simulation of a card swipe.
   * Physical and e-commerce card swipes arrive via the signed card-network webhook instead.
   */
  @HttpCode(200)
  @Post('cards/:id/purchase')
  purchase(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: PurchaseDto) {
    if (dto.channel !== 'MARKETPLACE' && process.env.ENABLE_SIMULATION !== 'true') {
      throw new ForbiddenException('Card purchases are authorised by the card network');
    }
    return this.authz.authorize({ ...dto, cardId: id, userId: u.id, idempotencyKey: `${u.id}:${dto.idempotencyKey}` });
  }

  @Get('transactions')
  transactions(@CurrentUser() u: AuthUser, @Query() q: { page?: string }) {
    return this.loans.transactions(u.id, q);
  }

  @Get('loans')
  listLoans(@CurrentUser() u: AuthUser) {
    return this.loans.listForUser(u.id);
  }

  @Get('loans/:id')
  getLoan(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.loans.getForUser(u.id, id);
  }

  @HttpCode(200)
  @Post('loans/:id/repay')
  repay(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: AmountDto) {
    return this.loans.repay(u.id, id, dto.amountCents);
  }

  @HttpCode(200)
  @Post('wallet/topup')
  topUp(@CurrentUser() u: AuthUser, @Body() dto: AmountDto) {
    return this.loans.topUp(u.id, dto.amountCents);
  }
}
