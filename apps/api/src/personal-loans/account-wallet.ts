import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Injectable, NotFoundException, Param, Post, Put } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { InjectDb } from '../common/db.module';
import type { Db, DbOrTx } from '../db/client';
import { CurrentUser, Roles, type AuthUser } from '../common/auth';
import { AuditService } from '../common/audit.service';
import { Accounts, LedgerService } from '../common/ledger.service';
import { encryptIdentity, decryptIdentity } from '../auth/identity-crypto';
import { parse } from '../payday/payday.dto';

export function validateSignature(value: string) {
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value) || value.length > 180000)
    throw new BadRequestException('Draw your signature in the signature box.');
  const image = Buffer.from(value.split(',')[1], 'base64');
  if (image.length < 200 || image.subarray(0,8).toString('hex') !== '89504e470d0a1a0a'
    || image.readUInt32BE(16) < 1 || image.readUInt32BE(20) < 1
    || image.readUInt32BE(16) > 2000 || image.readUInt32BE(20) > 1000)
    throw new BadRequestException('The signature image is invalid. Draw it again.');
  return value;
}
export async function saveAgreementSignature(tx: DbOrTx, agreementId: string, userId: string, digest: string, image: string) {
  const encrypted = encryptIdentity(validateSignature(image));
  await tx.execute(sql`INSERT INTO agreement_signatures(agreement_id,user_id,digest,image_encrypted)
    VALUES(${agreementId},${userId},${digest},${encrypted}) ON CONFLICT(agreement_id) DO NOTHING`);
  await tx.execute(sql`INSERT INTO user_signatures(user_id,image_encrypted) VALUES(${userId},${encrypted})
    ON CONFLICT(user_id) DO UPDATE SET image_encrypted=excluded.image_encrypted,updated_at=now()`);
}
@Injectable()
export class AccountWalletService {
  constructor(@InjectDb() private db: Db, private ledger: LedgerService, private audit: AuditService) {}
  async signature(userId: string) {
    const result = await this.db.execute<{ image_encrypted: string }>(sql`SELECT image_encrypted FROM user_signatures WHERE user_id=${userId}`);
    return { signature: result.rows[0] ? decryptIdentity(result.rows[0].image_encrypted) : null };
  }
  async saveSignature(actor: AuthUser, body: unknown) {
    const input = parse(z.object({ signature: z.string().max(180000) }).strict(), body);
    const image = encryptIdentity(validateSignature(input.signature));
    await this.db.transaction(async tx => {
      await tx.execute(sql`INSERT INTO user_signatures(user_id,image_encrypted) VALUES(${actor.id},${image})
        ON CONFLICT(user_id) DO UPDATE SET image_encrypted=excluded.image_encrypted,updated_at=now()`);
      await this.audit.log(actor,'profile.signature_saved','user',actor.id,{},tx);
    });
    return { ok: true };
  }
  async wallet(actor: AuthUser) {
    const result = await this.db.execute<{ wallet_balance_cents: number }>(sql`SELECT wallet_balance_cents FROM users WHERE id=${actor.id} AND status='ACTIVE'`);
    if (!result.rows[0]) throw new NotFoundException();
    const deposits = await this.db.execute(sql`SELECT id,amount_cents,reference,status,note,created_at,decided_at FROM wallet_deposits
      WHERE user_id=${actor.id} ORDER BY created_at DESC LIMIT 30`);
    return { walletCents: result.rows[0].wallet_balance_cents,
      bankDetails: process.env.WALLET_DEPOSIT_BANK_DETAILS?.trim() || null, deposits: deposits.rows };
  }
  async requestDeposit(actor: AuthUser, body: unknown) {
    const input = parse(z.object({ amountCents: z.number().int().min(100).max(10000000),
      clientKey: z.string().min(8).max(100) }).strict(), body);
    if (!process.env.WALLET_DEPOSIT_BANK_DETAILS?.trim()) throw new BadRequestException('Bank deposit details are awaiting setup by XTRA-CASH.');
    return this.db.transaction(async tx => {
      const existing = await tx.execute<{ amount_cents: number }>(sql`SELECT * FROM wallet_deposits WHERE user_id=${actor.id} AND client_key=${input.clientKey}`);
      if (existing.rows[0]) {
        if (existing.rows[0].amount_cents !== input.amountCents) throw new ConflictException('This request has a different amount. Start a new deposit.');
        return existing.rows[0];
      }
      const id = randomUUID(), reference = 'XCW' + randomUUID().replace(/-/g,'').slice(0,12).toUpperCase();
      const result = await tx.execute(sql`INSERT INTO wallet_deposits(id,user_id,amount_cents,client_key,reference)
        VALUES(${id},${actor.id},${input.amountCents},${input.clientKey},${reference})
        ON CONFLICT(user_id,client_key) DO UPDATE SET client_key=excluded.client_key
        RETURNING *`);
      const deposit = result.rows[0] as { id: string; amount_cents: number };
      if (deposit.amount_cents !== input.amountCents) throw new ConflictException('This request has a different amount. Start a new deposit.');
      if (deposit.id !== id) return deposit;
      await this.audit.log(actor,'wallet.deposit_requested','wallet_deposit',id,{ amountCents:input.amountCents, reference },tx);
      return result.rows[0];
    });
  }
  async creditSettledDeposit(actor: AuthUser, userId: string, body: unknown) {
    if (!actor.roles.includes('SUPER_ADMIN') || actor.supportSessionId) throw new ForbiddenException();
    if (actor.id === userId) throw new BadRequestException('Another super admin must credit your wallet.');
    const input = parse(z.object({
      amountCents: z.number().int().min(100).max(10000000),
      bankReference: z.string().trim().min(3).max(150),
      note: z.string().trim().min(3).max(1000),
      confirmed: z.literal(true),
    }).strict(), body);

    return this.db.transaction(async tx => {
      const target = await tx.execute<{wallet_balance_cents: number}>(sql`
        SELECT wallet_balance_cents FROM users
        WHERE id=${userId} AND status='ACTIVE' AND 'CONSUMER'=ANY(roles) FOR UPDATE`);
      if (!target.rows[0]) throw new NotFoundException('An active customer wallet is required.');

      const id = randomUUID();
      const reference = 'XCW' + id.replace(/-/g,'').slice(0,12).toUpperCase();
      const inserted = await tx.execute(sql`
        INSERT INTO wallet_deposits(id,user_id,amount_cents,client_key,reference,status,bank_reference,note,decided_by,decided_at)
        VALUES(${id},${userId},${input.amountCents},${'staff-credit:' + id},${reference},'CONFIRMED',${input.bankReference},${input.note},${actor.id},now())
        ON CONFLICT(bank_reference) DO NOTHING RETURNING id`);
      if (!inserted.rows.length) {
        const existing = await tx.execute<{
          reference: string; user_id: string; amount_cents: number; client_key: string; decided_by: string | null;
        }>(sql`
          SELECT reference,user_id,amount_cents,client_key,decided_by
          FROM wallet_deposits WHERE bank_reference=${input.bankReference}`);
        const prior = existing.rows[0];
        if (prior?.client_key.startsWith('staff-credit:') && prior.user_id === userId
          && prior.amount_cents === input.amountCents && prior.decided_by === actor.id)
          return { reference: prior.reference, walletCents: target.rows[0].wallet_balance_cents };
        throw new ConflictException('This bank transaction has already been recorded.');
      }

      const walletCents = await this.creditBalance(tx, userId, input.amountCents, id);
      await this.audit.log(actor,'wallet.deposit_credited_by_super_admin','wallet_deposit',id,
        {userId,amountCents:input.amountCents,bankReference:input.bankReference,note:input.note},tx);
      await tx.execute(sql`
        INSERT INTO activity_notifications(user_id,event_key,title,body,path,cta,owner)
        VALUES(${userId},${'wallet-deposit:' + id + ':CONFIRMED'},'Wallet top-up confirmed',
          'Your confirmed deposit is available in your wallet.','/app/wallet','View wallet','Applicant')
        ON CONFLICT DO NOTHING`);
      return { reference, walletCents };
    });
  }

