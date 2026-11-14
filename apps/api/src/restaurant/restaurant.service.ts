import { randomBytes, randomUUID } from 'crypto';
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../common/db.module';
import { FILE_STORAGE } from '../integrations/integrations.module';
import type { FileStorage } from '../integrations/storage';

type ItemInput = { label: string; cents: number };
type BillInput = { merchant: string; merchantCode?: string; employeeCode?: string; reference: string; totalCents: number; items: ItemInput[] };

@Injectable()
export class RestaurantService {
  constructor(@Inject(PG_POOL) private pool: Pool, @Inject(FILE_STORAGE) private files: FileStorage) {}

  async resolveMerchant(codeInput: string, employeeCode?: string) {
    const code = String(codeInput ?? '').trim().toUpperCase();
    if (!(/^[A-Z]{3}[0-9]{3}$/.test(code) || /^[A-F0-9]{36}$/.test(code))) throw new BadRequestException('Enter the six character restaurant code, for example ABC123.');
    const found = await this.pool.query("SELECT id,trading_name,display_code,tips_enabled FROM restaurant_merchants WHERE (upper(qr_code)=$1 OR upper(display_code)=$1) AND status='ACTIVE'", [code]);
    if (!found.rows[0]) throw new NotFoundException('Restaurant code not found or not active.');
    let waiterName: string | null = null;
    if (employeeCode) {
      if (!/^[A-Z]{3}[0-9]{3}$/.test(employeeCode)) throw new BadRequestException('Invalid employee code.');
      const staff = await this.pool.query("SELECT u.first_name FROM restaurant_staff s JOIN users u ON u.id=s.user_id WHERE s.merchant_id=$1 AND s.employee_code=$2 AND s.status='ACTIVE' AND s.shift_expires_at>now()", [found.rows[0].id, employeeCode]);
      if (!staff.rows[0]) throw new NotFoundException('This waiter code is no longer active. Ask for a new code.');
      waiterName = staff.rows[0].first_name;
    }
    return { tradingName: found.rows[0].trading_name, displayCode: found.rows[0].display_code, waiterName, tipsEnabled: !!employeeCode && found.rows[0].tips_enabled };
  }

  async create(userId: string, input: BillInput) {
    const merchant = String(input.merchant ?? '').trim().slice(0, 80);
    const reference = String(input.reference ?? '').trim().slice(0, 40);
    const items = input.items;
    if (!merchant || !reference || !input.merchantCode || !Number.isSafeInteger(input.totalCents) || input.totalCents < 100 || input.totalCents > 100000000 || !Array.isArray(items) || !items.length || items.length > 35) throw new BadRequestException('Check the restaurant code, bill details and items.');
    const normalized = items.map(item => ({ label: String(item.label ?? '').trim().slice(0, 70), cents: Number(item.cents) }));
    if (normalized.some(item => !item.label || !Number.isSafeInteger(item.cents) || item.cents < 1) || normalized.reduce((sum, item) => sum + item.cents, 0) !== input.totalCents) throw new BadRequestException('Items must add up to the bill total.');
    const id = randomUUID(), token = randomBytes(32).toString('hex');
    let approvedMerchant: { id: string; trading_name: string } | null = null;
    let waiterId: string | null = null;
    if (input.merchantCode) {
      const code = String(input.merchantCode).trim().toUpperCase();
      if (!(/^[A-Z]{3}[0-9]{3}$/.test(code) || /^[A-F0-9]{36}$/.test(code))) throw new BadRequestException('Invalid restaurant code.');
      const approved = await this.pool.query("SELECT id,trading_name FROM restaurant_merchants WHERE (upper(qr_code)=$1 OR upper(display_code)=$1) AND status='ACTIVE'", [code]);
      if (!approved.rows[0]) throw new BadRequestException('This restaurant QR is not active.');
      approvedMerchant = approved.rows[0];
      if (input.employeeCode) {
        const employeeCode = String(input.employeeCode).trim().toUpperCase();
        if (!/^[A-Z]{3}[0-9]{3}$/.test(employeeCode)) throw new BadRequestException('Invalid employee code.');
        const staff = await this.pool.query("SELECT id FROM restaurant_staff WHERE merchant_id=$1 AND employee_code=$2 AND status='ACTIVE' AND shift_expires_at>now()", [approved.rows[0].id, employeeCode]);
        if (!staff.rows[0]) throw new BadRequestException('This waiter code is no longer active.');
        waiterId = staff.rows[0].id;
      }
    }
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      await db.query('INSERT INTO restaurant_bills(id,share_token,creator_id,merchant_id,waiter_id,merchant_name,bill_reference,total_cents) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [id, token, userId, approvedMerchant?.id ?? null, waiterId, approvedMerchant?.trading_name ?? merchant, reference, input.totalCents]);
      for (const [position, item] of normalized.entries()) await db.query('INSERT INTO restaurant_bill_items(id,bill_id,label,position,amount_cents) VALUES($1,$2,$3,$4,$5)', [randomUUID(), id, item.label, position, item.cents]);
      await db.query('INSERT INTO restaurant_bill_participants(bill_id,user_id) VALUES($1,$2)', [id, userId]);
      await db.query('COMMIT');
      return this.view(token);
    } catch (error) {
      await db.query('ROLLBACK');
      if ((error as { code?: string }).code === '23505') throw new ConflictException('This restaurant bill reference already has a shared table today.');
      throw error;
    }
    finally { db.release(); }
  }

