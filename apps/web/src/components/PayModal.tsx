'use client';
import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { formatZAR, type Transaction, type XtraBalance } from '@xtra/shared';
import { Alert, Button, Field, Input, Modal, MoneyInput, Select, useAction, useClient } from '@xtra/ui';

/**
 * In-app payment (marketplace / demo card swipe). Shows exactly how the purchase will be split
 * between wallet and XTRA-CASH credit before the consumer confirms.
 */
export function PayModal({ open, onClose, cardId, balance, onDone }: { open: boolean; onClose: () => void; cardId: string; balance: XtraBalance; onDone: () => void }) {
  const client = useClient();
  const [amount, setAmount] = useState<number | null>(null);
  const [merchant, setMerchant] = useState('');
  const [channel, setChannel] = useState<'IN_STORE' | 'ONLINE' | 'MARKETPLACE'>('IN_STORE');
  const [result, setResult] = useState<Transaction | null>(null);
  const [quote, setQuote] = useState<{ monthly: number; term: number; total: number; lender: string } | null>(null);

  useEffect(() => {
    if (!open) {
      setAmount(null);
      setMerchant('');
      setResult(null);
    }
  }, [open]);

  const fromWallet = Math.min(balance.walletCents, amount ?? 0);
  const fromCredit = Math.max(0, (amount ?? 0) - fromWallet);
  const over = (amount ?? 0) > balance.xtraBalanceCents;

  useEffect(() => {
    setQuote(null);
    const best = balance.offers.find((o) => o.availableCents >= fromCredit);
    if (!best || fromCredit <= 0) return;
    const t = setTimeout(() => {
      client.consumer
        .quote(best.offerId, fromCredit)
        .then((q) => setQuote({ monthly: q.monthlyInstallmentCents, term: best.termMonths, total: q.totalRepayableCents, lender: best.lenderName }))
        .catch(() => setQuote(null));
    }, 350);
    return () => clearTimeout(t);
  }, [fromCredit, balance.offers, client]);

  const pay = useAction(async () => {
    const t = await client.consumer.purchase(cardId, {
      amountCents: amount!,
      merchantName: merchant,
      channel,
      idempotencyKey: `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    });
    setResult(t);
    onDone();
  });

  return (
    <Modal open={open} onClose={onClose} title={result ? 'Payment result' : 'Pay with XTRA-CASH'}>
      {result ? (
        <div className="text-center">
          {result.status === 'APPROVED' ? <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" /> : <XCircle className="mx-auto h-12 w-12 text-red-600" />}
          <div className="mt-3 text-lg font-bold">{result.status === 'APPROVED' ? 'Approved' : 'Declined'}</div>
          <div className="text-sm text-muted">
            {result.merchantName} · {formatZAR(result.amountCents)}
          </div>
          {result.status === 'APPROVED' ? (
            <div className="mt-4 space-y-1 rounded-xl bg-surface p-3 text-left text-sm">
              <div className="flex justify-between">
                <span>From wallet</span>
                <span className="font-semibold">{formatZAR(result.fromWalletCents)}</span>
              </div>
              {result.loans?.map((l) => (
                <div key={l.id} className="flex justify-between">
                  <span>XTRA-CASH · {l.lenderName}</span>
                  <span className="font-semibold">{formatZAR(l.principalCents)}</span>
                </div>
              ))}
            </div>
          ) : (
            <Alert tone="red">{result.declineReason}</Alert>
          )}
          <Button className="mt-5 w-full" onClick={onClose}>
            Done
          </Button>
        </div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            pay.run();
          }}
        >
          <Field label="Merchant">
            <Input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="e.g. Shoprite Soweto" required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount">
              <MoneyInput cents={amount} onCents={setAmount} required />
            </Field>
            <Field label="Where">
              <Select value={channel} onChange={(e) => setChannel(e.target.value as any)}>
                <option value="IN_STORE">In store</option>
                <option value="ONLINE">Online</option>
                <option value="MARKETPLACE">XTRA-CASH marketplace</option>
              </Select>
            </Field>
          </div>
          {amount ? (
            <div className="space-y-1.5 rounded-xl bg-surface p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">From your wallet</span>
                <span className="font-semibold">{formatZAR(fromWallet)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">XTRA-CASH credit</span>
                <span className="font-semibold">{formatZAR(fromCredit)}</span>
              </div>
              {quote && (
                <div className="border-t border-line pt-1.5 text-xs text-muted">
                  Est. {quote.term} × {formatZAR(quote.monthly)} with {quote.lender} · total repayable {formatZAR(quote.total)}
                </div>
              )}
            </div>
          ) : null}
          {over && <Alert tone="red">This is more than your XTRA-Balance of {formatZAR(balance.xtraBalanceCents)}.</Alert>}
          {pay.error && <Alert tone="red">{pay.error}</Alert>}
          <Button className="w-full" size="lg" loading={pay.loading} disabled={!amount || !merchant || over}>
            Pay {amount ? formatZAR(amount) : ''}
          </Button>
          <p className="text-center text-xs text-muted">Credit comes from accredited lenders and is only offered when affordable.</p>
        </form>
      )}
    </Modal>
  );
}

export function TopUpModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const client = useClient();
  const [amount, setAmount] = useState<number | null>(null);
  const a = useAction(async () => {
    await client.consumer.topUp(amount!);
    onDone();
    onClose();
  });
  return (
    <Modal open={open} onClose={onClose} title="Top up wallet">
      <div className="space-y-4">
        <Field label="Amount" hint="Instant EFT / card. Your wallet always pays first, so topping up reduces what you borrow.">
          <MoneyInput cents={amount} onCents={setAmount} />
        </Field>
        <div className="flex gap-2">
          {[10_000, 50_000, 100_000].map((v) => (
            <Button key={v} variant="secondary" size="sm" onClick={() => setAmount(v)}>
              {formatZAR(v, { decimals: false })}
            </Button>
          ))}
        </div>
        {a.error && <Alert tone="red">{a.error}</Alert>}
        <Button className="w-full" loading={a.loading} disabled={!amount || amount < 100} onClick={() => a.run()}>
          Top up
        </Button>
      </div>
    </Modal>
  );
}
