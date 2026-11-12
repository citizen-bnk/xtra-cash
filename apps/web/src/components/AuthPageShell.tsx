import type { ReactNode } from 'react';
import { Logo } from '@xtra/ui';

export function AuthPageShell({ children }: { children: ReactNode; currentPath: '/login' | '/register' | '/personal-loan' | '/offers' | '/install' }) {
  return <div className="xc-app-theme min-h-[100dvh] bg-[#f4eff8] sm:grid sm:place-items-center sm:p-5">
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col overflow-hidden bg-white shadow-[0_25px_80px_rgba(42,22,64,.18)] sm:min-h-[min(900px,calc(100dvh-2.5rem))] sm:rounded-[34px]">
      <header className="safe-pt relative flex min-h-[218px] shrink-0 flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[#5c2394] via-[#a617d3] to-[#d91f63] px-5 pb-8 pt-7 text-center text-white">
        <div aria-hidden className="absolute -right-16 -top-14 h-48 w-48 rounded-full bg-[#fa941f]/45 blur-3xl" />
        <div aria-hidden className="absolute -bottom-24 -left-12 h-44 w-44 rounded-full bg-[#da1786]/50 blur-2xl" />
        <div className="relative"><Logo light size={44} /><p className="mt-2 text-sm font-medium italic text-white/90">Put out the fire.</p></div>
      </header>
      <main className="safe-pb relative -mt-6 flex flex-1 flex-col rounded-t-[30px] bg-white px-5 pb-6 pt-7 sm:px-8">{children}</main>
    </div>
  </div>;
}
