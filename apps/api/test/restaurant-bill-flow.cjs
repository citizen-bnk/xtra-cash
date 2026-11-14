// Isolated database test: two diners claim distinct items, pay once from wallets, and receive receipts.
require('reflect-metadata');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const { RestaurantService } = require('../dist/restaurant/restaurant.service');
const { RestaurantPayoutService } = require('../dist/restaurant/restaurant-payout.service');

async function main() {
  process.env.RESTAURANT_WALLET_PAYMENTS_ENABLED = 'true';
  const pg = new PGlite();
  try {
    await pg.exec("CREATE TYPE role AS ENUM ('CONSUMER'); CREATE TABLE users(id text PRIMARY KEY,email text,first_name text,last_name text,roles role[],referral_code text,status text NOT NULL DEFAULT 'ACTIVE',wallet_balance_cents integer NOT NULL DEFAULT 0); CREATE TABLE stored_files(key text PRIMARY KEY,original_name text,size_bytes integer,content bytea); CREATE TABLE ledger_journals(id text PRIMARY KEY,type text,ref_type text,ref_id text,memo text); CREATE TABLE ledger_entries(id text PRIMARY KEY,journal_id text REFERENCES ledger_journals(id),account text,amount_cents integer);");
    await pg.exec(fs.readFileSync(path.join(__dirname, '../drizzle/0021_restaurant_bills.sql'), 'utf8'));
    await pg.exec(fs.readFileSync(path.join(__dirname, '../drizzle/0022_restaurant_payouts.sql'), 'utf8'));
    for (const [id, name] of [['diner-a', 'Amina'], ['diner-b', 'Busi']])
      await pg.query("INSERT INTO users(id,email,first_name,last_name,roles,referral_code) VALUES($1,$2,$3,'Diner',ARRAY['CONSUMER']::role[],$4)", [id, `${id}@example.test`, name, id]);
    const merchantId = randomUUID(), code = 'A1'.repeat(18), printed = 'TBL123';
    await pg.query("INSERT INTO restaurant_merchants(id,qr_code,display_code,trading_name,status,settlement_reference,bank_account_mask,bank_recipient_token,portal_user_id) VALUES($1,$2,$3,'Table Cafe','ACTIVE','pilot-settlement-1','Bank ····1234','recipient-1','diner-a')", [merchantId, code, printed]);
    const pool = { query: (...args) => pg.query(...args), connect: async () => ({ query: (...args) => pg.query(...args), release() {} }) };
    const storage = { put: async (buffer, originalname) => { const key = `${randomUUID()}.jpg`; await pg.query('INSERT INTO stored_files(key,original_name,size_bytes,content) VALUES($1,$2,$3,$4)', [key, originalname, buffer.length, buffer]); return key; }, get: async (key) => Buffer.from((await pg.query('SELECT content FROM stored_files WHERE key=$1', [key])).rows[0].content) };
    const service = new RestaurantService(pool, storage);
    const payouts = new RestaurantPayoutService(pool);
    await assert.rejects(service.create('diner-a', { merchant: 'Unknown Cafe', reference: 'T-9', totalCents: 10000, items: [{ label: 'Tea', cents: 10000 }] }), /restaurant code/);
    assert.equal((await service.resolveMerchant(printed)).tradingName, 'Table Cafe');
    const created = await service.create('diner-a', { merchant: 'Ignored OCR name', merchantCode: printed, reference: 'T-8', totalCents: 30000, items: [{ label: 'Soup', cents: 10000 }, { label: 'Pizza', cents: 20000 }] });
    assert.equal(created.canPayFromWallet, true);
    await assert.rejects(service.create('diner-b', { merchant: 'Table Cafe', merchantCode: code, reference: 'T-8', totalCents: 30000, items: [{ label: 'Soup', cents: 10000 }, { label: 'Pizza', cents: 20000 }] }), /already has a shared table/);
    const soup = created.items.find(item => item.label === 'Soup'), pizza = created.items.find(item => item.label === 'Pizza');
    await service.claim(created.shareToken, 'diner-a', [soup.id]);
    await assert.rejects(service.claim(created.shareToken, 'diner-b', [soup.id]), /claimed/);
    await service.claim(created.shareToken, 'diner-b', [pizza.id]);
    await assert.rejects(service.payFromWallet(created.shareToken, 'diner-a', 'pay-diner-a-1'), /Not enough money/);
    await pg.query('UPDATE users SET wallet_balance_cents=$1 WHERE id=$2', [10000, 'diner-a']);
    await pg.query('UPDATE users SET wallet_balance_cents=$1 WHERE id=$2', [20000, 'diner-b']);
    await service.attachOriginal(created.shareToken, 'diner-a', { buffer: Buffer.from('image'), originalname: 'bill.jpg', mimetype: 'image/jpeg', size: 5 });
    const first = await service.payFromWallet(created.shareToken, 'diner-a', 'pay-diner-a-1');
    assert.equal(first.items.filter(i => i.status === 'PAID').length, 1);
    await service.payFromWallet(created.shareToken, 'diner-a', 'pay-diner-a-1');
    const second = await service.payFromWallet(created.shareToken, 'diner-b', 'pay-diner-b-1');
    assert.equal(second.status, 'FUNDED');
    assert.equal(second.items.filter(i => i.status === 'PAID').length, 2);
    const balances = await pg.query('SELECT id,wallet_balance_cents FROM users WHERE id IN ($1,$2)', ['diner-a', 'diner-b']);
    assert.ok(balances.rows.every(row => row.wallet_balance_cents === 0));
    const journals = await pg.query("SELECT journal_id,sum(amount_cents)::int AS sum FROM ledger_entries GROUP BY journal_id");
    assert.equal(journals.rows.length, 2);
    assert.ok(journals.rows.every(row => row.sum === 0));
    assert.equal((await service.receipts('diner-a')).length, 1);
    assert.equal((await service.receipts('diner-b')).length, 1);
    assert.equal((await service.notifications('diner-a')).length, 1);
    assert.equal((await service.notifications('diner-b')).length, 1);
    const before = await payouts.dashboard('diner-a', ['CONSUMER']);
    assert.equal(Number(before.totals.available_cents), 30000);
    await assert.rejects(payouts.setPayoutMode('diner-b', merchantId, 'DAILY'), /Only the active restaurant account/);
    assert.equal((await payouts.setPayoutMode('diner-a', merchantId, 'DAILY')).payoutMode, 'DAILY');
    await assert.rejects(payouts.requestPayout('diner-b', ['CONSUMER'], merchantId), /Forbidden/);
    const payout = await payouts.requestPayout('diner-a', ['CONSUMER'], merchantId);
    assert.equal(payout.amountCents, 30000);
    await assert.rejects(payouts.requestPayout('diner-a', ['CONSUMER'], merchantId), /No paid transactions/);
    assert.equal(Number((await payouts.dashboard('diner-a', ['CONSUMER'])).totals.available_cents), 0);
    await payouts.recordBankOutcome(payout.id, true, 'BANKREF123');
    assert.equal((await service.view(created.shareToken)).status, 'SETTLED');
    assert.equal((await service.notifications('diner-a')).length, 2);
    const payoutLedger = await pg.query("SELECT sum(amount_cents)::int AS total FROM ledger_entries WHERE account=$1", [`merchant_payable:${merchantId}`]);
    assert.equal(payoutLedger.rows[0].total, 0);
    console.log('Restaurant bill wallet flow passed.');
  } finally { await pg.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
