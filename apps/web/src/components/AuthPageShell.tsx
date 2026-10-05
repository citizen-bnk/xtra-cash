import Link from 'next/link';
import type { ReactNode } from 'react';
import { Home } from 'lucide-react';
import { Logo } from '@xtra/ui';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/login', label: 'Sign in' },
  { href: '/register', label: 'Create account' },
];

export function AuthPageShell({ children, currentPath }: { children: ReactNode; currentPath: '/login' | '/register' | '/personal-loan' }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link href="/" aria-label="XTRA-CASH home" className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink">
            <Logo size={36} className="text-lg sm:text-xl" />
          </Link>
          <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-1 text-sm font-semibold">
            {LINKS.map(({ href, label }) => (
              <Link key={href} href={href} aria-current={href === currentPath ? 'page' : undefined}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${href === currentPath ? 'bg-ink text-white' : 'text-ink hover:bg-surface'}`}>
                {href === '/' && <Home aria-hidden="true" className="h-4 w-4" />}
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:py-14">
        {children}
      </main>
      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-5 text-sm sm:flex-row sm:px-6">
          <p className="text-muted">XTRA-CASH. Put out the fire.</p>
          <nav aria-label="Footer navigation" className="flex flex-wrap justify-center gap-x-5 gap-y-2">
            {LINKS.map(({ href, label }) => (
              <Link key={href} href={href} aria-current={href === currentPath ? 'page' : undefined}
                className="inline-flex min-h-11 items-center rounded-lg font-semibold text-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink">
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
