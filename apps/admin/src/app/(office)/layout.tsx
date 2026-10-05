'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  BadgeCheck,
  Banknote,
  FileStack,
  HandCoins,
  LayoutDashboard,
  ScrollText,
  Settings,
  Store,
  Tags,
  UserCheck,
  Users,
} from 'lucide-react';
import { AppShell, Loading, useApi, useAuth } from '@xtra/ui';

export default function OfficeLayout({ children }: { children: React.ReactNode }) {
  const { me, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const staff = !!me && me.roles.some((r) => r === 'ADMIN' || r === 'SUPER_ADMIN');
  useEffect(() => {
    if (!loading && !staff) router.replace('/login');
  }, [loading, staff, router]);
  const stats = useApi((c) => (staff ? c.admin.stats() : Promise.resolve(undefined)), [staff, pathname]);

  if (loading || !staff) return <Loading />;
  const s = stats.data;
  const nav = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
    { href: '/users', label: 'Users', icon: Users },
    { href: '/kyc', label: 'KYC review', icon: UserCheck, badge: s?.kycPending },
    { href: '/lenders', label: 'Credit Mall lenders', icon: Store, badge: s?.lendersPendingReview },
    { href: '/funding', label: 'Lender funding', icon: Banknote, badge: s?.fundingPending },
    { href: '/offers', label: 'Loan offers', icon: Tags },
    { href: '/loans', label: 'Loan book', icon: FileStack },
    { href: '/applications', label: 'Loan applications', icon: FileStack },
    { href: '/reports', label: 'Revenue & ledger', icon: ScrollText },
    { href: '/transactions', label: 'Card transactions', icon: Activity },
    { href: '/affiliates', label: 'Affiliates', icon: HandCoins, badge: (s?.commissionsPending ?? 0) + (s?.payoutsPending ?? 0) },
    { href: '/audit', label: 'Audit log', icon: ScrollText },
    { href: '/settings', label: 'Platform settings', icon: Settings },
  ];
  return (
    <AppShell
      nav={nav}
      pathname={pathname}
      Link={Link as any}
      section={me!.roles.includes('SUPER_ADMIN') ? 'Back office · Super-admin' : 'Back office · Admin'}
      userName={`${me!.firstName} ${me!.lastName}`}
      userEmail={me!.email}
      footer={
        <div className="flex items-center gap-1.5 text-xs text-white/50">
          <BadgeCheck className="h-3.5 w-3.5" /> Actions are audit-logged
        </div>
      }
      onLogout={async () => {
        await logout();
        router.replace('/login');
      }}
    >
      {children}
    </AppShell>
  );
}
