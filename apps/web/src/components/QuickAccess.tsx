'use client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Button, Field, Input, PasswordResetLink, useAuth } from '@xtra/ui';
import { ArrowLeft, ArrowRight, BriefcaseBusiness, Check, ChevronRight, Eye, EyeOff, Fingerprint, IdCard, LockKeyhole, Mail, Phone, UserRound, Users } from 'lucide-react';
import { homeFor } from '@/lib/config';

export function safeNext(value: string | null, fallback = '/app') {
  return value && /^\/(app|lender|affiliate)(\/|\?|$)/.test(value) && !value.includes('\\') ? value : fallback;
}
type AccountType = 'CONSUMER' | 'LENDER' | 'AFFILIATE';

export function QuickAccess({ initialRegister = false }: { initialRegister?: boolean }) {
  const params = useSearchParams(), router = useRouter();
  const { client, refreshMe } = useAuth();
  const register = initialRegister;
  const [stage, setStage] = useState(register && !params.has('type') ? 0 : 1);
  const [identifier, setIdentifier] = useState(''), [fullName, setFullName] = useState(''), [idNumber, setIdNumber] = useState(''), [mobile, setMobile] = useState(''), [email, setEmail] = useState('');
  const [password, setPassword] = useState(''), [confirmPassword, setConfirmPassword] = useState(''), [agree, setAgree] = useState(false);
  const [type, setType] = useState<AccountType>(params.get('type') === 'LENDER' ? 'LENDER' : params.get('type') === 'AFFILIATE' ? 'AFFILIATE' : 'CONSUMER');
  const [showPassword, setShowPassword] = useState(false), [showConfirm, setShowConfirm] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (register && stage === 1) {
      if (!fullName.trim().includes(' ')) { setError('Enter your first name and surname as shown on your identity document.'); return; }
      if (!mobile.trim()) { setError('Enter your mobile number.'); return; }
      if (type === 'CONSUMER' && idNumber.replace(/\D/g, '').length !== 13) { setError('Enter your 13-digit South African ID number. You can finish identity checks after creating your account.'); return; }
      setStage(2); return;
    }
    if (register && stage === 2) { setStage(3); return; }
    setBusy(true);
    try {
      if (register) {
        if (password.length < 12) throw new Error('Use at least 12 characters for your password.');
        if (password !== confirmPassword) throw new Error('Your passwords do not match.');
        if (!agree) throw new Error('Agree to the Terms & Conditions to continue.');
        const accountIdentifier = email.trim() || mobile.trim().replace(/\s/g, '');
        await client.auth.quickRegister({ identifier: accountIdentifier, password, consent: agree, accountType: type, referralCode: params.get('ref') || undefined });
        if (type === 'CONSUMER') sessionStorage.setItem('xc.pendingIdNumber', idNumber.replace(/\D/g, ''));
        const [firstName, ...rest] = fullName.trim().split(/\s+/);
        try { await client.request('PUT', '/auth/passwordless/profile', { firstName, lastName: rest.join(' ') }); } catch { /* Name can be completed from Profile after account creation. */ }
      } else {
        await client.auth.login(identifier.trim(), password);
      }
      const me = await refreshMe();
      if (!me) throw new Error('Please sign in again.');
      if (!me.roles.some(r => ['CONSUMER', 'LENDER', 'AFFILIATE'].includes(r))) { await client.auth.logout(); setError('Staff accounts use the back-office sign-in below.'); return; }
      if (register && me.roles.includes('CONSUMER')) {
        const afterKyc = safeNext(params.get('next'), '/app');
        router.replace(`/app/kyc?next=${encodeURIComponent(afterKyc)}`);
      } else router.replace(safeNext(params.get('next'), homeFor(me)));
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not continue.'); }
    finally { setBusy(false); }
  }
  if (register && stage === 0) return <div className="mx-auto w-full max-w-md animate-fade-in">
    <div className="mb-5 text-center"><p className="text-xs font-extrabold uppercase tracking-[.16em] text-[#9b14bc]">Step 1 · Choose account type</p><h1 className="mt-2 text-2xl font-extrabold text-[#28133b]">Create your account</h1><p className="mt-1 text-sm text-slate-600">Choose how you’ll use XTRA-CASH.</p></div>
    <div className="space-y-3">
      <AccountChoice icon={UserRound} title="Individual Account" text="Personal loans, payments and your XTRA-CASH wallet" onClick={() => { setType('CONSUMER'); setStage(1); }} />
      <AccountChoice icon={BriefcaseBusiness} title="Business / Merchant" text="Accept payments and offer shopping benefits" disabled />
      <AccountChoice icon={Users} title="Employer / Payroll" text="Salary-linked benefits for your employees" disabled />
    </div>
    <p className="mt-4 text-center text-xs text-slate-500">Business and employer sign-up is coming soon.</p>
    <div className="mt-4 flex justify-center gap-4 text-xs font-bold text-[#7612ac]"><Link className="underline" href="/register?type=LENDER">Lender account</Link><Link className="underline" href="/register?type=AFFILIATE">Affiliate account</Link></div>
    <p className="mt-5 text-center text-sm text-slate-600">Already have an account? <Link className="font-extrabold text-[#7906b5] underline" href={`/login${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`}>Login</Link></p>
  </div>;

  return <div className="mx-auto w-full max-w-md animate-fade-in">
    {register && <section>
      <div className="mb-5 flex items-center justify-between gap-3"><button type="button" aria-label="Back" onClick={() => { setError(''); setStage(s => Math.max(0, s - 1)); }} className="grid h-10 w-10 place-items-center rounded-full bg-[#f6effb] text-[#632292]"><ArrowLeft className="h-5 w-5" /></button><span className="text-xs font-bold text-slate-500">Step {stage} of 3</span></div>
      <div className="mb-5 h-2 overflow-hidden rounded-full bg-[#ece5f3]"><div className="h-full rounded-full bg-gradient-to-r from-[#a600d4] to-[#ee147e] transition-all" style={{ width: `${stage * 33.34}%` }} /></div>
      <div className="mb-5"><p className="text-xs font-extrabold uppercase tracking-[.15em] text-[#9b14bc]">{stage === 1 ? 'Your details' : stage === 2 ? 'Identity verification' : 'Security & preferences'}</p><h1 className="mt-1 text-2xl font-extrabold text-[#28133b]">{stage === 1 ? 'Create Individual Account' : stage === 2 ? 'Verify your identity' : 'Set up your account'}</h1><p className="mt-1 text-sm text-slate-600">{stage === 1 ? 'Tell us who you are. We’ll reuse these details in your profile.' : stage === 2 ? 'We’ll confirm your identity before you apply for a loan.' : 'Create a secure password to protect your account.'}</p></div>
      <form onSubmit={submit} className="space-y-4">
        {stage === 1 && <>
          <Field label="Full Names"><IconInput icon={UserRound}><Input autoComplete="name" value={fullName} onChange={e => setFullName(e.target.value)} required maxLength={120} placeholder="Full names" /></IconInput></Field>
          {type === 'CONSUMER' && <Field label="South African ID Number" hint="Your ID will prefill the identity check after registration."><IconInput icon={IdCard}><Input inputMode="numeric" autoComplete="off" value={idNumber} onChange={e => setIdNumber(e.target.value.replace(/\D/g, '').slice(0, 13))} required maxLength={13} placeholder="13 digit ID number" /></IconInput></Field>}
          <Field label="Email Address (Optional)"><IconInput icon={Mail}><Input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={254} placeholder="Email address" /></IconInput></Field>
          <Field label="Mobile Number"><IconInput icon={Phone}><Input type="tel" inputMode="tel" autoComplete="tel" value={mobile} onChange={e => setMobile(e.target.value)} required maxLength={24} placeholder="Mobile number" /></IconInput></Field>
        </>}
        {stage === 2 && <div className="space-y-3">
          <VerificationStep icon={Fingerprint} title="Take a selfie" text="A liveness check helps confirm it’s really you." />
          <VerificationStep icon={IdCard} title="Confirm your ID document" text="We’ll review your ID details in the secure verification step." />
          <VerificationStep icon={Phone} title="Verify your mobile number" text="We’ll send a one-time code when phone verification is enabled." />
          <div className="rounded-xl bg-[#f7f1fb] p-3 text-xs leading-relaxed text-slate-600">You can create your account now. Identity verification continues securely in the app before a loan application.</div>
        </div>}
        {stage === 3 && <>
          <Field label="Create Password" hint="Use at least 12 characters."><IconInput icon={LockKeyhole}><Input type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} required minLength={12} maxLength={72} placeholder="Create password" /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(v => !v)} className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-slate-500">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></IconInput></Field>
          <Field label="Confirm Password"><IconInput icon={LockKeyhole}><Input type={showConfirm ? 'text' : 'password'} autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={12} maxLength={72} placeholder="Confirm password" /><button type="button" aria-label={showConfirm ? 'Hide confirmation password' : 'Show confirmation password'} onClick={() => setShowConfirm(v => !v)} className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-slate-500">{showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></IconInput></Field>
          <ul className="grid grid-cols-2 gap-x-2 gap-y-1 rounded-xl bg-[#f7f1fb] p-3 text-[11px] text-slate-600"><PasswordRule ok={password.length >= 12}>At least 12 characters</PasswordRule><PasswordRule ok={/[0-9]/.test(password)}>Includes a number</PasswordRule><PasswordRule ok={/[A-Z]/.test(password)}>Uppercase letter</PasswordRule><PasswordRule ok={/[^A-Za-z0-9]/.test(password)}>Special character</PasswordRule></ul>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-[#6f11a7]/45 bg-[#f5e9fd] p-3 text-sm text-[#28133b]"><input className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-[#740bb0]" type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} /><span>I agree to the <span className="font-bold text-[#7411af] underline">Terms &amp; Conditions</span> and <span className="font-bold text-[#7411af] underline">Privacy Policy</span>.</span></label>
        </>}
        {error && <Alert tone="red">{error}</Alert>}
        <Button className="w-full rounded-xl bg-[#fb9320] text-[#1b1030] hover:bg-[#df7b10]" size="lg" loading={busy} disabled={register && stage === 3 && (!agree || password !== confirmPassword)}>{register ? stage === 1 ? 'Continue' : stage === 2 ? 'Continue' : 'Create Account' : 'Login'} <ArrowRight className="h-4 w-4" /></Button>
      </form>
      </section>}
      {!register && <section>
        <div className="mb-5 text-center md:text-left"><p className="hidden text-xs font-bold uppercase tracking-[.16em] text-brand-purple md:block">XTRA-CASH account</p><h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Welcome back</h1><p className="mt-1 hidden text-sm text-muted sm:block">Sign in to your account.</p></div>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Email address"><IconInput icon={Mail}><Input type="email" inputMode="email" autoComplete="email" value={identifier} onChange={e => setIdentifier(e.target.value)} required maxLength={254} placeholder="you@example.com" /></IconInput></Field>
          <Field label="Password"><IconInput icon={LockKeyhole}><Input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required maxLength={72} placeholder="Enter your password" /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(v => !v)} className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-muted">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></IconInput></Field>
          {error && <Alert tone="red">{error}</Alert>}
          <Button className="w-full rounded-xl bg-brand-orange text-ink hover:bg-brand-orange-dark" size="lg" loading={busy}>Log in <ArrowRight className="h-4 w-4" /></Button>
        </form>
      </section>}
      {register ? <div className="mt-6 text-center text-sm text-muted">Already have an account? <Link href={`/login${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`} className="font-bold text-brand-purple underline">Log in</Link></div> : <nav aria-label="Sign-in links" className="mt-5 flex items-center justify-center gap-4 text-xs sm:gap-6"><Link href="/" className="font-semibold text-muted underline underline-offset-2">Home</Link><PasswordResetLink /><Link href="/register" className="font-semibold text-brand-purple underline underline-offset-2">Register</Link></nav>}
  </div>;
}

