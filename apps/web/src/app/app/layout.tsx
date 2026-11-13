'use client';
import {LoanActionCentre} from '@xtra/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { Logo, useAuth } from '@xtra/ui';
import { RequireRole } from '@/lib/guard';
import { MarketingLocationObserver } from '@/components/MarketingLocationObserver';
import { CustomerBottomNav } from '@/components/CustomerBottomNav';
import { CustomerProfileLink } from '@/components/CustomerProfileLink';

export default function ConsumerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { me } = useAuth();
  const immersiveHome = pathname === '/app';
  const immersiveProfile = pathname === '/app/profile';
  const canSwitchToOffice = !!me?.roles.some((r) => r === 'ADMIN' || r === 'SUPER_ADMIN');

  return (
    <RequireRole roles={['CONSUMER', 'AFFILIATE', 'LENDER', 'ADMIN', 'SUPER_ADMIN']} signedOutRoute="/onboarding">
      <MarketingLocationObserver />
      <div className={`xc-app-theme xc-customer-app min-h-[100dvh] pb-[calc(5.25rem+env(safe-area-inset-bottom,0px))] ${immersiveHome ? '' : 'bg-[#f5f0fa]'}`}>
        {!immersiveHome && !immersiveProfile && <header className="safe-pt sticky top-0 z-30 border-b border-white/15 bg-gradient-to-r from-[#1b1030] via-[#5c2394] to-[#a617d3] text-white shadow-lg shadow-purple-950/15">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5 lg:py-3">
            <Link href="/app" aria-label="XTRA-CASH home" className="hidden lg:block">
              <Logo light />
            </Link>
            {/* Phones: brand mark + greeting, like a banking app. */}
            <Link href="/app" className="flex min-w-0 items-center gap-2.5 lg:hidden">
              <Logo light markOnly size={34} />
              <span className="min-w-0 leading-tight">
                <span className="block text-[10px] font-medium text-white/65">Sawubona</span>
                <span className="block truncate text-sm font-bold text-white">{me?.firstName ?? 'XTRA-CASH'}</span>
              </span>
            </Link>
            <Link href="/app" className="hidden items-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold text-white/90 hover:bg-white/10 lg:inline-flex"><ArrowLeft className="h-4 w-4" /> Home</Link>
            <div className="flex items-center gap-1"><LoanActionCentre/><CustomerProfileLink /></div>
            {canSwitchToOffice && <Link href="https://xtra-cash-admin.vercel.app" aria-label="Open back office" title="Back office" className="pressable grid h-9 w-9 place-items-center rounded-full text-white/90 hover:bg-white/10"><ArrowUpRight className="h-5 w-5" /></Link>}
          </div>
        </header>}
        <main key={pathname} className={immersiveHome ? 'min-h-[100dvh]' : immersiveProfile ? 'min-h-[calc(100dvh-5rem)] animate-fade-in' : 'xc-customer-surface mx-auto min-h-[calc(100dvh-8rem)] max-w-5xl px-4 py-5 animate-fade-in sm:px-5 lg:py-6'}>
          {children}
        </main>
        {!immersiveHome && <CustomerBottomNav />}
      </div>
    </RequireRole>
  );
}
