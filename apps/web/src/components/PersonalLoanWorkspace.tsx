'use client';
import Image from 'next/image';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatZAR } from '@xtra/shared';
import { Alert, Button, Loading, PageHeader, PersonalSettlementView, RecordLine, useApi } from '@xtra/ui';
import { SimpleLoanRequest } from './SimpleLoanRequest';
import { ApplicantDataVault } from './ApplicantDataVault';

const actions: Record<string, string> = { ACTION_REQUIRED: 'Respond now', OFFERED: 'Review and accept offer', ACCEPTED: 'View payment status', FUNDING_PENDING: 'View payment status', DISBURSED: 'View payment and repayments', DECLINED: 'View decision', CANCELLED: 'View details', FUNDING_FAILED: 'View payment update' };
const shortActions: Record<string, string> = { ACTION_REQUIRED: 'Respond', OFFERED: 'Review offer', ACCEPTED: 'Payment', FUNDING_PENDING: 'Payment', DISBURSED: 'Repayments', DECLINED: 'Decision', CANCELLED: 'Details', FUNDING_FAILED: 'Payment' };
function progress(status: string) { if (status === 'SUBMITTED') return 15; if (status === 'REFERRED') return 25; if (status === 'UNDER_REVIEW' || status === 'ACTION_REQUIRED') return 50; if (status === 'OFFERED') return 75; if (status === 'ACCEPTED' || status === 'FUNDING_PENDING') return 90; if (status === 'DISBURSED') return 100; return 0; }
type View = 'LIST' | 'CREATE' | 'VAULT' | 'APPLICATION';

export function PersonalLoanWorkspace({ title = 'Your personal-loan applications' }: { title?: string }) {
  const applications = useApi(c => c.consumer.personalApplications());
  const vault = useApi(c => c.consumer.applicantVault());
  const [view, setView] = useState<View>('LIST');
  const [active, setActive] = useState<string | null>(null);
  const close = () => { setView('LIST'); setActive(null); applications.reload(); };
  const getLoan = () => setView('CREATE');

  if (view === 'CREATE') return <section className="mx-auto w-full max-w-xl space-y-4">
    <Button variant="ghost" onClick={() => setView('LIST')}>← Back to loans</Button>
    <div className="rounded-[26px] bg-gradient-to-r from-[#32144e] via-[#7511aa] to-[#d91f63] px-5 py-4 text-white"><p className="text-xs font-semibold uppercase tracking-wider text-white/75">XTRA-CASH personal loan</p><h1 className="mt-1 text-xl font-bold text-white">Request a loan</h1><p className="mt-1 text-sm text-white/85">Choose your amount, review your details and submit securely.</p></div>
    <SimpleLoanRequest onSubmitted={close} />
  </section>;
  if (view === 'VAULT') return <section className="mx-auto w-full max-w-xl space-y-4"><Button variant="ghost" onClick={() => setView('LIST')}>← Back to loans</Button><PageHeader title="Prepare your data vault" subtitle="Add and review your details to fast-track eligibility."/><ApplicantDataVault onReady={() => { vault.reload(); setView('CREATE'); }} /></section>;
  if (view === 'APPLICATION' && active) return <section className="mx-auto w-full max-w-xl space-y-4"><Button variant="ghost" onClick={close}>← Back to loans</Button><PersonalSettlementView key={active} applicationId={active} /></section>;

  return <section className="space-y-4">
    <PageHeader title={title} subtitle="Apply, compare lender offers and manage repayments." actions={applications.data?.length ? <Button className="bg-gradient-to-r from-[#8c00cf] to-[#d91f63] text-white hover:brightness-105" onClick={getLoan}>Get a loan</Button> : undefined} />
    {vault.data && !vault.data.eligible && <Alert tone="amber">Your loan probation period is still active. You can wait {vault.data.probation.daysRemaining} day{vault.data.probation.daysRemaining === 1 ? '' : 's'} or complete your data vault to fast-track eligibility. <Button variant="secondary" onClick={() => setView('VAULT')}>Fast-track now</Button></Alert>}
    {applications.error && <Alert tone="red">{applications.error}<Button variant="secondary" onClick={applications.reload}>Try again</Button></Alert>}
    {applications.loading && !applications.data ? <Loading /> : !applications.error && !applications.data?.length ? <section className="relative flex min-h-48 items-center overflow-hidden rounded-[26px] bg-gradient-to-r from-[#32144e] via-[#7511aa] to-[#d91f63] p-5 text-white shadow-[0_12px_30px_rgba(51,17,78,.2)]"><Image src="/brand/ui/illustration_p_lender.png" alt="" aria-hidden width={240} height={170} className="absolute -right-2 bottom-0 h-40 w-40 object-contain object-bottom opacity-90"/><div className="relative z-10 max-w-[66%] space-y-2"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-white/70">Your next step</p><h2 className="text-xl font-bold text-white">Your first loan starts here.</h2><p className="text-xs leading-relaxed text-white/85">Choose an amount and period. Compare real lender offers before accepting.</p><Button className="mt-1 rounded-full bg-[#fb9320] text-[#1b1030] hover:bg-[#ffac45]" onClick={getLoan}>Get your first loan</Button></div></section> : <div className="overflow-hidden rounded-2xl border border-line bg-white">{applications.data?.map(app => <div key={app.id} className="border-b border-line last:border-0"><RecordLine title={`${formatZAR(app.amountCents)} · ${app.termMonths} months`} description={`${app.purpose} · ${new Date(app.createdAt).toLocaleDateString('en-ZA')}`} status={app.status} progress={progress(app.status)} actions={<Button size="sm" variant={['ACTION_REQUIRED', 'OFFERED'].includes(app.status) ? 'primary' : 'secondary'} aria-label={actions[app.status] ?? 'Track request'} onClick={() => { setActive(app.id); setView('APPLICATION'); }}>{shortActions[app.status] ?? 'Track'}</Button>} />{app.reviewNotes && <details className="px-4 pb-3 text-xs text-muted"><summary className="cursor-pointer font-semibold text-brand-purple">Latest update</summary><p className="mt-1">{app.reviewNotes}</p></details>}</div>)}</div>}
    {!!applications.data?.length && <section className="mt-8"><PageHeader title="Repayment schedules" subtitle="Your current loan balances and next payments."/><RecordLoans /></section>}
  </section>;
}

function RecordLoans() {
  const router = useRouter();
  const loans = useApi(c => c.consumer.loans());
  if (loans.loading && !loans.data) return <Loading />;
  const open = (loans.data ?? []).filter(l => l.status !== 'SETTLED');
  const owed = open.reduce((sum, loan) => sum + loan.outstandingCents, 0);
  return <div className="overflow-hidden rounded-2xl border border-violet-100 bg-white"><div className="flex items-center justify-between border-b border-violet-100 px-4 py-3 text-sm"><span className="text-muted">Outstanding · {open.length} active</span><span className="font-bold">{formatZAR(owed)}</span></div>{(loans.data ?? []).map(loan => <RecordLine key={loan.id} title={loan.lenderName} description={`${loan.offerName} · ${new Date(loan.createdAt).toLocaleDateString('en-ZA')}`} status={loan.status} progress={loan.status === 'SETTLED' ? 100 : undefined} actions={<Button size="sm" variant="secondary" onClick={() => router.push(`/app/loans/${loan.id}`)}>Details · {formatZAR(loan.outstandingCents)}</Button>} />)}</div>;
}
