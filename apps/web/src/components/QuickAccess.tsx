'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Button, Card, DemoAccounts, Field, Input, PasskeyButton, Select, useApi, useAuth } from '@xtra/ui';
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
  return <div className="w-full max-w-md space-y-6"><Card className="w-full p-6 sm:p-8"><p className="text-xs font-bold uppercase tracking-widest text-brand">Your next step starts here</p><h1 className="mt-2 text-2xl font-black">{register ? 'Open your XTRA-CASH account' : 'Welcome to XTRA-CASH'}</h1><p className="mt-2 text-sm text-muted">{register ? 'Start with one contact detail. Add verification details when you use a service.' : 'Have a passkey? Unlock and go straight to your account.'}</p>{!register && <div className="mt-6"><PasskeyButton onSuccess={finish} /></div>}{register && providers.data && (providers.data.google || providers.data.apple || providers.data.whatsapp) && <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold">Use Google, Apple or WhatsApp</summary><QuickRegistration accountType={type} /></details>}<form onSubmit={e => { e.preventDefault(); submit(); }} className="mt-6 space-y-4">{!register && <p className="text-center text-xs text-muted">Or use your password</p>}<Field label="Email or mobile number"><Input autoFocus={register} autoComplete="username" type="text" value={identifier} onChange={e => setIdentifier(e.target.value)} required maxLength={254} /></Field><Field label={register ? 'Create a password' : 'Password'} hint={register ? 'At least 12 characters. You can enable quick unlock after joining.' : undefined}><Input type="password" autoComplete={register ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={register ? 12 : 1} maxLength={72} /></Field>{register && <><details open={type !== 'CONSUMER'}><summary className="cursor-pointer text-sm text-muted">Opening a lender or affiliate account?</summary><div className="mt-3"><Field label="Account type"><Select value={type} onChange={e => setType(e.target.value as typeof type)}><option value="CONSUMER">Personal account</option><option value="LENDER">Micro-lender</option><option value="AFFILIATE">Affiliate</option></Select></Field></div></details><label className="flex gap-2 text-sm text-muted"><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} /><span>I agree to the Terms of Use and consent to processing my information to create this account.</span></label></>}{error && <Alert tone="red">{error}</Alert>}<Button className="w-full" size="lg" loading={busy} disabled={register && !agree}>{register ? 'Create account' : 'Sign in'}</Button></form><button type="button" className="mt-5 w-full text-center text-sm font-semibold underline" onClick={() => { setRegister(!register); setError(''); setPassword(''); }}>{register ? 'Already have an account? Sign in' : 'New here? Create an account'}</button><div className="mt-5 flex justify-between text-xs text-muted"><Link href="/">Back to home</Link><a href={`${ADMIN_URL}/login`}>Staff sign-in</a></div></Card><DemoAccounts app="web" onSignedIn={finish} footer="Sample accounts are shared for demonstrations. Use your own account for personal information." /></div>;
}
