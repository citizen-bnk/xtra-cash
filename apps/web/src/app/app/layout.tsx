'use client';
import {LoanActionCentre} from '@xtra/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight, Banknote, Home, ReceiptText, UserRound, Wallet } from 'lucide-react';
import { cx, Logo, useAuth } from '@xtra/ui';
import { RequireRole } from '@/lib/guard';
import { MarketingLocationObserver } from '@/components/MarketingLocationObserver';

const NAV = [
  { href: '/app', label: 'Home', icon: Home, exact: true },
  { href: '/app/loans', label: 'Loans', icon: Banknote },
  { href: '/app/bills', label: 'Pay', icon: ReceiptText },
  { href: '/app/wallet', label: 'Wallet', icon: Wallet },
  { href: '/app/profile', label: 'Profile', icon: UserRound },
];

/** Phone navigation follows the customer journey board: Home, Loans, Wallet, Activity, Profile. */
const TABS = [
  { href: '/app', label: 'Home', icon: Home, exact: true },
  { href: '/app/loans', label: 'Loans', icon: Banknote },
  { href: '/app/bills', label: 'Pay', icon: ReceiptText },
  { href: '/app/profile', label: 'Profile', icon: UserRound },
];

export default function ConsumerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { me } = useAuth();
  const immersiveHome = pathname === '/app';
  const canSwitchToOffice = !!me?.roles.some((r) => r === 'ADMIN' || r === 'SUPER_ADMIN');
  const active = (n: { href: string; exact?: boolean }) => (n.exact ? pathname === n.href : pathname.startsWith(n.href));
  const initials = `${me?.firstName?.[0] ?? ''}${me?.lastName?.[0] ?? ''}`.toUpperCase() || 'Me';
  const tab = (n: (typeof TABS)[number]) => (
    <Link
      key={n.href}
      href={n.href}
      aria-current={active(n) ? 'page' : undefined}
      className={cx('pressable flex min-h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', active(n) ? 'text-[#5c2394]' : 'text-[#1b1030]')}
    >
      <span className="grid h-7 w-10 place-items-center"><n.icon className={cx('h-5 w-5', active(n) && 'fill-current')} /></span>
      {n.label}
    </Link>
  );

  return (
    <RequireRole roles={['CONSUMER', 'AFFILIATE', 'LENDER', 'ADMIN', 'SUPER_ADMIN']} signedOutRoute="/onboarding">
      <MarketingLocationObserver />
      <div className={`xc-app-theme xc-customer-app ${immersiveHome ? 'min-h-[100dvh]' : 'min-h-[100dvh] bg-[#f5f0fa] pb-[calc(5.25rem+env(safe-area-inset-bottom,0px))] lg:pb-0'}`}>
        {!immersiveHome && <header className="safe-pt sticky top-0 z-30 border-b border-white/15 bg-gradient-to-r from-[#1b1030] via-[#5c2394] to-[#a617d3] text-white shadow-lg shadow-purple-950/15">
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
            <nav className="hidden gap-1 lg:flex">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className={cx('rounded-lg px-3 py-1.5 text-sm font-medium', active(n) ? 'bg-white/15 text-white' : 'text-white/75 hover:bg-white/10 hover:text-white')}
                >
                  {n.label}
                </Link>
              ))}
            </nav>
            <LoanActionCentre/>
            {canSwitchToOffice && <Link href="https://xtra-cash-admin.vercel.app" aria-label="Open back office" title="Back office" className="pressable grid h-9 w-9 place-items-center rounded-full text-white/90 hover:bg-white/10"><ArrowUpRight className="h-5 w-5" /></Link>}
            <div className="flex items-center gap-1 lg:hidden">
              <Link href="/app/activity" aria-label="Activity" className="pressable grid h-10 w-10 place-items-center rounded-full text-ink">
                <ReceiptText className="h-5 w-5" />
              </Link>
              <Link href="/app/profile" aria-label="Profile" className="pressable grid h-9 w-9 place-items-center rounded-full bg-brand-purple text-xs font-bold text-white">
                {initials}
              </Link>
            </div>
          </div>
        </header>}
        <main key={pathname} className={immersiveHome ? 'min-h-[100dvh]' : 'xc-customer-surface mx-auto min-h-[calc(100dvh-8rem)] max-w-5xl px-4 py-5 animate-fade-in sm:px-5 lg:py-6'}>
          {children}
        </main>
        {!immersiveHome && <nav aria-label="App" className="safe-pb fixed inset-x-0 bottom-0 z-30 border-t border-white/40 bg-white/95 text-[#1b1030] shadow-[0_-8px_30px_rgba(30,0,50,.28)] backdrop-blur-xl lg:hidden">
          <div className="mx-auto grid max-w-md grid-cols-5 items-center px-2">
            {TABS.slice(0, 2).map(tab)}
            <Link href="/app?assistant=1" aria-label="Open XTRA-CASH Assistant" className="-mt-7 flex flex-col items-center justify-center gap-0.5"><span className="grid h-[68px] w-[68px] place-items-center rounded-full border-[4px] border-white bg-gradient-to-br from-[#5c2394] via-[#d91f63] to-[#fb9320] shadow-[0_0_18px_rgba(166,23,211,.5)]"><Logo light markOnly size={43} /></span><span className="text-[10px] font-bold text-[#5c2394]">Assistant</span></Link>
            {TABS.slice(2).map(tab)}
          </div>
        </nav>}
      </div>
    </RequireRole>
  );
}
