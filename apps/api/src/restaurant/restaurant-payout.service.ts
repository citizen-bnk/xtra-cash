import { randomBytes, randomUUID } from 'crypto';
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../common/db.module';

const validId = (value: string) => /^[a-f0-9-]{36}$/.test(value);
const checkoutBase = () => (process.env.RESTAURANT_CHECKOUT_BASE_URL ?? 'https://xtra-cash.vercel.app').replace(/\/$/, '');
const printedCode = () => {
  const bytes = randomBytes(6);
  return `${Array.from(bytes.subarray(0, 3), value => String.fromCharCode(65 + value % 26)).join('')}${Array.from(bytes.subarray(3), value => String(value % 10)).join('')}`;
};

@Injectable()
export class RestaurantPayoutService {
  constructor(@Inject(PG_POOL) private pool: Pool) {}

  async createMerchant(input: { tradingName: string; portalEmail: string; settlementReference?: string; bankAccountMask?: string; bankRecipientToken?: string }) {
    const name = String(input.tradingName ?? '').trim().slice(0, 80);
    const email = String(input.portalEmail ?? '').trim().toLowerCase();
    if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new BadRequestException('Enter a restaurant name and an existing account email.');
    const owner = await this.pool.query("SELECT id FROM users WHERE lower(email)=$1 AND status='ACTIVE'", [email]);
    if (!owner.rows[0]) throw new NotFoundException('The restaurant contact must register an XTRA-CASH account first.');
    const id = randomUUID();
    const qrCode = randomBytes(18).toString('hex').toUpperCase();
    for (let attempt = 0; attempt < 5; attempt++) {
      const displayCode = printedCode();
      try {
        await this.pool.query('INSERT INTO restaurant_merchants(id,qr_code,display_code,trading_name,portal_user_id,settlement_reference,bank_account_mask,bank_recipient_token) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [id, qrCode, displayCode, name, owner.rows[0].id, input.settlementReference?.trim() || null, input.bankAccountMask?.trim().slice(0, 30) || null, input.bankRecipientToken?.trim() || null]);
        return { id, displayCode, qrUrl: `${checkoutBase()}/scanqr?code=${displayCode}` };
      } catch (error) { if ((error as { code?: string }).code !== '23505') throw error; }
    }
    throw new ConflictException('Could not allocate a unique restaurant code. Try again.');
  }

  async listMerchants() {
    const result = await this.pool.query('SELECT id,trading_name,status,display_code,qr_code,payout_mode,tips_enabled,is_training,qr_checked_at,portal_user_id,settlement_reference,bank_account_mask,bank_recipient_token IS NOT NULL AS bank_recipient_configured,created_at FROM restaurant_merchants ORDER BY created_at DESC LIMIT 200');
    return result.rows.map(row => ({ ...row, qr_url: `${checkoutBase()}/scanqr?code=${row.display_code ?? row.qr_code}`, qr_code: undefined }));
  }

  async configureMerchant(id: string, input: { status?: string; payoutMode?: string; tipsEnabled?: boolean; qrChecked?: boolean; settlementReference?: string; bankAccountMask?: string; bankRecipientToken?: string; portalEmail?: string }) {
    if (!validId(id)) throw new NotFoundException();
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      const current = await db.query('SELECT * FROM restaurant_merchants WHERE id=$1 FOR UPDATE', [id]);
      if (!current.rows[0]) throw new NotFoundException();
      if (current.rows[0].is_training) throw new ForbiddenException('Training restaurants cannot be configured for launch.');
      const status = input.status ?? current.rows[0].status;
      const mode = input.payoutMode ?? current.rows[0].payout_mode;
      if (!['DRAFT','ACTIVE','SUSPENDED'].includes(status) || !['ON_DEMAND','DAILY'].includes(mode)) throw new BadRequestException('Invalid restaurant setting.');
      let owner = current.rows[0].portal_user_id;
      if (input.portalEmail) {
        const found = await db.query("SELECT id FROM users WHERE lower(email)=$1 AND status='ACTIVE'", [input.portalEmail.trim().toLowerCase()]);
        if (!found.rows[0]) throw new NotFoundException('Restaurant contact account not found.');
        owner = found.rows[0].id;
      }
      const settlement = input.settlementReference?.trim() || current.rows[0].settlement_reference;
      const mask = input.bankAccountMask?.trim().slice(0, 30) || current.rows[0].bank_account_mask;
      const recipient = input.bankRecipientToken?.trim() || current.rows[0].bank_recipient_token;
      if (status === 'ACTIVE' && (!settlement || !recipient || !mask || !owner)) throw new BadRequestException('Verify the restaurant contact, bank recipient and settlement reference before activation.');
      const qrCheckedAt = input.qrChecked === true ? new Date() : current.rows[0].qr_checked_at;
      if (status === 'ACTIVE' && current.rows[0].status !== 'ACTIVE' && !qrCheckedAt) {
        throw new BadRequestException('Scan the printed QR and confirm the restaurant before activation.');
      }
      await db.query('UPDATE restaurant_merchants SET status=$1,payout_mode=$2,portal_user_id=$3,settlement_reference=$4,bank_account_mask=$5,bank_recipient_token=$6,tips_enabled=$8,qr_checked_at=$9 WHERE id=$7', [status, mode, owner, settlement, mask, recipient, id, input.tipsEnabled ?? current.rows[0].tips_enabled, qrCheckedAt]);
      await db.query('COMMIT');
      return { updated: true };
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  }

  async dashboard(userId: string, roles: string[], merchantId?: string) {
    const admin = roles.includes('ADMIN') || roles.includes('SUPER_ADMIN');
    if (merchantId && !validId(merchantId)) throw new NotFoundException();
    const merchant = await this.pool.query(`SELECT id,trading_name,status,display_code,qr_code,payout_mode,tips_enabled,is_training,qr_checked_at,portal_user_id,settlement_reference,bank_account_mask,bank_recipient_token IS NOT NULL AS bank_recipient_configured FROM restaurant_merchants WHERE ${merchantId ? 'id=$1 AND ($2=TRUE OR portal_user_id=$3)' : 'portal_user_id=$1'} LIMIT 1`, merchantId ? [merchantId, admin, userId] : [userId]);
    if (!merchant.rows[0]) throw new NotFoundException('Restaurant account not found.');
    const id = merchant.rows[0].id;
    const [totals, transactions, payouts] = await Promise.all([
      this.pool.query(`SELECT coalesce(sum(i.amount_cents),0)::bigint AS paid_cents,coalesce(sum(i.amount_cents) FILTER (WHERE pi.item_id IS NULL),0)::bigint AS available_cents,coalesce(sum(i.amount_cents) FILTER (WHERE p.status IN ('REQUESTED','PROCESSING')),0)::bigint AS payout_pending_cents FROM restaurant_bill_items i JOIN restaurant_bills b ON b.id=i.bill_id LEFT JOIN restaurant_payout_items pi ON pi.item_id=i.id LEFT JOIN restaurant_payouts p ON p.id=pi.payout_id WHERE b.merchant_id=$1 AND i.status='PAID'`, [id]),
      this.pool.query("SELECT i.id,i.label,i.amount_cents,i.paid_at,b.bill_reference,b.service_day,u.first_name AS diner_name,p.status AS payout_status,p.payout_reference FROM restaurant_bill_items i JOIN restaurant_bills b ON b.id=i.bill_id LEFT JOIN users u ON u.id=i.claimed_by LEFT JOIN restaurant_payout_items pi ON pi.item_id=i.id LEFT JOIN restaurant_payouts p ON p.id=pi.payout_id WHERE b.merchant_id=$1 AND i.status='PAID' ORDER BY i.paid_at DESC LIMIT 100", [id]),
      this.pool.query('SELECT id,amount_cents,payout_reference,mode,status,bank_reference,failure_reason,created_at,paid_at FROM restaurant_payouts WHERE merchant_id=$1 ORDER BY created_at DESC LIMIT 50', [id]),
    ]);
    const { qr_code, ...safeMerchant } = merchant.rows[0];
    const qrUrl = `${checkoutBase()}/scanqr?code=${safeMerchant.display_code ?? qr_code}`;
    return { merchant: { ...safeMerchant, wallet_enabled: process.env.RESTAURANT_WALLET_PAYMENTS_ENABLED === 'true' && safeMerchant.status === 'ACTIVE' && !safeMerchant.is_training && !!safeMerchant.settlement_reference && safeMerchant.bank_recipient_configured, qrUrl, qr_url: qrUrl }, totals: totals.rows[0], transactions: transactions.rows, payouts: payouts.rows, eftEnabled: false };
  }

  async setTips(userId: string, merchantId: string, enabled: boolean) {
    if (!validId(merchantId) || typeof enabled !== 'boolean') throw new BadRequestException('Choose a valid tip setting.');
    const result = await this.pool.query('UPDATE restaurant_merchants SET tips_enabled=$1 WHERE id=$2 AND portal_user_id=$3 RETURNING tips_enabled', [enabled, merchantId, userId]);
    if (!result.rows[0]) throw new ForbiddenException('Only the restaurant owner can change tipping.');
    return { tipsEnabled: result.rows[0].tips_enabled };
  }

  async staffDashboard(userId: string) {
    const result = await this.pool.query("SELECT s.id,s.employee_code,s.status,s.shift_expires_at,m.trading_name,m.status AS merchant_status,m.tips_enabled,m.qr_code FROM restaurant_staff s JOIN restaurant_merchants m ON m.id=s.merchant_id WHERE s.user_id=$1 LIMIT 1", [userId]);
    if (!result.rows[0]) throw new NotFoundException('Your restaurant has not linked your account yet.');
    const { qr_code, ...staff } = result.rows[0];
    return { ...staff, qrUrl: `${checkoutBase()}/scanqr/?merchant=${qr_code}&employee=${staff.employee_code}` };
  }

  async startShift(userId: string) {
    const result = await this.pool.query("UPDATE restaurant_staff s SET shift_expires_at=now()+interval '12 hours' FROM restaurant_merchants m WHERE s.merchant_id=m.id AND s.user_id=$1 AND s.status='ACTIVE' AND m.status='ACTIVE' RETURNING s.id", [userId]);
    if (!result.rows[0]) throw new ForbiddenException('An active restaurant staff account is required.');
    return this.staffDashboard(userId);
  }

  async linkStaff(ownerId: string, merchantId: string, email: string) {
    if (!validId(merchantId) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) throw new BadRequestException('Enter an existing staff account email.');
    const owner = await this.pool.query("SELECT id FROM restaurant_merchants WHERE id=$1 AND portal_user_id=$2", [merchantId, ownerId]);
    if (!owner.rows[0]) throw new ForbiddenException('Only the restaurant owner can link staff.');
    const person = await this.pool.query("SELECT id FROM users WHERE lower(email)=$1 AND status='ACTIVE'", [email.trim().toLowerCase()]);
    if (!person.rows[0]) throw new NotFoundException('Ask the employee to create an XTRA-CASH account first.');
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const result = await this.pool.query('INSERT INTO restaurant_staff(id,merchant_id,user_id,employee_code) VALUES($1,$2,$3,$4) ON CONFLICT (merchant_id,user_id) DO UPDATE SET status=\'ACTIVE\' RETURNING employee_code', [randomUUID(), merchantId, person.rows[0].id, printedCode()]);
        return { employeeCode: result.rows[0].employee_code };
      } catch (error) { if ((error as { code?: string }).code !== '23505') throw error; }
    }
    throw new ConflictException('Could not allocate an employee code. Try again.');
  }

  async listStaff(ownerId: string, merchantId: string) {
    if (!validId(merchantId)) throw new NotFoundException();
    const owner = await this.pool.query('SELECT id FROM restaurant_merchants WHERE id=$1 AND portal_user_id=$2', [merchantId, ownerId]);
    if (!owner.rows[0]) throw new ForbiddenException();
    const result = await this.pool.query('SELECT s.id,s.employee_code,s.status,s.shift_expires_at,u.first_name,u.last_name,u.email FROM restaurant_staff s JOIN users u ON u.id=s.user_id WHERE s.merchant_id=$1 ORDER BY s.created_at DESC', [merchantId]);
    return result.rows;
  }

  private async reserve(db: PoolClient, merchantId: string, mode: 'ON_DEMAND' | 'DAILY', userId: string | null) {
    const merchant = await db.query('SELECT id,status,bank_recipient_token FROM restaurant_merchants WHERE id=$1 FOR UPDATE', [merchantId]);
    if (!merchant.rows[0]) throw new NotFoundException();
    if (merchant.rows[0].status !== 'ACTIVE' || !merchant.rows[0].bank_recipient_token) throw new ForbiddenException('Restaurant payout account is not ready.');
    const items = await db.query("SELECT i.id,i.amount_cents FROM restaurant_bill_items i JOIN restaurant_bills b ON b.id=i.bill_id LEFT JOIN restaurant_payout_items pi ON pi.item_id=i.id WHERE b.merchant_id=$1 AND i.status='PAID' AND pi.item_id IS NULL ORDER BY i.paid_at,i.id", [merchantId]);
    const amount = items.rows.reduce((sum, item) => sum + Number(item.amount_cents), 0);
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new ConflictException('No paid transactions are available for payout.');
    const id = randomUUID(), reference = `XCR${randomBytes(8).toString('hex').toUpperCase()}`;
    await db.query('INSERT INTO restaurant_payouts(id,merchant_id,amount_cents,payout_reference,mode,requested_by) VALUES($1,$2,$3,$4,$5,$6)', [id, merchantId, amount, reference, mode, userId]);
    for (const item of items.rows) await db.query('INSERT INTO restaurant_payout_items(payout_id,item_id) VALUES($1,$2)', [id, item.id]);
    return { id, amountCents: amount, payoutReference: reference, status: 'REQUESTED' };
  }

  async requestPayout(userId: string, roles: string[], merchantId: string) {
    if (!validId(merchantId)) throw new NotFoundException();
    const admin = roles.includes('ADMIN') || roles.includes('SUPER_ADMIN');
    const access = await this.pool.query('SELECT id FROM restaurant_merchants WHERE id=$1 AND ($2=TRUE OR portal_user_id=$3)', [merchantId, admin, userId]);
    if (!access.rows[0]) throw new ForbiddenException();
    const db = await this.pool.connect();
    try { await db.query('BEGIN'); const payout = await this.reserve(db, merchantId, 'ON_DEMAND', userId); await db.query('COMMIT'); return payout; }
    catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  }

  async setPayoutMode(userId: string, merchantId: string, mode: string) {
    if (!validId(merchantId) || !['ON_DEMAND', 'DAILY'].includes(mode)) throw new BadRequestException('Choose daily or on-demand payouts.');
    const result = await this.pool.query("UPDATE restaurant_merchants SET payout_mode=$1 WHERE id=$2 AND portal_user_id=$3 AND status='ACTIVE' RETURNING payout_mode", [mode, merchantId, userId]);
    if (!result.rows[0]) throw new ForbiddenException('Only the active restaurant account can change this payout schedule.');
    return { payoutMode: result.rows[0].payout_mode };
  }

  async queueDaily() {
    const merchants = await this.pool.query("SELECT id FROM restaurant_merchants WHERE status='ACTIVE' AND payout_mode='DAILY' ORDER BY id");
    let queued = 0;
    for (const merchant of merchants.rows) {
      const db = await this.pool.connect();
      try { await db.query('BEGIN'); await this.reserve(db, merchant.id, 'DAILY', null); await db.query('COMMIT'); queued++; }
      catch (error) { await db.query('ROLLBACK'); if (!(error instanceof ConflictException)) throw error; }
      finally { db.release(); }
    }
    return { queued, eftEnabled: false };
  }

  async recordBankOutcome(payoutId: string, paid: boolean, bankReference: string, note?: string, actorId?: string) {
    if (!validId(payoutId) || (paid && !/^[a-zA-Z0-9/_-]{6,100}$/.test(bankReference.trim()))) throw new BadRequestException('Enter a valid bank confirmation reference.');
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      const payout = await db.query('SELECT * FROM restaurant_payouts WHERE id=$1 FOR UPDATE', [payoutId]);
      if (!payout.rows[0]) throw new NotFoundException();
      if (!['REQUESTED','PROCESSING'].includes(payout.rows[0].status)) throw new ConflictException('Payout has already been resolved.');
      if (paid) {
        const journalId = randomUUID();
        await db.query("INSERT INTO ledger_journals(id,type,ref_type,ref_id,memo) VALUES($1,'RESTAURANT_EFT_PAYOUT','restaurant_payout',$2,$3)", [journalId, payoutId, `Confirmed EFT ${bankReference}`]);
        await db.query('INSERT INTO ledger_entries(id,journal_id,account,amount_cents) VALUES($1,$2,$3,$4),($5,$2,$6,$7)', [randomUUID(), journalId, `merchant_payable:${payout.rows[0].merchant_id}`, -payout.rows[0].amount_cents, randomUUID(), 'bank_clearing:restaurant_payout', payout.rows[0].amount_cents]);
        await db.query("UPDATE restaurant_payouts SET status='PAID',bank_reference=$1,paid_at=now(),confirmed_by=$3 WHERE id=$2", [bankReference.trim(), payoutId, actorId ?? null]);
        await db.query(`UPDATE restaurant_bills b SET status='SETTLED',settled_at=now() WHERE b.merchant_id=$1 AND b.status='FUNDED' AND NOT EXISTS (SELECT 1 FROM restaurant_bill_items i LEFT JOIN restaurant_payout_items pi ON pi.item_id=i.id LEFT JOIN restaurant_payouts p ON p.id=pi.payout_id WHERE i.bill_id=b.id AND (i.status<>'PAID' OR p.status IS DISTINCT FROM 'PAID'))`, [payout.rows[0].merchant_id]);
        await db.query("INSERT INTO restaurant_bill_notifications(id,user_id,bill_id,kind) SELECT gen_random_uuid()::text,bp.user_id,b.id,'BILL_SETTLED' FROM restaurant_bills b JOIN restaurant_bill_participants bp ON bp.bill_id=b.id WHERE b.merchant_id=$1 AND b.status='SETTLED' ON CONFLICT DO NOTHING", [payout.rows[0].merchant_id]);
      } else {
        await db.query("UPDATE restaurant_payouts SET status='FAILED',failure_reason=$1,confirmed_by=$3 WHERE id=$2", [String(note ?? 'Bank transfer failed').slice(0, 300), payoutId, actorId ?? null]);
        await db.query('DELETE FROM restaurant_payout_items WHERE payout_id=$1', [payoutId]);
      }
      await db.query('COMMIT'); return { status: paid ? 'PAID' : 'FAILED' };
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  }
}
