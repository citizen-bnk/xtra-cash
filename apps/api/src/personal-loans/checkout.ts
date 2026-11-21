import { Body, Controller, Get, Post, Param, BadRequestException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { CurrentUser, Roles, type AuthUser } from '../common/auth';
import { InjectDb } from '../common/db.module';
import type { Db } from '../db/client';
import { AuditService } from '../common/audit.service';
import { MoneyConnector } from './money-connector';
import { SettlementService } from './settlement.service';
import { parse } from '../payday/payday.dto';

const identifier = z.string().uuid();
const sessionInput = z.object({ tableToken: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const completeInput = z.object({
  password: z.string().min(1).max(128), digest: z.string().length(64), acknowledged: z.literal(true),
  signature: z.string().max(180000).regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/),
}).strict();

@Controller('personal-checkout') @Roles('CONSUMER')
export class PersonalCheckoutController {
  constructor(@InjectDb() private db: Db, private settlement: SettlementService, private connector: MoneyConnector, private audit: AuditService) {}

  private requireCheckout() {
    this.connector.requireReady();
    if (process.env.PERSONAL_CHECKOUT_ENABLED !== 'true') throw new ServiceUnavailableException('Personal loan checkout is awaiting activation. No funds have been moved.');
  }

  @Get()
  async offers(@CurrentUser() actor: AuthUser) {
    const rows = await this.db.execute(sql`SELECT a.id,a.status,g.content,g.digest,g.terms,g.expires_at,l.name AS lender_name
      FROM personal_loan_applications a JOIN personal_agreements g ON g.application_id=a.id
      JOIN lender_orgs l ON l.id=g.lender_id
      JOIN loan_offers o ON o.id=g.terms->>'offerId'
      WHERE a.user_id=${actor.id} AND l.accreditation_status='ACCREDITED'
      AND ((a.status='OFFERED' AND g.status='OFFERED' AND g.expires_at>now() AND o.active)
        OR (a.status IN ('ACCEPTED','FUNDING_PENDING') AND g.status='ACCEPTED'))
      ORDER BY g.created_at DESC LIMIT 10`);
    const configuration = this.settlement.configuration();
    return { offers: rows.rows, configuration: { enabled: configuration.enabled && process.env.PERSONAL_CHECKOUT_ENABLED === 'true', agreementsEnabled: configuration.agreementsEnabled } };
  }

  private async owned(actor: AuthUser, id: string) {
    parse(identifier, id);
    const result = await this.db.execute(sql`SELECT a.user_id,a.status,g.digest,g.terms,g.expires_at,g.status AS agreement_status
      FROM personal_loan_applications a JOIN personal_agreements g ON g.application_id=a.id
      WHERE a.id=${id} AND a.user_id=${actor.id}`);
    const record = result.rows[0] as { status: string; digest: string; expires_at: string; agreement_status: string } | undefined;
    if (!record) throw new NotFoundException();
    if (!['OFFERED','ACCEPTED','FUNDING_PENDING'].includes(record.status)) throw new BadRequestException('This loan is no longer available for checkout.');
    return record;
  }

  @Post(':id/repayment') @Throttle({default:{limit:5,ttl:60000}})
  async repayment(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const input = parse(sessionInput, body);
    await this.owned(actor,id);
    this.requireCheckout();
    const bill = await this.db.execute(sql`SELECT b.id FROM restaurant_bills b JOIN restaurant_bill_items i ON i.bill_id=b.id
      WHERE b.share_token=${input.tableToken} AND b.status='OPEN' AND b.expires_at>now() AND i.claimed_by=${actor.id} AND i.status='CLAIMED' LIMIT 1`);
    if (!bill.rows.length) throw new ForbiddenException('Claim your bill items first.');
    const returnUrl = new URL('/scanqr', process.env.RESTAURANT_CHECKOUT_BASE_URL || 'https://xtra-cash.vercel.app');
    returnUrl.searchParams.set('table',input.tableToken);
    const result = z.object({ sessionReference:z.string().min(1).max(200), url:z.string().url() }).parse(
      await this.connector.call('/v1/repayment-methods/sessions', { userId:actor.id, applicationId:id, type:'CARD', returnUrl:returnUrl.toString(), idempotencyKey:`repayment-${id}` }),
    );
    const target = new URL(result.url);
    if (target.protocol !== 'https:' || target.username || target.password) throw new BadRequestException('Repayment setup is unavailable.');
    await this.db.execute(sql`INSERT INTO personal_checkout(application_id,user_id,repayment_session) VALUES(${id},${actor.id},${result.sessionReference})
      ON CONFLICT(application_id) DO UPDATE SET repayment_session=excluded.repayment_session
      WHERE personal_checkout.user_id=excluded.user_id AND personal_checkout.mandate_reference IS NULL`);
    await this.audit.log(actor,'personal_checkout.repayment_started','personal_loan_application',id,{});
    return { url:result.url };
  }

  @Post(':id/complete') @Throttle({default:{limit:5,ttl:60000}})
  async complete(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() body: unknown) {
    const input = parse(completeInput,body);
    const agreement = await this.owned(actor,id);
    if (agreement.status === 'FUNDING_PENDING') return { wallet: await this.settlement.wallet(actor) };
    if (input.digest !== agreement.digest) throw new BadRequestException('The offer changed. Review the latest agreement.');
    const image = Buffer.from(input.signature.split(',')[1], 'base64');
    if (image.length < 200 || image.subarray(0,8).toString('hex') !== '89504e470d0a1a0a') throw new BadRequestException('Draw your signature first.');
    this.requireCheckout();
    const records = await this.db.execute(sql`SELECT repayment_session FROM personal_checkout WHERE application_id=${id} AND user_id=${actor.id}`);
    const session = records.rows[0] as {repayment_session:string} | undefined;
    if (!session) throw new BadRequestException('Link your repayment card first.');
    const result = z.object({ verified:z.literal(true), userId:z.literal(actor.id), applicationId:z.literal(id), mandateReference:z.string().min(1).max(300) }).parse(
      await this.connector.call('/v1/repayment-methods/verify',{ sessionReference:session.repayment_session,userId:actor.id,applicationId:id }),
    );
    await this.settlement.accept(actor,id,{digest:input.digest,password:input.password,acknowledged:true,signature:input.signature});
    await this.db.transaction(async tx => {
      await tx.execute(sql`UPDATE personal_checkout SET mandate_reference=${result.mandateReference},
        agreement_digest=${input.digest},signed_at=now()
        WHERE application_id=${id} AND user_id=${actor.id}`);
      await this.audit.log(actor,'personal_checkout.signature_recorded','personal_loan_application',id,{digest:input.digest},tx);
    });
    await this.db.execute(sql`UPDATE personal_agreements SET mandate_reference=${result.mandateReference}
      WHERE application_id=${id} AND user_id=${actor.id} AND digest=${input.digest} AND status='ACCEPTED'`);
    const funding = await this.settlement.fund(actor,id,true);
    await this.settlement.process();
    return { funding, wallet:await this.settlement.wallet(actor) };
  }
}
