'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CreditCard, Home, ListOrdered, ReceiptText, UserRound } from 'lucide-react';
import { cx, Logo, useAuth } from '@xtra/ui';
import { RequireRole } from '@/lib/guard';

const NAV = [
  { href: '/app', label: 'Home', icon: Home, exact: true },
  { href: '/app/card', label: 'Card', icon: CreditCard },
  { href: '/app/loans', label: 'Repayments', icon: ListOrdered },
  { href: '/app/activity', label: 'Activity', icon: ReceiptText },
  { href: '/app/profile', label: 'Profile', icon: UserRound },
];

export default function ConsumerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { me } = useAuth();
  const active = (n: (typeof NAV)[number]) => (n.exact ? pathname === n.href : pathname.startsWith(n.href));
  return (
    <RequireRole roles={['CONSUMER', 'AFFILIATE', 'LENDER']}>
      <div className="min-h-screen pb-20 md:pb-0">
        <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/app">
              <Logo />
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
            <div className="text-sm font-medium text-muted md:hidden">Hi, {me?.firstName}</div>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-white md:hidden">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={cx('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', active(n) ? 'text-ink' : 'text-muted')}>
              <n.icon className={cx('h-5 w-5', active(n) && 'text-brand')} />
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </RequireRole>
  );
}
