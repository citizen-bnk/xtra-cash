'use client';
import {LoanActionCentre} from '@xtra/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ListOrdered, ReceiptText, UserRound, Wallet } from 'lucide-react';
import { cx, Logo, useAuth } from '@xtra/ui';
import { RequireRole } from '@/lib/guard';
import { MarketingLocationObserver } from '@/components/MarketingLocationObserver';

const NAV = [
  { href: '/app', label: 'Home', icon: Home, exact: true },
  { href: '/app/loans', label: 'Loans', icon: ListOrdered },
  { href: '/app/wallet', label: 'Wallet', icon: Wallet },
  { href: '/app/activity', label: 'Activity', icon: ReceiptText },
  { href: '/app/profile', label: 'Profile', icon: UserRound },
];

/** Phone navigation follows the customer journey board: Home, Loans, Wallet, Activity, Profile. */
const TABS = [
  { href: '/app', label: 'Home', icon: Home, exact: true },
  { href: '/app/loans', label: 'Loans', icon: ListOrdered },
  { href: '/app/wallet', label: 'Wallet', icon: Wallet },
  { href: '/app/activity', label: 'Activity', icon: ReceiptText },
  { href: '/app/profile', label: 'Profile', icon: UserRound },
];

export default function ConsumerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { me } = useAuth();
  const immersiveHome = pathname === '/app';
  const active = (n: { href: string; exact?: boolean }) => (n.exact ? pathname === n.href : pathname.startsWith(n.href));
  const initials = `${me?.firstName?.[0] ?? ''}${me?.lastName?.[0] ?? ''}`.toUpperCase() || 'Me';
  const tab = (n: (typeof TABS)[number]) => (
    <Link
      key={n.href}
      href={n.href}
      aria-current={active(n) ? 'page' : undefined}
      className={cx('pressable flex flex-col items-center justify-center gap-1 pt-2 pb-1.5 text-[11px] font-semibold', active(n) ? 'text-ink' : 'text-muted')}
    >
      <span className={cx('grid h-7 w-12 place-items-center rounded-full transition-colors', active(n) && 'bg-brand-soft')}>
        <n.icon className={cx('h-5 w-5', active(n) && 'text-brand')} />
      </span>
      {n.label}
    </Link>
  );

  return (
    <RequireRole roles={['CONSUMER', 'AFFILIATE', 'LENDER']}>
      <MarketingLocationObserver />
      <div className={immersiveHome ? 'min-h-[100dvh]' : 'min-h-[100dvh] pb-[calc(5.25rem+env(safe-area-inset-bottom,0px))] lg:pb-0'}>
        {!immersiveHome && <header className="safe-pt sticky top-0 z-30 border-b border-line/70 bg-white/90 backdrop-blur-md">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5 lg:py-3">
            <Link href="/app" aria-label="XTRA-CASH home" className="hidden lg:block">
              <Logo />
            </Link>
            {/* Phones: brand mark + greeting, like a banking app. */}
            <Link href="/app" className="flex min-w-0 items-center gap-2.5 lg:hidden">
              <Logo markOnly size={32} />
              <span className="min-w-0 leading-tight">
                <span className="block text-[11px] font-medium text-muted">Sawubona</span>
                <span className="block truncate text-sm font-bold">{me?.firstName ?? 'XTRA-CASH'}</span>
              </span>
            </Link>
            <nav className="hidden gap-1 lg:flex">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className={cx('rounded-lg px-3 py-1.5 text-sm font-medium', active(n) ? 'bg-ink text-white' : 'text-muted hover:text-ink')}
                >
                  {n.label}
                </Link>
              ))}
            </nav>
            <LoanActionCentre/>
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
        <main key={pathname} className={immersiveHome ? 'min-h-[100dvh]' : 'mx-auto max-w-5xl px-4 py-5 animate-fade-in lg:py-6'}>
          {children}
        </main>
        {!immersiveHome && <nav aria-label="App" className="safe-pb fixed inset-x-0 bottom-0 z-30 border-t border-line/70 bg-white/95 backdrop-blur-md lg:hidden">
          <div className="mx-auto grid max-w-md grid-cols-5 items-center">
            {TABS.map(tab)}
          </div>
        </nav>}
      </div>
    </RequireRole>
  );
}
