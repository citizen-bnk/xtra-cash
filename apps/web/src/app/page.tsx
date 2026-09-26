'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, BadgeCheck, CreditCard, Landmark, ShieldCheck, Store, Users, Zap } from 'lucide-react';
import { Button, Logo, useAuth, XtraCard } from '@xtra/ui';
import { homeFor } from '@/lib/config';

export default function Landing() {
  const { me } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (me) router.replace(homeFor(me));
  }, [me, router]);

  return (
    <div className="bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo size={36} className="text-lg" />
        <nav className="flex items-center gap-2">
          <Link href="/login" className="px-3 text-sm font-semibold text-ink hover:underline">
            Sign in
          </Link>
          <Link href="/register">
            <Button size="sm">Get started</Button>
          </Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-8 sm:px-6 md:grid-cols-2 md:pt-16">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-xs font-bold text-ink">
            <Zap className="h-3.5 w-3.5" /> Credit at the point of payment
          </span>
          <h1 className="mt-4 text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl">
            Short at the till? <br />
            Tap for <span className="text-brand-gradient">XTRA-CASH</span>.
          </h1>
          <p className="mt-5 max-w-md text-lg text-muted">
            Your XTRA-CASH card pays from your own money first — and tops up the rest instantly with the best offer from accredited micro-lenders who match your profile.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/register?type=CONSUMER">
              <Button size="lg">
                Get my XTRA-CASH card <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/register?type=LENDER">
              <Button size="lg" variant="secondary">
                Lend on the Credit Mall
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted">Affordability-checked. No hidden fees — you see the full cost before you pay.</p>
        </div>
        <div className="relative mx-auto w-full max-w-sm">
          <div className="absolute -inset-8 -z-10 rounded-[3rem] bg-gradient-to-br from-brand/25 to-brand-orange/25 blur-2xl" />
          <XtraCard name="NALEDI KHUMALO" maskedPan="5399 99•• •••• 4821" expiry="09/30" />
          <div className="-mt-6 ml-10 rounded-2xl border border-line bg-white p-4 shadow-xl">
            <div className="text-xs font-medium text-muted">Shoprite Soweto · R1 850.00</div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span>From wallet</span>
              <span className="font-semibold">R500.00</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>XTRA-CASH · Kasi Capital</span>
              <span className="font-semibold text-emerald-700">R1 350.00</span>
            </div>
            <div className="mt-2 rounded-lg bg-surface px-2 py-1 text-xs text-muted">3 × R519.95 · approved in 0.4s</div>
          </div>
        </div>
      </section>

      <section className="bg-surface py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-2xl font-bold">How XTRA-CASH works</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              { icon: BadgeCheck, title: 'Verify once', text: 'Tell us about your income and expenses. We match you to lenders whose criteria fit you — no endless applications.' },
              { icon: CreditCard, title: 'Pay anywhere', text: 'Use your XTRA-CASH card in-store, online or on the XTRA-CASH marketplace. Your XTRA-Balance = wallet + matched credit.' },
              { icon: ShieldCheck, title: 'Repay simply', text: 'Fixed installments over 1–24 months. Settle early any time with no penalty. We only offer what you can afford.' },
            ].map((s) => (
              <div key={s.title} className="rounded-2xl bg-white p-6">
                <s.icon className="h-6 w-6 text-brand" />
                <div className="mt-3 font-bold">{s.title}</div>
                <p className="mt-1 text-sm text-muted">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-16 sm:px-6 md:grid-cols-2">
        <div className="rounded-3xl bg-ink p-8 text-white">
          <Landmark className="h-7 w-7 text-brand-orange" />
          <h3 className="mt-4 text-2xl font-bold">The Credit Mall for micro-lenders</h3>
          <p className="mt-2 text-white/70">
            Open a stall, get accredited (or let us help you get there), load funds and set your lending criteria. We bring you verified, affordability-checked customers at the moment they need you.
          </p>
          <Link href="/register?type=LENDER" className="mt-6 inline-block">
            <Button variant="accent">Open a lending stall</Button>
          </Link>
        </div>
        <div className="rounded-3xl bg-brand-sunset p-8 text-white">
          <Users className="h-7 w-7" />
          <h3 className="mt-4 text-2xl font-bold">Earn as an XTRA-CASH affiliate</h3>
          <p className="mt-2 text-white/85">
            Educate and onboard shoppers, traders, merchants and lenders in your community. Earn commission when they activate, get accredited and use XTRA-CASH.
          </p>
          <Link href="/register?type=AFFILIATE" className="mt-6 inline-block">
            <Button variant="secondary">Become an affiliate</Button>
          </Link>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-xs text-muted sm:px-6">
          <div className="flex items-center gap-2">
            <Store className="h-4 w-4" /> XTRA-CASH (Pty) Ltd. Credit is provided by independent, NCR-registered credit providers.
          </div>
          <div>Responsible lending · POPIA compliant · © {new Date().getFullYear()}</div>
        </div>
      </footer>
    </div>
  );
}
