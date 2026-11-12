'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, ArrowRight, Banknote, CalendarDays, ReceiptText, ShieldCheck, ShoppingBag, Wallet } from 'lucide-react';
import { Logo } from '@xtra/ui';

const slides = [
  { eyebrow: 'Welcome to XTRA-CASH', title: 'Fast money, easy payments and more in one app.', text: 'A clearer way to manage your money, apply for credit and stay in control.', icon: Wallet },
  { eyebrow: 'Loans', title: 'Get a loan when you need it.', text: 'Choose an amount and term, then review lender offers before you decide.', icon: Banknote },
  { eyebrow: 'Buy now, pay later', title: 'Shop now. Pay later.', text: 'Use eligible XTRA-CASH credit for purchases at participating stores.', icon: ShoppingBag },
  { eyebrow: 'Bill payments', title: 'Pay your bills in one place.', text: 'Find supported services and keep your payment activity together.', icon: ReceiptText },
  { eyebrow: 'Salary & payroll', title: 'Make more of your pay day.', text: 'Explore salary-linked advances and employee benefits when they are available through your employer.', icon: CalendarDays },
];

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const current = slides[step], Icon = current.icon;
  const next = () => setStep(s => Math.min(s + 1, slides.length - 1));
  const back = () => setStep(s => Math.max(s - 1, 0));
  return <main className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-[#31004d] text-white">
    <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_85%_18%,rgba(224,23,173,.72),transparent_38%),radial-gradient(ellipse_at_5%_90%,rgba(255,126,25,.42),transparent_35%),linear-gradient(145deg,#3a005e,#8a09b7_58%,#d51c91)]" />
    <div aria-hidden className="absolute -right-20 top-32 h-64 w-64 rounded-full bg-fuchsia-400/30 blur-3xl" />
    <header className="safe-pt relative flex items-center justify-between px-5 py-4"><Logo light size={32} /><Link href="/login" className="text-sm font-semibold text-white/90 underline underline-offset-4">Skip</Link></header>
    <section className="relative mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-5 pt-5">
      <div className="flex flex-1 flex-col justify-center">
        {step === 0 ? <div className="mb-8 rounded-[34px] border border-white/20 bg-black/15 p-6 shadow-2xl backdrop-blur-sm">
          <div className="flex justify-center"><Logo light size={42} /></div>
          <div aria-hidden className="relative mx-auto mt-6 grid h-48 w-48 place-items-center rounded-full bg-gradient-to-br from-fuchsia-300/70 via-purple-500/30 to-orange-300/70 shadow-[0_0_60px_rgba(232,48,234,.55)]"><span className="absolute inset-5 rounded-full border border-white/50" /><Wallet className="relative h-24 w-24 text-yellow-300 drop-shadow-[0_8px_12px_rgba(0,0,0,.4)]" /></div>
          <p className="mt-7 text-center text-xs font-bold uppercase tracking-[.2em] text-white/70">Put out the fire</p>
        </div> : <div className="relative mx-auto mb-8 grid h-60 w-full place-items-center overflow-hidden rounded-[34px] border border-white/30 bg-gradient-to-br from-white/15 to-white/5 shadow-2xl backdrop-blur">
          <div aria-hidden className="absolute -right-6 -top-8 h-40 w-40 rounded-full bg-orange-300/40 blur-2xl" /><div aria-hidden className="absolute -bottom-10 -left-5 h-40 w-40 rounded-full bg-fuchsia-300/40 blur-2xl" />
          <div className="relative grid h-36 w-36 place-items-center rounded-[30px] border border-white/60 bg-gradient-to-br from-white to-[#f3dfff] text-[#7f08ba] shadow-xl"><Icon className="h-20 w-20" /><span className="absolute -bottom-3 -right-4 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-orange-300 to-orange-500 text-white shadow-lg"><ShieldCheck className="h-7 w-7" /></span></div>
        </div>}
        <p className="text-center text-xs font-bold uppercase tracking-[.2em] text-white/70">{current.eyebrow}</p>
        <h1 className="mt-3 text-center text-3xl font-black leading-tight tracking-tight sm:text-4xl">{current.title}</h1>
        <p className="mx-auto mt-3 max-w-sm text-center text-base leading-relaxed text-white/80">{current.text}</p>
        <div className="mt-6 flex justify-center gap-2" aria-label={`Screen ${step + 1} of ${slides.length}`}>
          {slides.map((slide, i) => <button type="button" key={slide.eyebrow} aria-label={`Go to ${slide.eyebrow}`} aria-current={i === step ? 'step' : undefined} onClick={() => setStep(i)} className={`h-2 rounded-full transition-all ${i === step ? 'w-7 bg-fuchsia-200' : 'w-2 bg-white/50'}`} />)}
        </div>
      </div>
      <div className="space-y-3 pt-5">
        {step === 0 ? <Link href="/register" className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-white text-base font-black text-[#29103c] shadow-lg">Get started <ArrowRight className="h-5 w-5" /></Link> : step === slides.length - 1 ? <Link href="/register" className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#fb9320] text-base font-black text-[#29103c] shadow-lg">Create account <ArrowRight className="h-5 w-5" /></Link> : <div className="grid grid-cols-2 gap-3"><button type="button" onClick={back} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white/10 font-semibold"><ArrowLeft className="h-4 w-4" /> Back</button><button type="button" onClick={next} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#b516e1] to-[#7300bd] font-bold shadow-lg">Next <ArrowRight className="h-4 w-4" /></button></div>}
        {step === 0 && <button type="button" onClick={next} className="w-full py-2 text-sm font-semibold text-white/85">Learn more</button>}
        <p className="pt-1 text-center text-sm text-white/75">Already have an account? <Link href="/login" className="font-bold text-white underline underline-offset-4">Login</Link></p>
      </div>
    </section>
    <footer className="safe-pb relative pb-3 text-center text-[11px] text-white/55">XTRA-CASH · Put out the fire</footer>
  </main>;
}
