'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { ChevronDown, Download, FireExtinguisher, PlayCircle, ShieldCheck, Snowflake, Zap } from 'lucide-react';
import { cx, Logo, useApi } from '@xtra/ui';
import { usePwa } from './pwa';

const SLIDES = [
  { icon: FireExtinguisher, title: 'Tap. Covered. Fire out.', text: 'Your card pays from your own money first, then your best matched lender covers the rest, in seconds.' },
  { icon: ShieldCheck, title: 'No smoke. No hidden fees.', text: 'See the full cost before you pay. Fixed installments, settle early with no penalty.' },
  { icon: Snowflake, title: 'Stay cool. Stay in control.', text: 'Only what you can afford. Freeze your card in one tap, any time.' },
];

/** Full-screen, app-style welcome shown instead of the website hero on phones. */
export function MobileWelcome() {
  const pwa = usePwa();
  const demo = useApi((c) => c.auth.demoPersonas().catch(() => ({ enabled: false, personas: [] })), []);
  const [slide, setSlide] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const showInstall = pwa.ready && !pwa.installed;
  const demoOn = !!demo.data?.enabled && demo.data.personas.some((p) => p.app === 'web');

  return (
    <section className="relative isolate flex min-h-[100svh] flex-col overflow-hidden bg-ink text-white md:hidden">
      <div className="absolute -right-24 -top-24 -z-20 h-80 w-80 rounded-full bg-brand/40 blur-3xl" />
      <div className="absolute -bottom-24 -left-16 -z-20 h-80 w-80 rounded-full bg-brand-orange/30 blur-3xl" />
      <video
        className="absolute inset-0 -z-10 h-full w-full object-cover opacity-80 motion-reduce:hidden"
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
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/80 to-ink/20" />

      <header className="safe-pt">
        <div className="flex items-center justify-between px-5 pt-4">
          <Logo light size={32} className="text-base" />
          <Link href="/login" className="pressable rounded-full bg-white/10 px-4 py-2 text-sm font-semibold backdrop-blur">
            Sign in
          </Link>
        </div>
      </header>

      <div className="flex flex-1 flex-col justify-end px-5 pb-4 pt-10">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-bold backdrop-blur">
          <Zap className="h-3.5 w-3.5 text-brand-orange" /> Credit at the point of payment
        </span>
        <h1 className="mt-4 text-[2.9rem] font-black uppercase leading-[0.92] tracking-tight">
          Put out
          <br />
          the <span className="text-brand-gradient-light">fire.</span>
        </h1>
        <p className="mt-3 text-base text-white/80">Money trouble spreads fast. XTRA-CASH stops it at the till.</p>

        <div
          ref={track}
          onScroll={(e) => setSlide(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
          className="no-scrollbar -mx-5 mt-6 flex snap-x snap-mandatory overflow-x-auto"
          aria-label="Why XTRA-CASH"
        >
          {SLIDES.map((s) => (
            <div key={s.title} className="w-full shrink-0 snap-center px-5">
              <div className="flex gap-3 rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-md">
                <s.icon className="mt-0.5 h-6 w-6 shrink-0 text-brand-orange" />
                <div>
                  <div className="font-bold">{s.title}</div>
                  <p className="mt-0.5 text-sm text-white/75">{s.text}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-center gap-1.5" aria-hidden>
          {SLIDES.map((s, i) => (
            <button
              key={s.title}
              tabIndex={-1}
              onClick={() => track.current?.scrollTo({ left: i * track.current.clientWidth, behavior: 'smooth' })}
              className={cx('h-1.5 rounded-full transition-all', i === slide ? 'w-5 bg-white' : 'w-1.5 bg-white/40')}
            />
          ))}
        </div>
      </div>

      <div className="safe-pb">
        <div className="space-y-2.5 px-5 pb-4 pt-2">
          {showInstall && (
            <button
              onClick={pwa.openInstall}
              className="pressable flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-white text-base font-bold text-ink shadow-xl"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icons/icon-192.png" alt="" className="h-7 w-7 rounded-lg" />
              Install the app
              <Download className="h-4 w-4 text-muted" />
            </button>
          )}
          <Link
            href="/register?type=CONSUMER"
            className={cx(
              'pressable flex h-14 w-full items-center justify-center rounded-2xl text-base font-bold',
              showInstall ? 'bg-brand text-white' : 'bg-white text-ink',
            )}
          >
            Create a free account
          </Link>
          <div className="grid grid-cols-2 gap-2.5">
            {demoOn ? (
              <Link href="/login#demo" className="pressable flex h-12 items-center justify-center gap-1.5 rounded-2xl bg-white/10 text-sm font-semibold backdrop-blur">
                <PlayCircle className="h-4 w-4" /> Try a demo
              </Link>
            ) : (
              <Link href="/login" className="pressable flex h-12 items-center justify-center rounded-2xl bg-white/10 text-sm font-semibold backdrop-blur">
                Sign in
              </Link>
            )}
            <Link href="/personal-loan?start=amount" className="pressable flex h-12 items-center justify-center rounded-2xl bg-white/10 text-sm font-semibold backdrop-blur">
              Personal loan
            </Link>
          </div>
          <a href="#how-it-works" className="flex items-center justify-center gap-1 pt-1 text-xs font-medium text-white/60">
            How it works <ChevronDown className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </section>
  );
}
