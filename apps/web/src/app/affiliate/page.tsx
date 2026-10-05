'use client';
import { useEffect, useState } from 'react';
import { Coins, Copy, Hourglass, Landmark, Share2, Users } from 'lucide-react';
import { formatZAR } from '@xtra/shared';
import { Alert, Button, Card, Field, Input, Loading, Modal, MoneyInput, PageHeader, Stat, StatusBadge, Table, Tabs, useAction, useApi, useAuth, useToast } from '@xtra/ui';

const TYPE_LABEL: Record<string, string> = {
  CONSUMER_ACTIVATION: 'Shopper activated',
  LENDER_ACCREDITED: 'Lender accredited',
  LOAN_ORIGINATION: 'Credit used',
};

export default function AffiliateDashboard() {
  const { me, client } = useAuth();
  const toast = useToast();
  const summary = useApi((c) => c.affiliate.summary());
  const referrals = useApi((c) => c.affiliate.referrals());
  const commissions = useApi((c) => c.affiliate.commissions());
  const payouts = useApi((c) => c.affiliate.payouts());
  const [tab, setTab] = useState<'referrals' | 'commissions' | 'payouts'>('referrals');
  useEffect(() => {
    const sync = () => { const t = window.location.hash.slice(1); if (t === 'referrals' || t === 'commissions' || t === 'payouts') setTab(t); };
    sync(); window.addEventListener('hashchange', sync); return () => window.removeEventListener('hashchange', sync);
  }, []);
  useEffect(() => { if (window.location.hash) document.getElementById('affiliate-details')?.scrollIntoView({ block: 'start' }); }, [tab]);
  const [bankOpen, setBankOpen] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);
  const [bank, setBank] = useState({ bankName: '', bankAccountNumber: '' });
  const [amount, setAmount] = useState<number | null>(null);

  const saveBank = useAction(async () => {
    await client.affiliate.saveBank(bank.bankName, bank.bankAccountNumber);
    toast('Bank details saved');
    setBankOpen(false);
    summary.reload();
  });
  const requestPayout = useAction(async () => {
    await client.affiliate.requestPayout(amount!);
    toast('Payout requested');
    setPayoutOpen(false);
    summary.reload();
    payouts.reload();
  });

  if (!summary.data || !me) return <Loading />;
  const s = summary.data;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const links = [
    { label: 'Shoppers', url: `${origin}/register?type=CONSUMER&ref=${me.referralCode}` },
    { label: 'Lenders', url: `${origin}/register?type=LENDER&ref=${me.referralCode}` },
    { label: 'Affiliates', url: `${origin}/register?type=AFFILIATE&ref=${me.referralCode}` },
  ];

  return (
    <div>
      <PageHeader
        title="Affiliate dashboard"
        subtitle={<>Your referral code: <b className="text-ink">{me.referralCode}</b></>}
        actions={
          <>
            <Button variant="secondary" onClick={() => { setBank({ bankName: s.bankName ?? '', bankAccountNumber: s.bankAccountNumber ?? '' }); setBankOpen(true); }}>
              <Landmark className="h-4 w-4" /> Bank details
            </Button>
            <Button onClick={() => setPayoutOpen(true)} disabled={s.commissionBalanceCents <= 0}>Request payout</Button>
          </>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat href="#payouts" label="Available to withdraw" value={formatZAR(s.commissionBalanceCents)} icon={<Coins className="h-4 w-4" />} />
        <Stat href="#commissions" label="Pending approval" value={formatZAR(s.pendingCents)} icon={<Hourglass className="h-4 w-4" />} />
        <Stat href="#commissions" label="Lifetime earned" value={formatZAR(s.lifetimeEarnedCents)} />
        <Stat href="#referrals" label="People referred" value={s.referrals} icon={<Users className="h-4 w-4" />} />
      </div>

      <Card className="mt-6">
        <div className="mb-3 flex items-center gap-2 font-bold"><Share2 className="h-4 w-4" /> Your invite links</div>
        <div className="space-y-2">
          {links.map((l) => (
            <div key={l.label} className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-sm text-muted">{l.label}</span>
              <code className="flex-1 truncate rounded-lg bg-surface px-3 py-2 text-xs">{l.url}</code>
              <Button size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(l.url).then(() => toast('Link copied'))}><Copy className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">You earn when a shopper you refer is verified, when a lender you refer is accredited, and a share of the credit your shoppers use. Commissions are approved by XTRA-CASH before payout.</p>
      </Card>

      <div id="affiliate-details" className="mt-6 scroll-mt-6">
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            { value: 'referrals', label: 'Referrals', count: referrals.data?.length },
            { value: 'commissions', label: 'Commissions', count: commissions.data?.length },
            { value: 'payouts', label: 'Payouts', count: payouts.data?.length },
          ]}
        />
        {tab === 'referrals' && (
          <Table
            rows={referrals.data ?? []}
            empty="No referrals yet — share your link!"
            columns={[
              { header: 'Name', cell: (r) => `${r.firstName} ${r.lastName}` },
              { header: 'Type', cell: (r) => r.roles.map((x) => x.toLowerCase()).join(', ') },
              { header: 'Verification', cell: (r) => <StatusBadge status={r.kycStatus} /> },
              { header: 'Joined', cell: (r) => new Date(r.createdAt).toLocaleDateString('en-ZA') },
            ]}
          />
        )}
        {tab === 'commissions' && (
          <Table
            rows={commissions.data ?? []}
            empty="No commissions yet"
            columns={[
              { header: 'Date', cell: (c) => new Date(c.createdAt).toLocaleDateString('en-ZA') },
              { header: 'Type', cell: (c) => TYPE_LABEL[c.type] },
              { header: 'Details', className: 'min-w-56 whitespace-normal', cell: (c) => <span className="text-muted">{c.description}</span> },
              { header: 'Amount', align: 'right', cell: (c) => <b>{formatZAR(c.amountCents)}</b> },
              { header: 'Status', cell: (c) => <StatusBadge status={c.status} /> },
            ]}
          />
        )}
        {tab === 'payouts' && (
          <Table
            rows={payouts.data ?? []}
            empty="No payouts yet"
            columns={[
              { header: 'Requested', cell: (p) => new Date(p.createdAt).toLocaleDateString('en-ZA') },
              { header: 'Bank', cell: (p) => `${p.bankName} ••${p.bankAccountNumber.slice(-4)}` },
              { header: 'Reference', cell: (p) => p.reference ?? '—' },
              { header: 'Amount', align: 'right', cell: (p) => formatZAR(p.amountCents) },
              { header: 'Status', cell: (p) => <StatusBadge status={p.status} /> },
            ]}
          />
        )}
      </div>

      <Modal open={bankOpen} onClose={() => setBankOpen(false)} title="Bank details for payouts">
        <div className="space-y-4">
          <Field label="Bank"><Input value={bank.bankName} onChange={(e) => setBank({ ...bank, bankName: e.target.value })} placeholder="e.g. Capitec" /></Field>
          <Field label="Account number"><Input inputMode="numeric" value={bank.bankAccountNumber} onChange={(e) => setBank({ ...bank, bankAccountNumber: e.target.value.replace(/\D/g, '') })} /></Field>
          {saveBank.error && <Alert tone="red">{saveBank.error}</Alert>}
          <Button className="w-full" loading={saveBank.loading} onClick={() => saveBank.run()}>Save</Button>
        </div>
      </Modal>
      <Modal open={payoutOpen} onClose={() => setPayoutOpen(false)} title="Request payout">
        <div className="space-y-4">
          <Field label="Amount" hint={`Up to ${formatZAR(s.commissionBalanceCents)}`}>
            <MoneyInput cents={amount} onCents={setAmount} />
          </Field>
          <Button size="sm" variant="secondary" onClick={() => setAmount(s.commissionBalanceCents)}>Withdraw all</Button>
          {!s.bankName && <Alert tone="amber">Add your bank details first.</Alert>}
          {requestPayout.error && <Alert tone="red">{requestPayout.error}</Alert>}
          <Button className="w-full" loading={requestPayout.loading} disabled={!amount} onClick={() => requestPayout.run()}>Request payout</Button>
        </div>
      </Modal>
    </div>
  );
}
