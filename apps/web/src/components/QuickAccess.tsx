'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Button, Card, Field, Input, PasskeyButton, Select, useApi, useAuth } from '@xtra/ui';
import { QuickRegistration } from './QuickRegistration';
import { ADMIN_URL, homeFor } from '@/lib/config';

export function safeNext(value: string | null, fallback = '/app') {
  return value && /^\/(app|lender|affiliate)(\/|\?|$)/.test(value) && !value.includes('\\') ? value : fallback;
}
export function QuickAccess({ initialRegister = false }: { initialRegister?: boolean }) {
  const params = useSearchParams(), router = useRouter();
  const { client, refreshMe } = useAuth();
  const [register, setRegister] = useState(initialRegister), [identifier, setIdentifier] = useState(''), [password, setPassword] = useState(''), [agree, setAgree] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
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
  return <div className="w-full max-w-md"><Card className="w-full p-6 sm:p-8"><p className="text-xs font-bold uppercase tracking-widest text-brand">Your next step starts here</p><h1 className="mt-2 text-2xl font-black">{register ? 'Open your XTRA-CASH account' : 'Welcome to XTRA-CASH'}</h1><p className="mt-2 text-sm text-muted">{register ? 'Start with your contact details. Add verification when you use a service.' : 'Sign in to continue to your account.'}</p>{!register && <div className="mt-5"><PasskeyButton onSuccess={finish} /></div>}<form onSubmit={e => { e.preventDefault(); submit(); }} className="mt-5 space-y-4"><Field label="Email or mobile number"><Input autoFocus={register} autoComplete="username" type="text" value={identifier} onChange={e => setIdentifier(e.target.value)} required maxLength={254} /></Field><Field label={register ? 'Create a password' : 'Password'} hint={register ? 'At least 12 characters.' : undefined}><Input type="password" autoComplete={register ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={register ? 12 : 1} maxLength={72} /></Field>{register && <><details className="rounded-xl border border-line px-3 py-2" open={type !== 'CONSUMER'}><summary className="cursor-pointer text-sm font-semibold">Account type: {type === 'CONSUMER' ? 'Personal' : type === 'LENDER' ? 'Micro-lender' : 'Affiliate'}</summary><div className="mt-3"><Field label="Choose account type"><Select value={type} onChange={e => setType(e.target.value as typeof type)}><option value="CONSUMER">Personal account</option><option value="LENDER">Micro-lender</option><option value="AFFILIATE">Affiliate</option></Select></Field></div></details><label className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-slate-500 bg-slate-50 p-3 text-sm text-slate-900"><input className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-violet-700" type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} /><span>I agree to the Terms of Use and consent to processing my information to create this account.</span></label>{providers.data && (providers.data.google || providers.data.apple || providers.data.whatsapp) && <details className="rounded-xl border border-line px-3 py-2"><summary className="cursor-pointer text-sm font-semibold">More sign-up options</summary><QuickRegistration accountType={type} /></details>}</>}{error && <Alert tone="red">{error}</Alert>}<Button className="w-full" size="lg" loading={busy} disabled={register && !agree}>{register ? 'Create account' : 'Sign in'}</Button></form><button type="button" className="mt-4 w-full text-center text-sm font-semibold underline" onClick={() => { setRegister(!register); setError(''); setPassword(''); }}>{register ? 'Already have an account? Sign in' : 'New here? Create an account'}</button><div className="mt-4 flex justify-between text-xs text-muted"><Link href="/">Back to home</Link><a href={`${ADMIN_URL}/login`}>Staff sign-in</a></div></Card></div>;
}
