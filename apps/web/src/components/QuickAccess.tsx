'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Button, Card, Field, Input, PasskeyButton, Select, useApi, useAuth } from '@xtra/ui';
import { ArrowRight, Eye, EyeOff, Flame, ShieldCheck } from 'lucide-react';
import { QuickRegistration } from './QuickRegistration';
import { ADMIN_URL, homeFor } from '@/lib/config';

export function safeNext(value: string | null, fallback = '/app') {
  return value && /^\/(app|lender|affiliate)(\/|\?|$)/.test(value) && !value.includes('\\') ? value : fallback;
}
export function QuickAccess({ initialRegister = false }: { initialRegister?: boolean }) {
  const params = useSearchParams(), router = useRouter();
  const { client, refreshMe } = useAuth();
  const [register, setRegister] = useState(initialRegister), [identifier, setIdentifier] = useState(''), [password, setPassword] = useState(''), [agree, setAgree] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [type, setType] = useState<'CONSUMER' | 'LENDER' | 'AFFILIATE'>(params.get('type') === 'LENDER' ? 'LENDER' : params.get('type') === 'AFFILIATE' ? 'AFFILIATE' : 'CONSUMER');
  const providers = useApi(c => register ? c.request<{ google: boolean; apple: boolean; whatsapp: boolean }>('GET', '/auth/passwordless/configuration') : Promise.resolve(null), [register]);
  async function finish() {
    const me = await refreshMe();
    if (!me) throw new Error('Please sign in again.');
    if (!me.roles.some(r => ['CONSUMER', 'LENDER', 'AFFILIATE'].includes(r))) { await client.auth.logout(); setError('Staff accounts use the back-office sign-in below.'); return; }
    router.replace(safeNext(params.get('next'), homeFor(me)));
  }
  async function submit() {
    setBusy(true); setError('');
    try {
      if (register) await client.auth.quickRegister({ identifier: identifier.replace(/^\s+|\s+$/g, ''), password, consent: agree, accountType: type, referralCode: params.get('ref') || undefined });
      else await client.auth.login(identifier, password);
      await finish();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not continue.'); } finally { setBusy(false); }
  }
  return <div className="w-full max-w-[440px]">
    <div className="mb-5 text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-purple text-white shadow-lg shadow-brand-purple/20"><Flame className="h-7 w-7" /></span><p className="mt-3 text-xs font-bold uppercase tracking-[.2em] text-brand-purple">XTRA-CASH</p></div>
    <Card className="w-full rounded-[28px] border-white/80 p-5 shadow-[0_18px_55px_rgba(42,22,64,0.12)] sm:p-8">
      <p className="text-center text-xs font-bold uppercase tracking-[.16em] text-brand-purple">{register ? 'Start your journey' : 'Welcome back'}</p>
      <h1 className="mt-2 text-center text-2xl font-black tracking-tight sm:text-3xl">{register ? 'Create your account' : 'Sign in'}</h1>
      <p className="mx-auto mt-2 max-w-xs text-center text-sm text-muted">{register ? 'One account for your XTRA-CASH services.' : 'Access your wallet, loans and account activity.'}</p>
      {!register && <div className="mt-5"><PasskeyButton onSuccess={finish} /></div>}
      <form onSubmit={e => { e.preventDefault(); submit(); }} className="mt-6 space-y-4">
        <Field label="Email or mobile number"><Input autoFocus={register} autoComplete="username" type="text" value={identifier} onChange={e => setIdentifier(e.target.value)} required maxLength={254} className="h-12 rounded-2xl bg-slate-50" /></Field>
        <Field label={register ? 'Create a password' : 'Password'} hint={register ? 'At least 12 characters.' : undefined}><span className="relative block"><Input type={showPassword ? 'text' : 'password'} autoComplete={register ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={register ? 12 : 1} maxLength={72} className="h-12 rounded-2xl bg-slate-50 pr-12" /><button type="button" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-xl text-muted hover:bg-white">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></span></Field>
        {register && <><details className="rounded-2xl border border-line bg-slate-50 px-3 py-2" open={type !== 'CONSUMER'}><summary className="cursor-pointer text-sm font-semibold">Account type: {type === 'CONSUMER' ? 'Personal' : type === 'LENDER' ? 'Micro-lender' : 'Affiliate'}</summary><div className="mt-3"><Field label="Choose account type"><Select value={type} onChange={e => setType(e.target.value as typeof type)}><option value="CONSUMER">Personal account</option><option value="LENDER">Micro-lender</option><option value="AFFILIATE">Affiliate</option></Select></Field></div></details><label className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-brand-purple/40 bg-brand-soft/50 p-3.5 text-sm text-ink"><input className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-violet-700" type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} /><span>I agree to the Terms of Use and consent to processing my information to create this account.</span></label>{providers.data && (providers.data.google || providers.data.apple || providers.data.whatsapp) && <details className="rounded-2xl border border-line px-3 py-2"><summary className="cursor-pointer text-sm font-semibold">More sign-up options</summary><QuickRegistration accountType={type} /></details>}</>}
        {!register && <p className="inline-flex items-center gap-1.5 text-xs text-muted"><ShieldCheck className="h-4 w-4 text-brand-purple" /> Secure sign-in</p>}
        {error && <Alert tone="red">{error}</Alert>}
        <Button className="w-full rounded-2xl" size="lg" variant="accent" loading={busy} disabled={register && !agree}>{register ? 'Create account' : 'Sign in'} <ArrowRight className="h-4 w-4" /></Button>
      </form>
      <button type="button" className="mt-5 w-full text-center text-sm font-semibold text-brand-purple" onClick={() => { setRegister(!register); setError(''); setPassword(''); }}>{register ? 'Already have an account? Sign in' : 'New here? Create an account'}</button>
      <div className="mt-5 flex items-center justify-between border-t border-line pt-4 text-xs text-muted"><Link href="/">Back to home</Link><a className="font-semibold text-brand-purple underline" href={`${ADMIN_URL}/login`}>Staff sign-in</a></div>
    </Card>
    <p className="mt-4 text-center text-xs text-muted">Your details stay protected and are only used to provide XTRA-CASH services.</p>
  </div>;
}
