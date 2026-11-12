import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@xtra/ui';

export function AuthPageShell({ children, currentPath }: { children: ReactNode; currentPath: '/login' | '/register' | '/personal-loan' | '/offers' | '/install' }) {
  const switchHref = currentPath === '/login' ? '/register' : '/login';
  const switchLabel = currentPath === '/login' ? 'Create account' : 'Login';
  return <div className="relative flex min-h-[100dvh] flex-col overflow-hidden bg-gradient-to-br from-[#31004d] via-[#7900a6] to-[#dd1587]">
    <div aria-hidden className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full bg-fuchsia-400/30 blur-3xl" />
    <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-orange-400/25 blur-3xl" />
    <header className="safe-pt relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-5 py-4 sm:px-8">
      <Link href="/onboarding" aria-label="XTRA-CASH app intro" className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"><Logo light size={32} /></Link>
      <Link href={switchHref} className="inline-flex min-h-10 items-center rounded-full border border-white/30 bg-white/10 px-4 text-sm font-bold text-white backdrop-blur hover:bg-white/20">{switchLabel}</Link>
    </header>
    <main className="safe-pb relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-5 sm:py-8">{children}</main>
    <footer className="relative z-10 pb-3 text-center text-[11px] text-white/60">XTRA-CASH · Put out the fire · <Link href="/onboarding" className="underline underline-offset-2">How it works</Link></footer>
  </div>;
}
