'use client';
import Image from 'next/image';
import { useState } from 'react';
import { ArrowLeft, ArrowRight, Banknote, ChevronRight, FileText, Sparkles } from 'lucide-react';
import { formatZAR } from '@xtra/shared';
import { Alert, Button, Loading, PersonalSettlementView, StatusBadge, useApi, useAuth } from '@xtra/ui';
import { SimpleLoanRequest } from './SimpleLoanRequest';
import { ApplicantDataVault } from './ApplicantDataVault';

type View = 'LIST' | 'CREATE' | 'VAULT' | 'APPLICATION';
const progress: Record<string, number> = { SUBMITTED: 15, REFERRED: 25, UNDER_REVIEW: 50, ACTION_REQUIRED: 50, OFFERED: 75, ACCEPTED: 90, FUNDING_PENDING: 90, DISBURSED: 100 };
const actionLabel: Record<string, string> = { ACTION_REQUIRED: 'Respond', OFFERED: 'Review offer', ACCEPTED: 'Payment', FUNDING_PENDING: 'Payment', DISBURSED: 'Repayments' };

export function PersonalLoanWorkspace({ title = 'Loans' }: { title?: string }) {
  const { me } = useAuth();
  const applications = useApi(c => c.consumer.personalApplications());
  const vault = useApi(c => c.consumer.applicantVault());
  const [view, setView] = useState<View>('LIST'), [active, setActive] = useState<string | null>(null);
  const close = () => { setView('LIST'); setActive(null); applications.reload(); vault.reload(); };
  const back = () => <button type="button" onClick={close} className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-[#5c2394]"><ArrowLeft className="h-4 w-4" /> Back to loans</button>;
  if (view === 'CREATE') return <section className="mx-auto w-full max-w-xl space-y-4">{back()}<div className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-[#1b1030] via-[#7100ad] to-[#d91f63] px-5 py-6 text-white shadow-[0_12px_30px_rgba(51,17,78,.25)]"><div className="absolute -bottom-16 -right-10 h-40 w-40 rounded-full bg-[#fb9320] blur-2xl"/><p className="relative text-xs font-semibold uppercase tracking-wider text-white/75">XTRA-CASH · Loans</p><h1 className="relative mt-1 text-2xl font-black text-white">Get a loan</h1><p className="relative mt-1 text-sm text-white/85">Choose an amount. We’ll guide you from there.</p></div><SimpleLoanRequest onSubmitted={close} /></section>;
  if (view === 'VAULT') return <section className="mx-auto w-full max-w-xl space-y-4">{back()}<ApplicantDataVault onReady={() => { vault.reload(); setView('CREATE'); }} /></section>;
  if (view === 'APPLICATION' && active) return <section className="mx-auto w-full max-w-xl space-y-4">{back()}<PersonalSettlementView key={active} applicationId={active} /></section>;
  return <section className="mx-auto w-full max-w-xl space-y-4 pb-6">
    <div className="relative overflow-hidden rounded-[28px] bg-[radial-gradient(circle_at_100%_0%,#f6008f_0%,transparent_32%),linear-gradient(145deg,#1b1030_0%,#5c2394_55%,#a617d3_100%)] p-5 text-white shadow-[0_14px_32px_rgba(37,0,65,.25)]">
      <div className="absolute -bottom-20 -right-6 h-44 w-44 rounded-full bg-[#fb9320] blur-3xl" />
      <div className="relative"><p className="text-xs font-bold uppercase tracking-[.18em] text-white/75">XTRA-CASH</p><h1 className="mt-2 text-2xl font-black text-white">{title}</h1><p className="mt-1 text-sm text-white/85">Hi {me?.firstName || 'there'} 👋 What would you like to do?</p></div>
      <button type="button" onClick={() => setView('CREATE')} className="relative mt-5 flex w-full items-center gap-3 rounded-[22px] border border-white/80 bg-white/95 p-4 text-left text-[#1b1030] shadow-[0_6px_22px_rgba(27,16,48,.22)]"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#fb9320] to-[#d91f63] text-white"><Banknote className="h-6 w-6" /></span><span className="min-w-0 flex-1"><strong className="block text-base font-black">Get a Loan</strong><span className="block text-xs text-[#5c2394]">Quick, simple and flexible</span></span><ArrowRight className="h-5 w-5 text-[#5c2394]" /></button>
      <div className="relative mt-4 flex items-end justify-between"><p className="max-w-[48%] text-xs leading-relaxed text-white/85">Choose an amount and see offers from accredited lenders.</p><Image src="/brand/photo/customer-loan.png" alt="" aria-hidden width={150} height={105} className="-mb-5 h-24 w-36 object-contain object-bottom" /></div>
    </div>
    {vault.data && !vault.data.eligible && <button type="button" onClick={() => setView('VAULT')} className="flex w-full items-center gap-3 rounded-2xl border border-[#e4d5ef] bg-white p-3 text-left shadow-sm"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f3e7f8] text-[#8c00cf]"><FileText className="h-5 w-5" /></span><span className="min-w-0 flex-1"><b className="block text-sm">Add your bank statements</b><span className="block text-xs text-muted">Get your profile ready for a loan</span></span><ChevronRight className="h-4 w-4 text-[#8c00cf]" /></button>}
    <div className="flex items-center justify-between px-1 pt-2"><div><h2 className="text-lg font-black text-[#1b1030]">My loan requests</h2><p className="text-xs text-muted">Offers, progress and repayments</p></div><span className="grid h-9 w-9 place-items-center rounded-full bg-[#f2e4fa] text-[#8c00cf]"><Sparkles className="h-4 w-4" /></span></div>
    {applications.error && <Alert tone="red">{applications.error}<Button variant="secondary" onClick={applications.reload}>Try again</Button></Alert>}
    {applications.loading && !applications.data ? <Loading /> : !applications.error && !applications.data?.length ? <div className="rounded-[22px] border border-[#e8d9f3] bg-white p-6 text-center shadow-sm"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#f3e7f8] text-[#8c00cf]"><Banknote className="h-6 w-6" /></span><h3 className="mt-3 font-bold">No loan requests yet</h3><p className="mt-1 text-sm text-muted">Your loan journey starts with an amount and repayment period.</p><Button className="mt-4 bg-gradient-to-r from-[#8c00cf] to-[#d91f63] text-white" onClick={() => setView('CREATE')}>Get your first loan</Button></div> : <div className="space-y-2">{applications.data?.map(app => <button type="button" key={app.id} onClick={() => { setActive(app.id); setView('APPLICATION'); }} className="w-full rounded-2xl border border-[#e8d9f3] bg-white p-4 text-left shadow-sm"><span className="flex items-center justify-between gap-2"><strong className="text-base text-[#1b1030]">{formatZAR(app.amountCents)}</strong><StatusBadge status={app.status} /></span><span className="mt-1 flex justify-between gap-2 text-xs text-muted"><span>{app.termMonths} months · {new Date(app.createdAt).toLocaleDateString('en-ZA')}</span><span className="font-semibold text-[#8c00cf]">{actionLabel[app.status] || 'View'} →</span></span><span className="mt-3 block h-1 overflow-hidden rounded-full bg-[#eee3f4]"><span className="block h-full rounded-full bg-gradient-to-r from-[#8c00cf] to-[#d91f63]" style={{ width: `${progress[app.status] || 5}%` }} /></span></button>)}</div>}
  </section>;
}
