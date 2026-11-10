'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AppShell, useAuth, type NavItem } from '@xtra/ui';

export function PortalShell({ nav, section, children, footer }: { nav: NavItem[]; section: string; children: React.ReactNode; footer?: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { me, logout, client } = useAuth();
  return (
    <AppShell
      nav={nav}
      pathname={pathname}
      Link={Link as any}
      section={section}
      userName={me ? `${me.firstName} ${me.lastName}` : ''}
      userEmail={me?.email}
      footer={footer}
      onLogout={async () => {
        await logout();
        router.replace('/');
      }}
    >
      {me?.supportSession && <div className="sticky top-0 z-50 mb-4 flex items-center justify-between gap-3 rounded-xl bg-amber-100 px-4 py-2 text-sm text-amber-950 shadow"><span>You are viewing the lender portal in admin support mode{me.supportSession.adminEmail ? ` · ${me.supportSession.adminEmail}` : ''}. Actions are recorded under the administrator.</span><button className="shrink-0 rounded-md bg-amber-900 px-3 py-1 font-semibold text-white" onClick={async () => { await client.request('POST', '/support/session/end', {}).catch(() => undefined); await logout(); router.replace('/'); }}>End session</button></div>}
      {children}
    </AppShell>
  );
}

export function openBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
