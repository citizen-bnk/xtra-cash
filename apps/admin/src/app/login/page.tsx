'use client';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, Field, Input, Logo, PasswordResetLink, useAuth } from '@xtra/ui';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';
const WEB_URL = (process.env.NEXT_PUBLIC_WEB_URL ?? 'https://xtra-cash.vercel.app').replace(/\/$/, '');

export default function AdminLogin() {
  const { client, refreshMe } = useAuth(), router = useRouter();
  const [identifier, setIdentifier] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  async function login() {
    setBusy(true); setError('');
    try {
      await client.auth.login(identifier.trim(), password);
      const me = await refreshMe();
      if (!me?.roles.some(r => r === 'ADMIN' || r === 'SUPER_ADMIN')) { await client.auth.logout(); setError('This account does not have back-office access.'); return; }
      router.replace('/');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not sign in.'); }
    finally { setBusy(false); }
  }
  return <main className="xc-app-theme h-[100dvh] overflow-hidden bg-[#f6f2f9] md:grid md:place-items-center md:p-6">
    <div className="mx-auto grid h-full w-full max-w-6xl overflow-hidden bg-white md:h-auto md:min-h-[min(760px,calc(100dvh-3rem))] md:grid-cols-[1fr_1fr] md:rounded-[30px] md:shadow-[0_24px_90px_rgba(27,16,48,.16)]">
      <aside className="relative isolate hidden flex-col overflow-hidden bg-gradient-to-br from-[#1b1030] via-[#5c2394] to-[#d91f63] px-5 pb-5 pt-5 text-white md:flex md:min-h-full md:justify-between md:px-10 md:py-9">
        <div aria-hidden className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-[#a617d3]/45 blur-3xl" />
        <div aria-hidden className="absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-[#fb9320]/30 blur-3xl" />
        <Link href={WEB_URL} aria-label="XTRA-CASH home" className="relative z-10 inline-flex w-fit"><Logo light size={31} /></Link>
        <div className="relative z-10 mt-6 max-w-[60%] sm:max-w-[55%] md:mt-auto md:max-w-full md:pb-8">
          <p className="text-[10px] font-bold uppercase tracking-[.18em] text-white/70">Back office</p>
          <h1 className="mt-2 text-2xl font-bold leading-tight text-white sm:text-3xl md:text-4xl">Clear view. Confident decisions.</h1>
          <p className="mt-2 text-xs leading-relaxed text-white/80 sm:text-sm">Lending, payments and platform operations together.</p>
        </div>
        <Image src="/brand/ui/illustration_team.png" alt="XTRA-CASH operations team reviewing lending and payments" width={980} height={574} priority className="absolute -bottom-2 -right-5 z-0 h-[185px] w-[56%] object-contain object-bottom sm:h-[220px] sm:w-[54%] md:bottom-12 md:right-5 md:h-[380px] md:w-[92%]" />
      </aside>
      <section className="safe-pb flex h-full min-w-0 flex-col justify-center px-5 py-3 sm:px-9 md:h-auto md:px-12 md:py-10 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-5 flex justify-center md:hidden"><Logo size={30} /></div>
          <div className="mb-5 text-center md:text-left"><p className="hidden text-xs font-bold uppercase tracking-[.16em] text-brand-purple md:block">Staff access</p><h2 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Welcome back</h2><p className="mt-1 hidden text-sm text-muted sm:block">Sign in to your XTRA-CASH back office.</p></div>
          <Card className="rounded-2xl border-line p-4 shadow-[0_6px_24px_rgba(27,16,48,.06)] sm:p-6">
            <form className="space-y-4" onSubmit={e => { e.preventDefault(); void login(); }}>
              <Field label="Email address"><span className="relative block"><Mail aria-hidden className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><Input className="h-12 rounded-xl bg-white pl-10" type="email" inputMode="email" autoComplete="email" value={identifier} onChange={e => setIdentifier(e.target.value)} required maxLength={254} placeholder="you@xtra-cash.co.za" /></span></Field>
              <Field label="Password"><span className="relative block"><LockKeyhole aria-hidden className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><Input className="h-12 rounded-xl bg-white pl-10 pr-12" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required maxLength={72} placeholder="Enter your password" /><button type="button" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-muted">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></span></Field>
              {error && <Alert tone="red">{error}</Alert>}
              <Button className="w-full rounded-xl bg-brand-orange text-ink hover:bg-brand-orange-dark" size="lg" loading={busy}>Log in <ArrowRight className="h-4 w-4" /></Button>
            </form>
          </Card>
          <nav aria-label="Sign-in links" className="mt-5 flex items-center justify-center gap-5 text-xs"><Link className="font-semibold text-muted underline underline-offset-2" href={WEB_URL}>Home</Link><PasswordResetLink staff /><Link className="font-semibold text-brand-purple underline underline-offset-2" href={WEB_URL + '/login'}>Customer login</Link></nav>
        </div>
      </section>
    </div>
  </main>;
}
