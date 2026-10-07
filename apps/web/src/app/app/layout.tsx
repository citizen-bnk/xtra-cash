'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { CreditCard, Home, ListOrdered, ReceiptText, ScanLine, UserRound } from 'lucide-react';
import { cx, Logo, useAuth } from '@xtra/ui';
import { RequireRole } from '@/lib/guard';
import { PAY_EVENT } from '@/lib/pay-event';

const NAV = [
  { href: '/app', label: 'Home', icon: Home, exact: true },
  { href: '/app/card', label: 'Card', icon: CreditCard },
  { href: '/app/loans', label: 'Repayments', icon: ListOrdered },
  { href: '/app/activity', label: 'Activity', icon: ReceiptText },
  { href: '/app/profile', label: 'Profile', icon: UserRound },
];

/** Phone tab bar: Pay sits in the middle, raised, because paying at the till is the main job. */
const TABS = [
  { href: '/app', label: 'Home', icon: Home, exact: true },
  { href: '/app/card', label: 'Card', icon: CreditCard },
  { href: '/app/loans', label: 'Repay', icon: ListOrdered },
  { href: '/app/profile', label: 'Me', icon: UserRound },
];

export default function ConsumerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { me } = useAuth();
  const active = (n: { href: string; exact?: boolean }) => (n.exact ? pathname === n.href : pathname.startsWith(n.href));
  const initials = `${me?.firstName?.[0] ?? ''}${me?.lastName?.[0] ?? ''}`.toUpperCase() || 'Me';
  const pay = () => {
    if (pathname === '/app') window.dispatchEvent(new Event(PAY_EVENT));
    else router.push('/app?pay=1');
  };

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
      <div className="min-h-[100dvh] pb-[calc(5.25rem+env(safe-area-inset-bottom,0px))] md:pb-0">
        <header className="safe-pt sticky top-0 z-30 border-b border-line/70 bg-white/90 backdrop-blur-md">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5 md:py-3">
            <Link href="/app" aria-label="XTRA-CASH home" className="hidden md:block">
              <Logo />
            </Link>
            {/* Phones: brand mark + greeting, like a banking app. */}
            <Link href="/app" className="flex min-w-0 items-center gap-2.5 md:hidden">
              <Logo markOnly size={32} />
              <span className="min-w-0 leading-tight">
                <span className="block text-[11px] font-medium text-muted">Sawubona</span>
                <span className="block truncate text-sm font-bold">{me?.firstName ?? 'XTRA-CASH'}</span>
              </span>
            </Link>
            <nav className="hidden gap-1 md:flex">
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
            <div className="flex items-center gap-1 md:hidden">
              <Link href="/app/activity" aria-label="Activity" className="pressable grid h-10 w-10 place-items-center rounded-full text-ink">
                <ReceiptText className="h-5 w-5" />
              </Link>
              <Link href="/app/profile" aria-label="Profile" className="pressable grid h-9 w-9 place-items-center rounded-full bg-brand-gradient text-xs font-bold text-white">
                {initials}
              </Link>
            </div>
          </div>
        </header>
        <main key={pathname} className="mx-auto max-w-5xl px-4 py-5 animate-fade-in md:py-6">
          {children}
        </main>
        <nav aria-label="App" className="safe-pb fixed inset-x-0 bottom-0 z-30 border-t border-line/70 bg-white/95 backdrop-blur-md md:hidden">
          <div className="mx-auto grid max-w-md grid-cols-5 items-end">
            {TABS.slice(0, 2).map(tab)}
            <div className="flex justify-center">
              <button
                onClick={pay}
                aria-label="Pay"
                className="pressable -mt-6 flex flex-col items-center gap-1 pb-1.5 text-[11px] font-semibold text-ink"
              >
                <span className="grid h-14 w-14 place-items-center rounded-full bg-brand-gradient text-white shadow-lg shadow-brand/40 ring-4 ring-white">
                  <ScanLine className="h-6 w-6" />
                </span>
                Pay
              </button>
            </div>
            {TABS.slice(2).map(tab)}
          </div>
        </nav>
      </div>
    </RequireRole>
  );
}
