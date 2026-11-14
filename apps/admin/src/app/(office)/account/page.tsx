'use client';
import Link from 'next/link';
import { LockKeyhole, UserRound } from 'lucide-react';
import { PageHeader, useAuth } from '@xtra/ui';

export default function AccountPage() {
  const { me } = useAuth();
  return <div className="max-w-2xl space-y-5"><PageHeader title="My profile" subtitle="Your back office account and access." /><section className="rounded-2xl border bg-white p-5"><div className="flex items-center gap-4"><span className="grid h-14 w-14 place-items-center rounded-full bg-[#6924a4] text-xl font-bold text-white"><UserRound /></span><div><h2 className="text-xl font-bold">{me?.firstName} {me?.lastName}</h2><p className="text-sm text-slate-600">{me?.email}</p><p className="text-xs text-slate-500">{me?.roles.join(', ')}</p></div></div></section><Link href="/security" className="flex items-center gap-3 rounded-2xl border bg-white p-5 font-semibold"><LockKeyhole className="text-[#6924a4]" /> Sign-in & security</Link><p className="text-sm text-slate-500">Use the bell in the header for actions that need your attention.</p></div>;
}
