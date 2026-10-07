'use client';
import React, { useState } from 'react';
import { Ellipsis, LogOut, X } from 'lucide-react';
import { cx, Logo } from './components';

export interface NavItem {
  href: string;
  label: string;
  /** Shorter label for the phone tab bar (defaults to the first word of `label`). */
  short?: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  exact?: boolean;
}

type LinkLike = React.ComponentType<{ href: string; className?: string; children: React.ReactNode; onClick?: () => void }>;

/**
 * Layout for the lender portal, affiliate portal and back office: a sidebar on large screens; on phones
 * an app-style header and a bottom tab bar (first four sections + "More"), clear of the home indicator.
 */
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
  // Phone tab bar: up to five sections fit; beyond that, four tabs plus "More".
  const tabs = nav.length <= 5 ? nav : nav.slice(0, 4);
  const more = nav.length <= 5 ? [] : nav.slice(4);
  const moreBadge = more.reduce((sum, n) => sum + (n.badge ?? 0), 0);
  const initials =
    userName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '•';

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
          <n.icon className={cx('h-4 w-4', isActive(n) && 'text-brand-orange')} />
          <span className="flex-1">{n.label}</span>
          {n.badge ? <span className="rounded-full bg-brand px-1.5 text-xs font-bold text-white">{n.badge}</span> : null}
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
      <header className="safe-pt sticky top-0 z-30 bg-ink lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <div className="min-w-0">
            <Logo light size={26} />
            <div className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-wider text-white/50">{section}</div>
          </div>
          <button
            onClick={() => setOpen(true)}
            className="pressable grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-gradient text-xs font-bold text-white"
            aria-label="Account and more"
          >
            {initials}
          </button>
        </div>
      </header>
      {tabs.length > 1 && (
        <nav aria-label={section} className="safe-pb fixed inset-x-0 bottom-0 z-30 border-t border-line/70 bg-white/95 backdrop-blur-md lg:hidden">
          <div className="mx-auto grid max-w-lg" style={{ gridTemplateColumns: `repeat(${tabs.length + (more.length ? 1 : 0)}, minmax(0, 1fr))` }}>
            {tabs.map((n) => (
              <Link key={n.href} href={n.href} className={cx('pressable relative flex flex-col items-center gap-1 pt-2 pb-1.5 text-[11px] font-semibold', isActive(n) ? 'text-ink' : 'text-muted')}>
                <span className={cx('grid h-7 w-12 place-items-center rounded-full', isActive(n) && 'bg-brand-soft')}>
                  <n.icon className={cx('h-5 w-5', isActive(n) && 'text-brand')} />
                </span>
                <span className="max-w-full truncate px-1">{n.short ?? n.label.split(' ')[0]}</span>
                {n.badge ? <span className="absolute right-[18%] top-1 min-w-4 rounded-full bg-brand px-1 text-center text-[10px] font-bold leading-4 text-white">{n.badge}</span> : null}
              </Link>
            ))}
            {more.length > 0 && (
              <button onClick={() => setOpen(true)} className={cx('pressable relative flex flex-col items-center gap-1 pt-2 pb-1.5 text-[11px] font-semibold', more.some(isActive) ? 'text-ink' : 'text-muted')}>
                <span className={cx('grid h-7 w-12 place-items-center rounded-full', more.some(isActive) && 'bg-brand-soft')}>
                  <Ellipsis className={cx('h-5 w-5', more.some(isActive) && 'text-brand')} />
                </span>
                More
                {moreBadge ? <span className="absolute right-[18%] top-1 min-w-4 rounded-full bg-brand px-1 text-center text-[10px] font-bold leading-4 text-white">{moreBadge}</span> : null}
              </button>
            )}
          </div>
        </nav>
      )}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end bg-ink/50 animate-fade-in lg:hidden" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal aria-label="Menu" onClick={(e) => e.stopPropagation()} className="safe-pb max-h-[85dvh] w-full overflow-y-auto rounded-t-[24px] bg-white animate-sheet-up">
            <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-line" />
            <div className="flex items-center gap-3 border-b border-line px-5 py-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-gradient text-sm font-bold text-white">{initials}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">{userName}</div>
                {userEmail && <div className="truncate text-xs text-muted">{userEmail}</div>}
              </div>
              <button onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-full text-muted" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="grid gap-1 p-3">
              {(tabs.length > 1 ? more : nav).map((n) => (
                <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className={cx('pressable flex min-h-12 items-center gap-3 rounded-2xl px-3 text-sm font-semibold', isActive(n) ? 'bg-brand-soft text-ink' : 'text-ink')}>
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-surface"><n.icon className={cx('h-5 w-5', isActive(n) ? 'text-brand' : 'text-muted')} /></span>
                  <span className="flex-1">{n.label}</span>
                  {n.badge ? <span className="rounded-full bg-brand px-2 text-xs font-bold text-white">{n.badge}</span> : null}
                </Link>
              ))}
            </nav>
            {footer && <div className="px-5 pb-2 text-sm">{footer}</div>}
            <div className="px-3 pb-4">
              <button onClick={onLogout} className="pressable flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-sm font-semibold text-red-600">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-red-50"><LogOut className="h-5 w-5" /></span> Sign out
              </button>
            </div>
          </div>
        </div>
      )}
      <main className={cx('lg:pl-60', nav.length > 1 && 'pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:pb-0')}>
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">{children}</div>
      </main>
    </div>
  );
}
