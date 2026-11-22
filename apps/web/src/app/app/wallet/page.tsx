'use client';

import { useEffect, useState } from 'react';
import { Banknote, Plus, RefreshCw, Wallet } from 'lucide-react';
import { formatZAR } from '@xtra/shared';
import { Alert, Button, Card, Modal, StatusBadge, WalletTopUp, WalletTransferView, useApi, useAuth } from '@xtra/ui';

type Deposit = {
  id: string;
  amount_cents: number;
  reference: string;
  status: string;
  created_at: string;
};

export default function WalletPage() {
  const { me } = useAuth();
  const wallet = useApi(c => c.request<{ walletCents: number; deposits: Deposit[] }>('GET', '/me/wallet/deposits'), [me?.id]);
  const [action, setAction] = useState<'top-up' | 'transfer' | null>(null);
  useEffect(() => {
    const refresh = () => { if (!document.hidden) void wallet.reload(); };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [wallet.reload]);

  const balance = wallet.data?.walletCents ?? me?.walletBalanceCents;
  return <section className="mx-auto w-full max-w-xl space-y-4" aria-labelledby="wallet-title">
    <div className="flex items-center justify-between gap-2">
      <h1 id="wallet-title" className="text-2xl font-black text-[#1b1030]">My wallet</h1>
      <Button type="button" size="sm" variant="secondary" loading={wallet.loading} onClick={() => void wallet.reload()}>
        <RefreshCw size={15} aria-hidden /> Refresh
      </Button>
    </div>
    <div className="space-y-2 rounded-[24px] bg-gradient-to-br from-[#4c146e] to-[#7100ad] p-5 text-white shadow-lg">
      <Wallet size={23} aria-hidden />
      <p className="text-sm font-semibold text-white/85">{wallet.data ? 'Available cash' : balance === undefined ? 'Wallet balance' : 'Last loaded balance'}</p>
      <p className="break-words text-3xl font-black tabular-nums">{balance === undefined ? (wallet.error ? 'Unavailable' : 'Loading…') : formatZAR(balance)}</p>
    </div>
    {wallet.error && <Alert tone="amber">{wallet.error} Select Refresh to try again.</Alert>}
    <div className="flex flex-wrap gap-2">
      <Button type="button" onClick={() => setAction('top-up')}><Plus size={17} aria-hidden /> Top up wallet</Button>
      <Button type="button" variant="secondary" onClick={() => setAction('transfer')}><Banknote size={17} aria-hidden /> Bank transfers</Button>
    </div>
    <Card>
      <h2 className="mb-2 text-lg font-bold">Recent deposits</h2>
      {wallet.data?.deposits.length === 0 && <p className="text-sm text-muted">No deposits yet.</p>}
      {!wallet.data && <p className="text-sm text-muted">{wallet.error ? 'Deposit history is unavailable.' : 'Loading deposits…'}</p>}
      <ul className="divide-y divide-line">
        {wallet.data?.deposits.map(deposit => <li key={deposit.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
          <div className="min-w-0"><strong className="block break-all">{deposit.reference}</strong><time className="text-xs text-muted" dateTime={deposit.created_at}>{new Date(deposit.created_at).toLocaleDateString('en-ZA')}</time></div>
          <div className="flex items-center gap-2"><strong>{formatZAR(deposit.amount_cents)}</strong><StatusBadge status={deposit.status}/></div>
        </li>)}
      </ul>
    </Card>
    <Modal open={action !== null} title={action === 'top-up' ? 'Top up wallet' : 'Bank transfers'} onClose={() => {
      setAction(null);
      void wallet.reload();
    }}>
      {action === 'top-up' && <WalletTopUp />}
      {action === 'transfer' && <WalletTransferView />}
    </Modal>
  </section>;
}
