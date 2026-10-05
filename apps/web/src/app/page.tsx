'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, FireExtinguisher, Flame, Landmark, ShieldCheck, Siren, Snowflake, Store, Users, Zap } from 'lucide-react';
import { Button, Logo, useAuth, XtraCard } from '@xtra/ui';
import { homeFor } from '@/lib/config';

/** The four beats of the "Put out the fire" story (docs/MESSAGING.md). */
const BEATS = [
  { icon: Flame, title: 'The spark', line: 'It starts with one bill.', text: 'Short at the till, school fees due, taxi fare gone, the fridge breaks. Money trouble spreads fast.' },
  { icon: FireExtinguisher, title: 'Put it out', line: 'Tap. Covered. Fire out.', text: 'Your XTRA-CASH card pays from your own money first, then covers the rest with your best matched lender offer, in seconds.' },
  { icon: ShieldCheck, title: 'Cool down', line: 'No smoke. No hidden fees.', text: 'See the full cost before you pay. Fixed installments over 1–24 months, and settle early any time with no penalty.' },
  { icon: Snowflake, title: 'Fireproof', line: 'Stay cool. Stay in control.', text: 'We only offer what you can afford. Build up your wallet, and freeze your card in one tap whenever you want.' },
];

export default function Landing() {
  const { me } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (me) router.replace(homeFor(me));
  }, [me, router]);

  return (
    <div className="overflow-x-clip bg-white">
      <section className="relative isolate flex min-h-[88svh] flex-col overflow-hidden bg-ink text-white">
        {/* Fallback glow shows if the video is missing, still loading or reduced motion is on. */}
        <div className="absolute -right-24 -top-24 -z-20 h-96 w-96 rounded-full bg-brand/40 blur-3xl" />
        <div className="absolute -bottom-32 left-1/4 -z-20 h-96 w-96 rounded-full bg-brand-orange/30 blur-3xl" />
        <video
          className="absolute inset-0 -z-10 h-full w-full object-cover motion-reduce:hidden"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster="/brand/fire-poster.jpg"
          aria-hidden="true"
        >
          <source src="/brand/xtra-cash-wallet-burning.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/70 to-ink/30" />

        <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-5 sm:px-6">
          <Logo light size={36} className="text-base sm:text-lg" />
          <nav className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Link href="/login" className="whitespace-nowrap px-2 text-sm font-semibold text-white hover:underline sm:px-3">
              Sign in
            </Link>
            <Link href="/register">
              <Button size="sm" variant="accent" className="whitespace-nowrap">Get started</Button>
            </Link>
          </nav>
        </header>

        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-end px-4 pb-16 pt-24 sm:px-6 md:justify-center md:pb-24">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-bold backdrop-blur">
            <Zap className="h-3.5 w-3.5 text-brand-orange" /> Credit at the point of payment
          </span>
          <h1 className="mt-5 text-5xl font-black uppercase leading-[0.95] tracking-tight sm:text-7xl">
            Put out <br className="sm:hidden" />
            the <span className="text-brand-gradient-light">fire.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-white/80 sm:text-xl">
            Money trouble spreads fast. XTRA-CASH stops it at the till, in seconds.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/personal-loan?start=amount">
              <Button size="lg" variant="accent">Apply for a personal loan <ArrowRight className="h-4 w-4" /></Button>
            </Link>
            <Link href="/register?type=CONSUMER">
              <Button size="lg" variant="accent">
                Get my card <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="secondary">
                Sign in
              </Button>
            </Link>
          </div>
          <p className="mt-5 max-w-xl text-xs text-white/60">
            <Link href="/personal-loan?start=identity" className="mb-2 block font-semibold text-white underline">Start with your ID or passport instead →</Link>
            Affordability-checked. You see the full cost before you pay. Credit from NCR-registered lenders.
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 md:grid-cols-2 md:py-24">
        <div>
          <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
            Tap. Covered. <span className="text-brand-gradient">Fire out.</span>
          </h2>
          <p className="mt-4 max-w-md text-lg text-muted">
            Your XTRA-CASH card pays from your own money first, and tops up the rest instantly with the cheapest offer from accredited micro-lenders who match your profile.
          </p>
          <Link href="/register?type=CONSUMER" className="mt-6 inline-block">
            <Button size="lg">
              Get my card <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
        <div className="relative mx-auto w-full max-w-sm">
          <div className="absolute -inset-4 -z-10 rounded-[3rem] bg-gradient-to-br from-brand/25 to-brand-orange/25 blur-2xl sm:-inset-8" />
          <XtraCard name="NALEDI KHUMALO" maskedPan="5399 99•• •••• 4821" expiry="09/30" />
          <div className="relative z-10 -mt-3 ml-6 rounded-2xl border border-line bg-white p-4 shadow-xl sm:ml-10">
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

      <section className="bg-surface py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-2xl font-bold">How XTRA-CASH puts out the fire</h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {BEATS.map((s, i) => (
              <li key={s.title} className="rounded-2xl bg-white p-6">
                <div className="flex items-center gap-2">
                  <s.icon className="h-6 w-6 text-brand" />
                  <span className="text-xs font-bold uppercase tracking-wider text-muted">Step {i + 1}</span>
                </div>
                <div className="mt-3 font-bold">{s.title}</div>
                <div className="text-sm font-semibold text-brand-dark">{s.line}</div>
                <p className="mt-2 text-sm text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-16 sm:px-6 md:grid-cols-2">
        <div className="rounded-3xl bg-ink p-8 text-white">
          <Siren className="h-7 w-7 text-brand-orange" />
          <h3 className="mt-4 text-2xl font-bold">Join the fire brigade</h3>
          <p className="mt-2 text-white/70">
            Lend to verified, affordability-checked shoppers at the exact moment they need you. Open a stall in the Credit Mall, get accredited (or let us help), load funds and set your lending criteria.
          </p>
          <Link href="/register?type=LENDER" className="mt-6 inline-block">
            <Button variant="accent">
              <Landmark className="h-4 w-4" /> Open a lending stall
            </Button>
          </Link>
        </div>
        <div className="rounded-3xl bg-brand-sunset p-8 text-white">
          <Users className="h-7 w-7" />
          <h3 className="mt-4 text-2xl font-bold">Become a fire marshal</h3>
          <p className="mt-2 text-white/85">
            Help your community put out money fires. Onboard shoppers, traders, merchants and lenders, and earn commission when they activate and use XTRA-CASH.
          </p>
          <Link href="/register?type=AFFILIATE" className="mt-6 inline-block">
            <Button variant="secondary">Become an affiliate</Button>
          </Link>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <div className="text-lg font-black tracking-tight">
            XTRA-CASH. <span className="text-brand-gradient">Put out the fire.</span>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 text-xs text-muted">
            <div className="flex items-center gap-2">
              <Store className="h-4 w-4" /> XTRA-CASH (Pty) Ltd. Credit is provided by independent, NCR-registered credit providers.
            </div>
            <div>Responsible lending · POPIA compliant · © {new Date().getFullYear()}</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
