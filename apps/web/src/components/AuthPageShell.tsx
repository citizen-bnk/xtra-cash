import Image from 'next/image';
import type { ReactNode } from 'react';
import { Logo } from '@xtra/ui';

type AuthPath = '/login' | '/register' | '/personal-loan' | '/offers' | '/install';

export function AuthPageShell({ children, currentPath }: { children: ReactNode; currentPath: AuthPath }) {
  const isLogin = currentPath === '/login';
  return <div className={`xc-app-theme bg-[#f6f2f9] ${isLogin ? 'h-[100dvh] overflow-hidden md:grid md:place-items-center md:p-6' : 'min-h-[100dvh] md:grid md:place-items-center md:p-6'}`}>
    <div className={`mx-auto w-full max-w-5xl overflow-hidden bg-white ${isLogin ? 'grid h-full md:h-auto md:min-h-[min(790px,calc(100dvh-3rem))]' : 'grid min-h-[100dvh]'} md:grid-cols-[.92fr_1.08fr] md:rounded-[30px] md:shadow-[0_24px_90px_rgba(27,16,48,.16)]`}>
      <aside className={`relative isolate ${isLogin ? 'hidden md:flex' : 'flex min-h-[252px] sm:min-h-[280px]'} flex-col overflow-hidden bg-gradient-to-br from-[#1b1030] via-[#5c2394] to-[#d91f63] px-5 pb-5 pt-5 text-white sm:px-8 md:min-h-full md:justify-between md:px-10 md:py-9`}>
        <div aria-hidden className="absolute -right-20 -top-16 h-64 w-64 rounded-full bg-[#a617d3]/45 blur-3xl" />
        <div aria-hidden className="absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-[#fb9320]/30 blur-3xl" />
        <LinkHome />
        <div className="relative z-10 mt-5 max-w-[56%] sm:max-w-[55%] md:mt-auto md:max-w-[88%] md:pb-36">
          <p className="text-[10px] font-bold uppercase tracking-[.18em] text-white/70">{isLogin ? 'Welcome back' : 'Your XTRA-CASH journey'}</p>
          <h2 className="mt-2 text-xl font-bold leading-tight text-white sm:text-2xl md:text-4xl">{isLogin ? 'Your money, all in one place.' : 'More ways to move forward.'}</h2>
          <p className="mt-2 max-w-sm text-xs leading-relaxed text-white/80 sm:text-sm">Loans, payments and everyday money tools in one simple app.</p>
        </div>
        <Image src="/brand/ui/illustration_township.png" alt="XTRA-CASH community customers and local businesses" width={900} height={600} priority className="absolute -bottom-1 -right-6 z-0 h-[184px] w-[48%] object-contain object-bottom sm:h-[220px] sm:w-[50%] md:bottom-10 md:right-4 md:h-[330px] md:w-[94%]" />
        <div className="relative z-10 mt-auto hidden items-center gap-2 text-xs font-medium text-white/75 md:flex"><span className="h-2 w-2 rounded-full bg-[#fb9320]" />Put out the fire.</div>
      </aside>
      <main className={`safe-pb flex min-w-0 flex-col justify-center px-5 md:px-12 lg:px-16 ${isLogin ? 'h-full py-3 md:h-auto md:py-10' : 'py-7 sm:px-9 sm:py-10'}`}>
        <div className="mx-auto w-full max-w-md">
          {isLogin && <div className="mb-5 flex justify-center md:hidden"><Logo size={30} /></div>}
          {!isLogin && <a href="/" className="mb-5 inline-flex items-center gap-1 text-sm font-semibold text-[#5c2394]">← Back to home</a>}
          {children}
        </div>
      </main>
    </div>
  </div>;
}

function LinkHome() {
  return <a href="/" aria-label="XTRA-CASH home" className="relative z-10 inline-flex w-fit rounded-lg focus-visible:outline-2 focus-visible:outline-white"><Logo light size={31} /></a>;
}
