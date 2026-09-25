'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Copy, Landmark, LogOut, Users } from 'lucide-react';
import { EMPLOYMENT_LABELS, formatZAR } from '@xtra/shared';
import { Button, Card, PageHeader, StatusBadge, useAuth, useToast } from '@xtra/ui';

export default function ProfilePage() {
  const { me, client, logout, refreshMe } = useAuth();
  const router = useRouter();
  const toast = useToast();
  if (!me) return null;
  const link = typeof window !== 'undefined' ? `${window.location.origin}/register?ref=${me.referralCode}` : '';
  return (
    <div className="space-y-4">
      <PageHeader title="Profile" />
      <Card className="grid gap-3 text-sm sm:grid-cols-2">
        <Row k="Name" v={`${me.firstName} ${me.lastName}`} />
        <Row k="Email" v={me.email} />
        <Row k="Mobile" v={me.phone} />
        <Row k="Wallet" v={formatZAR(me.walletBalanceCents)} />
        <Row k="Verification" v={<StatusBadge status={me.kyc?.status ?? 'NOT_STARTED'} />} />
        {me.kyc && <Row k="Employment" v={EMPLOYMENT_LABELS[me.kyc.employmentStatus]} />}
        {me.kyc && <Row k="Declared income" v={formatZAR(me.kyc.monthlyIncomeCents)} />}
        {me.kyc && <Row k="Province" v={me.kyc.province} />}
        <div className="sm:col-span-2">
          <Link href="/app/kyc" className="text-sm font-semibold underline">
            Update income & expenses
          </Link>
        </div>
      </Card>

      <Card>
        <div className="flex items-start gap-3">
          <Users className="mt-0.5 h-5 w-5 text-lime-dark" />
          <div className="flex-1">
            <div className="font-semibold">Invite friends, earn commission</div>
            {me.affiliate ? (
              <>
                <p className="mt-1 text-sm text-muted">Share your link. You earn when people you invite activate and use XTRA-CASH.</p>
                <div className="mt-3 flex gap-2">
                  <code className="flex-1 truncate rounded-lg bg-surface px-3 py-2 text-xs">{link}</code>
                  <Button size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(link).then(() => toast('Link copied'))}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <Link href="/affiliate" className="mt-3 inline-block text-sm font-semibold underline">
                  Open affiliate dashboard
                </Link>
              </>
            ) : (
              <>
                <p className="mt-1 text-sm text-muted">Join the XTRA-CASH affiliate programme to earn from every shopper, trader and lender you onboard.</p>
                <Button
                  size="sm"
                  className="mt-3"
                  onClick={async () => {
                    await client.affiliate.join();
                    await refreshMe();
                    toast('Welcome to the affiliate programme!');
                  }}
                >
                  Become an affiliate
                </Button>
              </>
            )}
          </div>
        </div>
      </Card>

      {me.roles.includes('LENDER') && (
        <Card className="flex items-center gap-3">
          <Landmark className="h-5 w-5 text-lime-dark" />
          <div className="flex-1 text-sm font-medium">You also run a Credit Mall stall.</div>
          <Link href="/lender">
            <Button size="sm" variant="secondary">Lender portal</Button>
          </Link>
        </Card>
      )}

      <Button
        variant="ghost"
        onClick={async () => {
          await logout();
          router.replace('/');
        }}
      >
        <LogOut className="h-4 w-4" /> Sign out
      </Button>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line pb-2 sm:border-0 sm:pb-0">
      <span className="text-muted">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
}
