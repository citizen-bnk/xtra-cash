'use client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Button, Card, Field, Input, Modal, PasskeyButton, Select, useApi, useAuth } from '@xtra/ui';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, Phone, ShieldCheck, UserRound } from 'lucide-react';
import { QuickRegistration } from './QuickRegistration';
import { ADMIN_URL, homeFor } from '@/lib/config';

export function safeNext(value: string | null, fallback = '/app') {
  return value && /^\/(app|lender|affiliate)(\/|\?|$)/.test(value) && !value.includes('\\') ? value : fallback;
}
type AccountType = 'CONSUMER' | 'LENDER' | 'AFFILIATE';
type AuthConfiguration = { google: boolean; apple: boolean; whatsapp: boolean };

export function QuickAccess({ initialRegister = false }: { initialRegister?: boolean }) {
  const params = useSearchParams(), router = useRouter();
  const { client, refreshMe } = useAuth();
  const [register, setRegister] = useState(initialRegister);
  const [identifier, setIdentifier] = useState(''), [fullName, setFullName] = useState(''), [mobile, setMobile] = useState(''), [email, setEmail] = useState('');
  const [password, setPassword] = useState(''), [confirmPassword, setConfirmPassword] = useState(''), [agree, setAgree] = useState(false), [remember, setRemember] = useState(true);
  const [type, setType] = useState<AccountType>(params.get('type') === 'LENDER' ? 'LENDER' : params.get('type') === 'AFFILIATE' ? 'AFFILIATE' : 'CONSUMER');
  const [showPassword, setShowPassword] = useState(false), [showConfirm, setShowConfirm] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [forgotOpen, setForgotOpen] = useState(false);
  const providers = useApi(c => c.request<AuthConfiguration>('GET', '/auth/passwordless/configuration'));

  async function finish() {
    const me = await refreshMe();
    if (!me) throw new Error('Please sign in again.');
    if (!me.roles.some(r => ['CONSUMER', 'LENDER', 'AFFILIATE'].includes(r))) { await client.auth.logout(); setError('Staff accounts use the back-office sign-in below.'); return; }
    router.replace(safeNext(params.get('next'), homeFor(me)));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      if (register) {
        if (!mobile.trim()) throw new Error('Enter your mobile number.');
        if (!fullName.trim().includes(' ')) throw new Error('Enter your first name and surname.');
        if (password !== confirmPassword) throw new Error('Your passwords do not match.');
        if (!agree) throw new Error('Agree to the Terms & Conditions to continue.');
        const accountIdentifier = email.trim() || mobile.trim().replace(/\s/g, '');
        await client.auth.quickRegister({ identifier: accountIdentifier, password, consent: agree, accountType: type, referralCode: params.get('ref') || undefined });
        const [firstName, ...rest] = fullName.trim().split(/\s+/);
        try { await client.request('PUT', '/auth/passwordless/profile', { firstName, lastName: rest.join(' ') }); } catch { /* Profile setup can continue after account creation. */ }
      } else {
        await client.auth.login(identifier.trim(), password);
      }
      const me = await refreshMe();
      if (!me) throw new Error('Please sign in again.');
      if (!me.roles.some(r => ['CONSUMER', 'LENDER', 'AFFILIATE'].includes(r))) { await client.auth.logout(); setError('Staff accounts use the back-office sign-in below.'); return; }
      if (register && me.roles.includes('CONSUMER')) router.replace('/app/kyc?next=%2Fapp');
      else router.replace(safeNext(params.get('next'), homeFor(me)));
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not continue.'); }
    finally { setBusy(false); }
  }
  async function social(provider: 'google' | 'apple') {
    if (!providers.data?.[provider]) { setError(`${provider === 'google' ? 'Google' : 'Apple'} sign-in is not connected yet.`); return; }
    setBusy(true); setError('');
    try { const r = await client.request<{ url: string; state: string; binding: string }>('POST', '/auth/passwordless/social/start', { accountType: type, consent: true, provider }); sessionStorage.setItem('xtra-sign-in-' + r.state, r.binding); window.location.assign(r.url); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not start social sign-in.'); setBusy(false); }
  }
  const toggleMode = () => { setRegister(v => !v); setError(''); setPassword(''); setConfirmPassword(''); setFullName(''); };

  return <div className="w-full max-w-[440px]">
    <Card className="w-full rounded-[28px] border-white/80 p-5 shadow-[0_18px_55px_rgba(35,0,58,.3)] sm:p-8">
      <div className="text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[#8610c6] to-[#c516a6] text-white shadow-lg"><LockKeyhole className="h-6 w-6" /></span><p className="mt-3 text-xs font-black uppercase tracking-[.18em] text-[#7011aa]">XTRA-CASH</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{register ? 'Create Your Account' : 'Welcome Back'}</h1><p className="mt-1 text-sm text-muted">{register ? 'It only takes a few minutes' : 'Login to your XTRA-CASH account'}</p></div>
      {!register && <div className="mt-4"><PasskeyButton onSuccess={finish} /></div>}
      <form onSubmit={submit} className="mt-5 space-y-3.5">
        {register ? <>
          <Field label="Full Names"><span className="relative block"><UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><Input autoComplete="name" value={fullName} onChange={e => setFullName(e.target.value)} required maxLength={120} placeholder="Full names" className="h-11 rounded-xl pl-10" /></span></Field>
          <Field label="Mobile Number"><span className="relative block"><Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><Input type="tel" inputMode="tel" autoComplete="tel" value={mobile} onChange={e => setMobile(e.target.value)} required maxLength={24} placeholder="Mobile number" className="h-11 rounded-xl pl-10" /></span></Field>
          <Field label="Email Address (Optional)"><span className="relative block"><Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><Input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={254} placeholder="Email address (optional)" className="h-11 rounded-xl pl-10" /></span></Field>
          <details className="rounded-xl border border-line bg-slate-50 px-3 py-2"><summary className="cursor-pointer text-sm font-semibold">Account type: {type === 'CONSUMER' ? 'Individual' : type === 'LENDER' ? 'Lender' : 'Affiliate'}</summary><div className="mt-3"><Field label="Choose account type"><Select value={type} onChange={e => setType(e.target.value as AccountType)}><option value="CONSUMER">Individual account</option><option value="LENDER">Lender account</option><option value="AFFILIATE">Affiliate account</option></Select></Field></div></details>
        </> : <Field label="Mobile number or Email"><span className="relative block"><UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><Input autoComplete="username" value={identifier} onChange={e => setIdentifier(e.target.value)} required maxLength={254} placeholder="Mobile number or Email" className="h-11 rounded-xl pl-10" /></span></Field>}
        <Field label={register ? 'Create Password' : 'Password'} hint={register ? 'Use at least 12 characters.' : undefined}><span className="relative block"><LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><Input type={showPassword ? 'text' : 'password'} autoComplete={register ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={register ? 12 : 1} maxLength={72} placeholder={register ? 'Create password' : 'Password'} className="h-11 rounded-xl pl-10 pr-12" /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(v => !v)} className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-muted">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></span></Field>
        {register ? <>
          <Field label="Confirm Password"><span className="relative block"><LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><Input type={showConfirm ? 'text' : 'password'} autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={12} maxLength={72} placeholder="Confirm password" className="h-11 rounded-xl pl-10 pr-12" /><button type="button" aria-label={showConfirm ? 'Hide confirmation password' : 'Show confirmation password'} onClick={() => setShowConfirm(v => !v)} className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-muted">{showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></span></Field>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-[#740bb0]/35 bg-[#f7edff] p-3 text-sm text-ink"><input className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-violet-700" type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} /><span>I agree to the <span className="font-bold text-[#7411af] underline">Terms &amp; Conditions</span> and <span className="font-bold text-[#7411af] underline">Privacy Policy</span>.</span></label>
        </> : <div className="flex items-center justify-between text-xs"><label className="flex items-center gap-2"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} className="h-4 w-4 accent-violet-700" />Remember me</label><button type="button" onClick={() => setForgotOpen(true)} className="font-semibold text-[#780bb7] underline">Forgot password?</button></div>}
        {error && <Alert tone="red">{error}</Alert>}
        <Button className="w-full rounded-xl bg-gradient-to-r from-[#b80ce1] to-[#7100b8] text-white hover:from-[#a90bd0] hover:to-[#6200a4]" size="lg" loading={busy} disabled={register && (!agree || password !== confirmPassword)}>{register ? 'Register' : 'Login'} <ArrowRight className="h-4 w-4" /></Button>
      </form>
      {!register && <><div className="my-4 flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div><div className="grid gap-2"><button type="button" onClick={() => void social('google')} disabled={busy} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-white text-sm font-semibold text-ink disabled:opacity-60"><span className="font-black text-[#4285f4]">G</span> Continue with Google</button><button type="button" onClick={() => void social('apple')} disabled={busy} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-white text-sm font-semibold text-ink disabled:opacity-60"><span className="text-base">●</span> Continue with Apple</button></div></>}
      <button type="button" onClick={toggleMode} className="mt-5 w-full text-center text-sm font-medium text-ink">{register ? <>Already have an account? <span className="font-bold text-[#7906b5] underline">Login</span></> : <>Don&apos;t have an account? <span className="font-bold text-[#7906b5] underline">Register</span></>}</button>
      <div className="mt-4 flex items-center justify-center gap-2 border-t border-line pt-3 text-xs text-muted"><ShieldCheck className="h-4 w-4 text-[#7712b1]" /> Your details are protected</div>
      <div className="mt-4 flex justify-between text-xs"><Link href="/onboarding" className="font-semibold text-[#7612ac] underline">Explore XTRA-CASH</Link><a href={`${ADMIN_URL}/login`} className="font-semibold text-[#7612ac] underline">Staff sign-in</a></div>
    </Card>
    <Modal open={forgotOpen} title="Forgot your password?" onClose={() => setForgotOpen(false)}><div className="space-y-3"><p className="text-sm text-muted">Password reset is not connected yet. Ask your XTRA-CASH administrator for support.</p><Field label="Email or mobile number"><Input autoComplete="username" /></Field><Button className="w-full" onClick={() => setForgotOpen(false)}>Close</Button></div></Modal>
    {register && providers.data && (providers.data.google || providers.data.apple || providers.data.whatsapp) && <div className="mt-3"><QuickRegistration accountType={type} /></div>}
  </div>;
}
