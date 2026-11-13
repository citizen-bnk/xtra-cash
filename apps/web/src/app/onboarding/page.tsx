'use client';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, Banknote, CalendarDays, ReceiptText, ShieldCheck, ShoppingBag, Wallet } from 'lucide-react';
import { Logo, Loading, useAuth } from '@xtra/ui';
import { homeFor } from '@/lib/config';

const slides = [
  { eyebrow: 'Welcome to XTRA-CASH', title: 'Fast money, easy payments and more in one app.', text: 'Borrow, shop and manage payments in one place.', image: '/brand/photo/customer-phone.png', alt: 'Customer smiling with her phone', icon: Wallet },
  { eyebrow: 'Personal loans', title: 'Get a loan when you need it.', text: 'Choose an amount and term, then compare lender offers before you decide.', image: '/brand/photo/customer-loan.png', alt: 'Customer looking at his phone', icon: Banknote },
  { eyebrow: 'Buy now, pay later', title: 'Shop now. Pay later.', text: 'Explore participating partner stores and eligible payment options.', image: '/brand/photo/customer-shopping.png', alt: 'Customer shopping with her phone', icon: ShoppingBag },
  { eyebrow: 'Bill payments', title: 'Pay bills in one place.', text: 'Keep payment services and activity together in your account.', image: '/brand/photo/customer-phone.png', alt: 'Customer using her phone', icon: ReceiptText },
  { eyebrow: 'Salary & payroll', title: 'Make more of your pay day.', text: 'Explore salary-linked services available through participating employers.', image: '/brand/photo/customer-portrait.png', alt: 'Smiling customer', icon: CalendarDays },
];

export default function OnboardingPage() { return <Suspense fallback={<Loading />}><OnboardingFlow /></Suspense>; }
function OnboardingFlow() {
  const [step, setStep] = useState(0);
  const params = useSearchParams(), router = useRouter();
  const { me, loading } = useAuth();
  const current = slides[step], Icon = current.icon;
  const suppliedNext = params.get('next');
  const nextPath = suppliedNext && /^\/app(?:\/|\?|$)/.test(suppliedNext) && !suppliedNext.includes('\\') ? suppliedNext : '/app';
  const registerHref = `/register?next=${encodeURIComponent(nextPath)}`;
  const loginHref = `/login?next=${encodeURIComponent(nextPath)}`;
  useEffect(() => { if (!loading && me) router.replace(homeFor(me)); }, [loading, me, router]);
  const next = () => setStep(s => Math.min(s + 1, slides.length - 1));
  const back = () => setStep(s => Math.max(s - 1, 0));
  return <main className="xc-app-theme relative flex min-h-[100dvh] flex-col overflow-hidden bg-[#1b1030] text-white">
    <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_85%_18%,rgba(166,23,211,.62),transparent_38%),radial-gradient(ellipse_at_5%_90%,rgba(251,147,32,.32),transparent_35%),linear-gradient(145deg,#1b1030,#5c2394_53%,#d91f63)]" />
    <header className="safe-pt relative flex items-center justify-between px-5 py-4"><Link href="/" aria-label="Back to XTRA-CASH home"><Logo light size={34} /></Link><Link href={loginHref} className="rounded-full border border-white/30 bg-white/10 px-4 py-2 text-sm font-bold text-white backdrop-blur">Skip</Link></header>
    <section className="relative mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-5 pt-2">
      <div className="flex flex-1 flex-col justify-center">
        <div className="relative mb-7 flex h-[min(36vh,290px)] min-h-[230px] items-center justify-center overflow-hidden rounded-[32px] border border-white/25 bg-[#fff7ee] p-3 shadow-[0_16px_45px_rgba(18,0,32,.3)]">
          <div aria-hidden className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-[#fb9320]/40 blur-2xl" />
          <div aria-hidden className="absolute -bottom-14 -left-8 h-40 w-40 rounded-full bg-[#d91f63]/25 blur-2xl" />
          {current.image ? <Image src={current.image} alt={current.alt ?? ''} width={900} height={680} priority className="relative h-full w-full object-contain" /> : <div className="relative grid h-36 w-36 place-items-center rounded-[30px] border border-[#eee1f3] bg-gradient-to-br from-white to-[#f3dfff] text-[#7f08ba] shadow-xl"><Icon className="h-20 w-20" /><span className="absolute -bottom-3 -right-4 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[#fb9320] to-[#e55b51] text-white shadow-lg"><ShieldCheck className="h-7 w-7" /></span></div>}
        </div>
        <p className="text-center text-xs font-extrabold uppercase tracking-[.2em] text-white/75">{current.eyebrow}</p>
        <h1 className="mt-2 text-center text-3xl font-black leading-tight tracking-tight text-white sm:text-4xl">{current.title}</h1>
        <p className="mx-auto mt-3 max-w-sm text-center text-base leading-relaxed text-white/80">{current.text}</p>
        <div className="mt-5 flex justify-center gap-2" aria-label={`Screen ${step + 1} of ${slides.length}`}>
          {slides.map((slide, i) => <button type="button" key={slide.eyebrow} aria-label={`Go to ${slide.eyebrow}`} aria-current={i === step ? 'step' : undefined} onClick={() => setStep(i)} className={`h-2 rounded-full transition-all ${i === step ? 'w-7 bg-white' : 'w-2 bg-white/45'}`} />)}
        </div>
      </div>
      <div className="space-y-3 pt-5">
        <div className="flex items-center gap-3">
          {step > 0 && <button type="button" aria-label="Previous slide" onClick={back} className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-white/50 bg-white/10 text-white"><ArrowLeft className="h-6 w-6" /></button>}
          {step === 0 ? <Link href={loginHref} className="flex min-h-14 flex-1 items-center justify-center rounded-2xl bg-gradient-to-r from-[#a617d3] to-[#d91f63] text-base font-black text-white shadow-lg">Get started</Link> : step === slides.length - 1 ? <Link href={registerHref} className="flex min-h-14 flex-1 items-center justify-center rounded-2xl bg-[#fb9320] text-base font-black text-[#1b1030] shadow-lg">Create account</Link> : <span className="flex-1" />}
          {step < slides.length - 1 && <button type="button" aria-label="Next slide" onClick={next} className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-white/50 bg-white/10 text-white"><ArrowRight className="h-6 w-6" /></button>}
        </div>
        <p className="pt-1 text-center text-sm text-white/80">Not yet registered? <Link href={registerHref} className="font-bold text-white underline underline-offset-4">Create Account</Link></p>
      </div>
    </section>
    <footer className="safe-pb relative pb-3 text-center text-[11px] text-white/55">XTRA-CASH · Put out the fire</footer>
  </main>;
}