  async view(token: string) {
    if (!/^[a-f0-9]{64}$/.test(token)) throw new NotFoundException('Bill not found.');
    const bill = await this.pool.query('SELECT b.id,b.merchant_name,b.bill_reference,b.total_cents,b.status,b.created_at,b.original_storage_key IS NOT NULL AS has_original,m.status AS merchant_status,m.tips_enabled,s.status AS waiter_status,s.shift_expires_at,u.first_name AS waiter_name,(m.settlement_reference IS NOT NULL AND m.bank_recipient_token IS NOT NULL) AS settlement_configured FROM restaurant_bills b LEFT JOIN restaurant_merchants m ON m.id=b.merchant_id LEFT JOIN restaurant_staff s ON s.id=b.waiter_id LEFT JOIN users u ON u.id=s.user_id WHERE b.share_token=$1 AND b.expires_at>now()', [token]);
    if (!bill.rows[0]) throw new NotFoundException('Bill not found.');
    const items = await this.pool.query(`SELECT i.id,i.label,i.amount_cents,i.status,i.claimed_by,u.first_name AS claimed_name FROM restaurant_bill_items i LEFT JOIN users u ON u.id=i.claimed_by WHERE i.bill_id=$1 ORDER BY i.position`, [bill.rows[0].id]);
    const { id, merchant_status, settlement_configured, waiter_status, shift_expires_at, ...publicBill } = bill.rows[0];
    return { ...publicBill, tips_enabled: !!publicBill.tips_enabled && waiter_status === 'ACTIVE' && new Date(shift_expires_at ?? 0).getTime() > Date.now(), canPayFromWallet: process.env.RESTAURANT_WALLET_PAYMENTS_ENABLED === 'true' && merchant_status === 'ACTIVE' && settlement_configured, items: items.rows, shareToken: token };
  }

