'use client';
import React, { useState } from 'react';
import { LogOut, Menu, X } from 'lucide-react';
import { cx, Logo } from './components';

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  exact?: boolean;
}

type LinkLike = React.ComponentType<{ href: string; className?: string; children: React.ReactNode; onClick?: () => void }>;

/** Sidebar layout used by the lender portal, affiliate portal and back office. */
export function AppShell({
  nav,
  pathname,
  Link,
  section,
  userName,
  userEmail,
  onLogout,
  footer,
  children,
}: {
  nav: NavItem[];
  pathname: string;
  Link: LinkLike;
  section: string;
  userName: string;
  userEmail?: string;
  onLogout: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const isActive = (n: NavItem) => (n.exact ? pathname === n.href : pathname === n.href || pathname.startsWith(n.href + '/'));

  const links = (
    <nav className="flex flex-col gap-0.5">
      {nav.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          onClick={() => setOpen(false)}
          className={cx(
            'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition',
            isActive(n) ? 'bg-white/10 text-white' : 'text-white/65 hover:bg-white/5 hover:text-white',
          )}
        >
          <n.icon className={cx('h-4 w-4', isActive(n) && 'text-lime')} />
          <span className="flex-1">{n.label}</span>
          {n.badge ? <span className="rounded-full bg-lime px-1.5 text-xs font-bold text-ink">{n.badge}</span> : null}
        </Link>
      ))}
    </nav>
  );

  const side = (
    <div className="flex h-full flex-col bg-ink px-3 py-4">
      <div className="mb-6 px-2">
        <Logo light />
        <div className="mt-1 text-xs font-medium uppercase tracking-wider text-white/50">{section}</div>
      </div>
      {links}
      <div className="mt-auto space-y-3 px-2 pt-6">
        {footer}
        <div className="border-t border-white/10 pt-3">
          <div className="truncate text-sm font-medium text-white">{userName}</div>
          {userEmail && <div className="truncate text-xs text-white/50">{userEmail}</div>}
          <button onClick={onLogout} className="mt-2 inline-flex items-center gap-2 text-xs font-medium text-white/60 hover:text-white">
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 hidden w-60 lg:block">{side}</aside>
      <header className="sticky top-0 z-30 flex items-center justify-between bg-ink px-4 py-3 lg:hidden">
        <Logo light />
        <button onClick={() => setOpen(true)} className="text-white" aria-label="Open menu">
          <Menu className="h-6 w-6" />
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64">
            <button onClick={() => setOpen(false)} className="absolute right-3 top-4 z-10 text-white/70" aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            {side}
          </div>
        </div>
      )}
      <main className="lg:pl-60">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
