'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AppShell, useAuth, type NavItem } from '@xtra/ui';

export function PortalShell({ nav, section, children, footer }: { nav: NavItem[]; section: string; children: React.ReactNode; footer?: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { me, logout } = useAuth();
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
      {children}
    </AppShell>
  );
}

export function openBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