  async claim(token: string, userId: string, ids: string[]) {
    if (!/^[a-f0-9]{64}$/.test(token) || !Array.isArray(ids) || !ids.length || ids.length > 35 || new Set(ids).size !== ids.length || ids.some(id => !/^[a-f0-9-]{36}$/.test(id))) throw new BadRequestException('Select valid items.');
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      const bill = await db.query('SELECT id,status FROM restaurant_bills WHERE share_token=$1 AND expires_at>now() FOR UPDATE', [token]);
      if (!bill.rows[0]) throw new NotFoundException('Bill not found.');
      if (bill.rows[0].status !== 'OPEN') throw new ConflictException('This bill is closed.');
      const selected = await db.query('SELECT id,status,claimed_by FROM restaurant_bill_items WHERE bill_id=$1 AND id=ANY($2::text[]) FOR UPDATE', [bill.rows[0].id, ids]);
      if (selected.rows.length !== ids.length) throw new BadRequestException('An item is not on this bill.');
      if (selected.rows.some(item => item.status === 'PAID' || item.status === 'PAYMENT_PENDING' || (item.claimed_by && item.claimed_by !== userId))) throw new ConflictException('An item has already been claimed or paid. Refresh the bill.');
      await db.query("UPDATE restaurant_bill_items SET claimed_by=$1,status='CLAIMED' WHERE bill_id=$2 AND id=ANY($3::text[])", [userId, bill.rows[0].id, ids]);
      await db.query('INSERT INTO restaurant_bill_participants(bill_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [bill.rows[0].id, userId]);
      await db.query('COMMIT');
      return this.view(token);
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  }

  async release(token: string, userId: string, ids: string[]) {
    if (!/^[a-f0-9]{64}$/.test(token) || !Array.isArray(ids) || !ids.length || ids.length > 35) throw new BadRequestException('Select valid items.');
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      const bill = await db.query('SELECT id,status FROM restaurant_bills WHERE share_token=$1 AND expires_at>now() FOR UPDATE', [token]);
      if (!bill.rows[0]) throw new NotFoundException('Bill not found.');
      if (bill.rows[0].status !== 'OPEN') throw new ConflictException('This bill is closed.');
      const result = await db.query("UPDATE restaurant_bill_items SET claimed_by=NULL,status='UNCLAIMED' WHERE bill_id=$1 AND id=ANY($2::text[]) AND claimed_by=$3 AND status='CLAIMED' RETURNING id", [bill.rows[0].id, ids, userId]);
      if (result.rows.length !== ids.length) throw new ForbiddenException('Only your unpaid claimed items can be released.');
      await db.query('COMMIT');
      return this.view(token);
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  }

  async payFromWallet(token: string, userId: string, idempotencyKey: string, tipCents = 0) {
    if (!/^[a-f0-9]{64}$/.test(token) || !/^[a-zA-Z0-9-]{8,80}$/.test(idempotencyKey)) throw new BadRequestException('Invalid payment request.');
    if (!Number.isSafeInteger(tipCents) || tipCents < 0) throw new BadRequestException('Invalid tip amount.');
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      if (process.env.RESTAURANT_WALLET_PAYMENTS_ENABLED !== 'true') throw new ForbiddenException('Restaurant wallet payments are not activated.');
      const bill = await db.query(`SELECT b.id,b.status,b.merchant_id,b.waiter_id,b.merchant_name,b.bill_reference,b.original_storage_key,m.status AS merchant_status,m.tips_enabled,m.settlement_reference,m.bank_recipient_token,s.user_id AS waiter_user_id,s.status AS waiter_status,s.shift_expires_at FROM restaurant_bills b LEFT JOIN restaurant_merchants m ON m.id=b.merchant_id LEFT JOIN restaurant_staff s ON s.id=b.waiter_id WHERE b.share_token=$1 AND b.expires_at>now() FOR UPDATE OF b`, [token]);
      if (!bill.rows[0]) throw new NotFoundException('Bill not found.');
      if (!bill.rows[0].merchant_id || bill.rows[0].merchant_status !== 'ACTIVE' || !bill.rows[0].settlement_reference || !bill.rows[0].bank_recipient_token) throw new ForbiddenException('This restaurant is not ready for wallet payments.');
      const prior = await db.query("SELECT id FROM ledger_journals WHERE type='RESTAURANT_WALLET_PAYMENT' AND ref_type='restaurant_bill_payment' AND ref_id=$1 LIMIT 1", [`${bill.rows[0].id}:${userId}:${idempotencyKey}`]);
      if (prior.rows.length) { await db.query('COMMIT'); return this.view(token); }
      if (bill.rows[0].status !== 'OPEN') throw new ConflictException('This bill is closed.');
      const selected = await db.query("SELECT id,label,amount_cents FROM restaurant_bill_items WHERE bill_id=$1 AND claimed_by=$2 AND status='CLAIMED' FOR UPDATE", [bill.rows[0].id, userId]);
      const amount = selected.rows.reduce((sum, row) => sum + Number(row.amount_cents), 0);
      if (!amount || !Number.isSafeInteger(amount)) throw new BadRequestException('Claim items before paying.');
      if (tipCents > 0 && (!bill.rows[0].tips_enabled || !bill.rows[0].waiter_id || bill.rows[0].waiter_status !== 'ACTIVE' || new Date(bill.rows[0].shift_expires_at ?? 0).getTime() <= Date.now() || bill.rows[0].waiter_user_id === userId)) throw new ForbiddenException('Tips are unavailable for this bill.');
      if (tipCents > amount) throw new BadRequestException('The tip cannot exceed your bill share.');
      const debit = await db.query('UPDATE users SET wallet_balance_cents=wallet_balance_cents-$1 WHERE id=$2 AND wallet_balance_cents >= $1 RETURNING wallet_balance_cents', [amount + tipCents, userId]);
      if (!debit.rows.length) throw new ConflictException('Not enough money in your XTRA-CASH wallet.');
      const journalId = randomUUID();
      await db.query("INSERT INTO ledger_journals(id,type,ref_type,ref_id,memo) VALUES($1,'RESTAURANT_WALLET_PAYMENT','restaurant_bill_payment',$2,$3)", [journalId, `${bill.rows[0].id}:${userId}:${idempotencyKey}`, `Wallet payment for ${bill.rows[0].bill_reference}`]);
      await db.query('INSERT INTO ledger_entries(id,journal_id,account,amount_cents) VALUES($1,$2,$3,$4),($5,$2,$6,$7)', [randomUUID(), journalId, `wallet:${userId}`, -(amount + tipCents), randomUUID(), `merchant_payable:${bill.rows[0].merchant_id}`, amount]);
      if (tipCents > 0) {
        await db.query('UPDATE users SET wallet_balance_cents=wallet_balance_cents+$1 WHERE id=$2', [tipCents, bill.rows[0].waiter_user_id]);
        await db.query('INSERT INTO ledger_entries(id,journal_id,account,amount_cents) VALUES($1,$2,$3,$4)', [randomUUID(), journalId, `wallet:${bill.rows[0].waiter_user_id}`, tipCents]);
        await db.query('INSERT INTO restaurant_tips(id,bill_id,waiter_id,payer_id,journal_id,amount_cents) VALUES($1,$2,$3,$4,$5,$6)', [randomUUID(), bill.rows[0].id, bill.rows[0].waiter_id, userId, journalId, tipCents]);
      }
      const itemIds = selected.rows.map(row => row.id);
      await db.query("UPDATE restaurant_bill_items SET status='PAID',paid_at=now(),payment_reference=$1 WHERE bill_id=$2 AND id=ANY($3::text[])", [journalId, bill.rows[0].id, itemIds]);
      const digitized = { merchant: bill.rows[0].merchant_name, reference: bill.rows[0].bill_reference, items: selected.rows.map(row => ({ label: row.label, cents: row.amount_cents })), tipCents, walletJournalId: journalId, merchantSettlement: 'PENDING' };
      await db.query("INSERT INTO customer_receipts(id,user_id,bill_id,kind,title,original_storage_key,digitized_json,total_cents) VALUES($1,$2,$3,'RESTAURANT_SHARE',$4,$5,$6,$7)", [randomUUID(), userId, bill.rows[0].id, `${bill.rows[0].merchant_name} · ${bill.rows[0].bill_reference}`, bill.rows[0].original_storage_key, digitized, amount + tipCents]);
      const remaining = await db.query("SELECT count(*)::int AS count FROM restaurant_bill_items WHERE bill_id=$1 AND status<>'PAID'", [bill.rows[0].id]);
      if (remaining.rows[0].count === 0) {
        await db.query("UPDATE restaurant_bills SET status='FUNDED' WHERE id=$1", [bill.rows[0].id]);
        await db.query("INSERT INTO restaurant_bill_notifications(id,user_id,bill_id,kind) SELECT gen_random_uuid()::text,user_id,bill_id,'BILL_FUNDED' FROM restaurant_bill_participants WHERE bill_id=$1 ON CONFLICT DO NOTHING", [bill.rows[0].id]);
      }
      await db.query('COMMIT');
      return this.view(token);
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  }

  async attachOriginal(token: string, userId: string, file: Express.Multer.File) {
    if (!/^[a-f0-9]{64}$/.test(token)) throw new NotFoundException();
    const bill = await this.pool.query('SELECT id,creator_id,original_storage_key FROM restaurant_bills WHERE share_token=$1', [token]);
    if (!bill.rows[0]) throw new NotFoundException();
    if (bill.rows[0].creator_id !== userId) throw new ForbiddenException();
    if (bill.rows[0].original_storage_key) throw new ConflictException('Original receipt already saved.');
    if (!file || !['image/jpeg','image/png','image/webp','application/pdf'].includes(file.mimetype) || file.size > 12 * 1024 * 1024) throw new BadRequestException('Choose a JPG, PNG, WebP or PDF under 12 MB.');
    const key = await this.files.put(file.buffer, file.originalname);
    await this.pool.query('UPDATE restaurant_bills SET original_storage_key=$1 WHERE id=$2 AND original_storage_key IS NULL', [key, bill.rows[0].id]);
    return { stored: true };
  }

  async archive(userId: string, file: Express.Multer.File, title: string, digitizedJson?: string) {
    if (!file || !['image/jpeg','image/png','image/webp','application/pdf'].includes(file.mimetype) || file.size > 12 * 1024 * 1024) throw new BadRequestException('Choose a JPG, PNG, WebP or PDF under 12 MB.');
    const id = randomUUID();
    let digitized: { merchant?: string; reference?: string; totalCents?: number; items?: { label: string; cents: number }[] } | null = null;
    if (digitizedJson && digitizedJson.length < 20000) {
      try {
        const parsed = JSON.parse(digitizedJson);
        if (parsed && typeof parsed === 'object') digitized = { merchant: String(parsed.merchant ?? '').slice(0, 80), reference: String(parsed.reference ?? '').slice(0, 40), totalCents: Number.isSafeInteger(parsed.totalCents) ? parsed.totalCents : 0, items: Array.isArray(parsed.items) ? parsed.items.slice(0, 35).map((item: { label?: string; cents?: number }) => ({ label: String(item.label ?? '').slice(0, 70), cents: Number.isSafeInteger(item.cents) ? item.cents : 0 })) : [] };
      } catch { throw new BadRequestException('Invalid digitized receipt.'); }
    }
    const key = await this.files.put(file.buffer, file.originalname);
    await this.pool.query("INSERT INTO customer_receipts(id,user_id,kind,title,original_storage_key,digitized_json,total_cents) VALUES($1,$2,'PERSONAL_ARCHIVE',$3,$4,$5,$6)", [id, userId, String(title ?? 'Receipt').trim().slice(0, 100) || 'Receipt', key, digitized, digitized?.totalCents ?? null]);
    return { id, stored: true };
  }

  async receipts(userId: string) {
    const result = await this.pool.query('SELECT r.id,r.kind,r.title,r.total_cents,r.digitized_json,r.original_storage_key IS NOT NULL AS has_original,r.created_at,r.emailed_at,b.status AS merchant_settlement_status FROM customer_receipts r LEFT JOIN restaurant_bills b ON b.id=r.bill_id WHERE r.user_id=$1 ORDER BY r.created_at DESC LIMIT 100', [userId]);
    return result.rows;
  }

  async notifications(userId: string) {
    const result = await this.pool.query(`SELECT n.id,n.kind,n.created_at,n.read_at,b.share_token,b.merchant_name,b.bill_reference FROM restaurant_bill_notifications n JOIN restaurant_bills b ON b.id=n.bill_id WHERE n.user_id=$1 ORDER BY n.created_at DESC LIMIT 50`, [userId]);
    return result.rows;
  }

  async readNotification(userId: string, notificationId: string) {
    if (!/^[a-f0-9-]{36}$/.test(notificationId)) throw new NotFoundException();
    const result = await this.pool.query('UPDATE restaurant_bill_notifications SET read_at=coalesce(read_at,now()) WHERE id=$1 AND user_id=$2 RETURNING id', [notificationId, userId]);
    if (!result.rows.length) throw new NotFoundException();
    return { read: true };
  }

  async receiptOriginal(userId: string, receiptId: string) {
    if (!/^[a-f0-9-]{36}$/.test(receiptId)) throw new NotFoundException();
    const result = await this.pool.query('SELECT r.original_storage_key,f.original_name FROM customer_receipts r LEFT JOIN stored_files f ON f.key=r.original_storage_key WHERE r.id=$1 AND r.user_id=$2', [receiptId, userId]);
    if (!result.rows[0]?.original_storage_key) throw new NotFoundException('Original receipt not found.');
    const filename = String(result.rows[0].original_name ?? `receipt-${receiptId}.jpg`).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
    return { buffer: await this.files.get(result.rows[0].original_storage_key), filename };
  }
}