  private async creditBalance(tx: DbOrTx, userId: string, amountCents: number, depositId: string) {
    const updated = await tx.execute<{wallet_balance_cents: number}>(sql`
      UPDATE users SET wallet_balance_cents=wallet_balance_cents+${amountCents}
      WHERE id=${userId} AND status='ACTIVE' RETURNING wallet_balance_cents`);
    if (!updated.rows[0]) throw new BadRequestException('The customer account is unavailable.');
    await this.ledger.post(tx,{type:'wallet_deposit_confirmed',refType:'wallet_deposit',refId:depositId},[
      {account:Accounts.bank,amountCents},
      {account:Accounts.consumerWallet(userId),amountCents:-amountCents},
    ]);
    return updated.rows[0].wallet_balance_cents;
  }

  async deposits() {
    const rows = await this.db.execute(sql`SELECT d.*,u.first_name,u.last_name FROM wallet_deposits d JOIN users u ON u.id=d.user_id
      ORDER BY (d.status='PENDING') DESC,d.created_at DESC LIMIT 100`);
    return rows.rows;
  }
  async decide(actor: AuthUser, id: string, body: unknown) {
    const input = parse(z.object({ action: z.enum(['CONFIRM','REJECT']), note: z.string().trim().min(3).max(1000),
      bankReference: z.string().trim().min(3).max(150).optional() }).strict(),body);
    if (input.action === 'CONFIRM' && !input.bankReference) throw new BadRequestException('Enter the unique transaction reference from the bank statement.');
    return this.db.transaction(async tx => {
      const result = await tx.execute<{ status:string; user_id:string; amount_cents:number; bank_reference:string|null }>(
        sql`SELECT * FROM wallet_deposits WHERE id=${id} FOR UPDATE`);
      const row = result.rows[0];
      if (!row) throw new NotFoundException();
      if (row.user_id === actor.id) throw new BadRequestException('Another administrator must confirm your deposit.');
      const target = input.action === 'CONFIRM' ? 'CONFIRMED' : 'REJECTED';
      if (row.status === target && (target !== 'CONFIRMED' || row.bank_reference === input.bankReference)) return { ok:true };
      if (row.status !== 'PENDING') throw new ConflictException('This deposit already has a decision.');
      await tx.execute(sql`UPDATE wallet_deposits SET status=${target},bank_reference=${input.bankReference ?? null},
        note=${input.note},decided_by=${actor.id},decided_at=now() WHERE id=${id}`);
      if (target === 'CONFIRMED') await this.creditBalance(tx, row.user_id, row.amount_cents, id);
      await this.audit.log(actor,'wallet.deposit_'+target.toLowerCase(),'wallet_deposit',id,
        {amountCents:row.amount_cents,bankReference:input.bankReference,note:input.note},tx);
      return {ok:true};
    }).catch(error => {
      if ((error.cause?.code ?? error.code) === '23505') throw new ConflictException('This bank transaction has already been used for a deposit.');
      throw error;
    });
  }
}
@Controller('me')
export class AccountWalletController {
  constructor(private service: AccountWalletService) {}
  @Get('signature') signature(@CurrentUser() actor: AuthUser) { return this.service.signature(actor.id); }
  @Put('signature') saveSignature(@CurrentUser() actor: AuthUser,@Body() body:unknown) { return this.service.saveSignature(actor,body); }
  @Get('wallet/deposits') wallet(@CurrentUser() actor:AuthUser) { return this.service.wallet(actor); }
  @Post('wallet/deposits') request(@CurrentUser() actor:AuthUser,@Body() body:unknown) { return this.service.requestDeposit(actor,body); }
}
@Controller('money/wallet/deposits') @Roles('ADMIN','SUPER_ADMIN')
export class WalletDepositAdminController {
  constructor(private service:AccountWalletService) {}
  @Get() list() { return this.service.deposits(); }
  @Roles('SUPER_ADMIN') @Post('credit/:userId')
  credit(@CurrentUser() actor: AuthUser,@Param('userId') userId: string,@Body() body: unknown) {
    return this.service.creditSettledDeposit(actor,userId,body);
  }
  @Post(':id/decision') decide(@CurrentUser() actor:AuthUser,@Param('id') id:string,@Body() body:unknown) { return this.service.decide(actor,id,body); }
}