function IconInput({ icon: Icon, children }: { icon: typeof UserRound; children: React.ReactNode }) { return <span className="relative block [&>input]:h-12 [&>input]:rounded-xl [&>input]:border-[#d5c9e0] [&>input]:bg-white [&>input]:pl-11 [&>input]:pr-10 [&>input]:text-sm [&>input]:placeholder:text-slate-400"><Icon className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-[#6d5c7c]" />{children}</span>; }
function PasswordRule({ ok, children }: { ok: boolean; children: React.ReactNode }) { return <li className="flex items-center gap-1.5"><Check className={`h-3.5 w-3.5 ${ok ? 'text-emerald-600' : 'text-slate-300'}`} />{children}</li>; }
function AccountChoice({ icon: Icon, title, text, onClick, disabled }: { icon: typeof UserRound; title: string; text: string; onClick?: () => void; disabled?: boolean }) { const body = <><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#f4e6fb] text-[#8505c1]"><Icon className="h-6 w-6" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-extrabold text-[#28133b]">{title}</span><span className="mt-0.5 block text-xs leading-snug text-slate-600">{text}</span></span><ChevronRight className="h-5 w-5 shrink-0 text-[#8200bd]" /></>; return disabled ? <div aria-disabled="true" className="flex min-h-[76px] items-center gap-3 rounded-2xl border border-[#ddd3e7] bg-[#fbf9fc] px-3 opacity-70">{body}<span className="sr-only">Coming soon</span></div> : <button type="button" onClick={onClick} className="flex min-h-[76px] w-full items-center gap-3 rounded-2xl border border-[#d8cbe5] bg-white px-3 text-left shadow-[0_3px_10px_#3414500e] transition hover:border-[#a600d4] focus-visible:outline-2 focus-visible:outline-[#8200bd]">{body}</button>; }
function VerificationStep({ icon: Icon, title, text }: { icon: typeof Fingerprint; title: string; text: string }) { return <div className="flex items-center gap-3 rounded-2xl border border-[#ded3e8] bg-white px-3 py-3 shadow-[0_3px_10px_#3414500a]"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f5e6fc] text-[#8700c5]"><Icon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><b className="block text-sm text-[#28133b]">{title}</b><span className="text-xs text-slate-600">{text}</span></span><ChevronRight className="h-4 w-4 shrink-0 text-slate-400" /></div>; }
