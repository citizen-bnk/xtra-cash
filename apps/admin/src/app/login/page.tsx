'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, Field, Input, Logo, PasskeyButton, useAuth } from '@xtra/ui';
import { ArrowRight, Eye, EyeOff, ShieldCheck } from 'lucide-react';
const WEB_URL = (process.env.NEXT_PUBLIC_WEB_URL ?? 'https://xtra-cash.vercel.app').replace(/\/$/, '');
export default function AdminLogin() {
  const { client, refreshMe } = useAuth(), router = useRouter();
  const [identifier, setIdentifier] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  async function finish() {
    const me = await refreshMe();
    if (!me?.roles.some(r => r === 'ADMIN' || r === 'SUPER_ADMIN')) { await client.auth.logout(); setError('This account does not have back-office access.'); return; }
    router.replace('/');
  }
  async function login() {
    setBusy(true); setError('');
    try { await client.auth.login(identifier, password); await finish(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not sign in.'); } finally { setBusy(false); }
  }
  return <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#f8f5fc] px-4 py-8">
    <div aria-hidden="true" className="pointer-events-none absolute -right-32 -top-36 h-96 w-96 rounded-full bg-[#a617d3]/10 blur-3xl" />
    <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-[#fb9320]/10 blur-3xl" />
    <div className="relative w-full max-w-[440px]">
      <div className="mb-5 flex justify-center"><Logo size={40} /></div>
      <Card className="w-full rounded-[28px] border-white/80 p-5 shadow-[0_18px_55px_rgba(42,22,64,0.12)] sm:p-8">
        <p className="text-center text-xs font-bold uppercase tracking-[.16em] text-brand-purple">XTRA-CASH back office</p>
        <h1 className="mt-2 text-center text-2xl font-black tracking-tight sm:text-3xl">Welcome back</h1>
        <p className="mt-2 text-center text-sm text-muted">Sign in to manage platform operations.</p>
        <div className="mt-5"><PasskeyButton onSuccess={finish} /></div>
        <form className="mt-5 space-y-4" onSubmit={e => { e.preventDefault(); login(); }}>
          <p className="text-center text-xs text-muted">Or use your staff password</p>
          <Field label="Staff email"><Input className="h-12 rounded-2xl bg-slate-50" value={identifier} onChange={e => setIdentifier(e.target.value)} autoComplete="username" inputMode="email" required /></Field>
          <Field label="Password"><span className="relative block"><Input className="h-12 rounded-2xl bg-slate-50 pr-12" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required /><button type="button" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-xl text-muted hover:bg-white">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></span></Field>
          {error && <Alert tone="red">{error}</Alert>}
          <Button className="w-full rounded-2xl" variant="accent" size="lg" loading={busy}>Sign in <ArrowRight className="h-4 w-4" /></Button>
        </form>
        <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-xs text-muted"><ShieldCheck className="h-4 w-4 text-brand-purple" /> Sign in once with your password, then enable a passkey in Sign-in & security.</p>
      </Card>
      <a className="mt-5 block text-center text-sm font-semibold text-brand-purple underline" href={WEB_URL}>XTRA-CASH home</a>
    </div>
  </main>;
}
