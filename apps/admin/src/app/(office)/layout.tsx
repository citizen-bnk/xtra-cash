'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  BadgeCheck,
  Banknote,
  CircleHelp,
  FileStack,
  Grid2X2,
  HandCoins,
  LayoutDashboard,
  Search,
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
    { href: '/security', label: 'Sign-in & security', icon: UserCheck },
    { href: '/users', label: 'Users', icon: Users },
    { href: '/payday', label: 'XTRA Payday staff & leads', icon: Users },
    { href: '/kyc', label: 'KYC review', icon: UserCheck, badge: s?.kycPending },
    { href: '/lenders', label: 'Credit Mall lenders', icon: Store, badge: s?.lendersPendingReview },
    { href: '/money', label: 'Wallet funding & EFT', icon: Banknote },
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
      contentClassName={pathname === '/' ? 'max-w-none px-3 py-4 sm:px-4 lg:py-4' : undefined}
      topBarClassName="border-white/10 bg-gradient-to-r from-[#6500a8] via-[#8c00c8] to-[#40006a] text-white [&_button]:text-white [&_button]:border-white/20 [&_button]:bg-white/10"
      topBarContent={<><div className="hidden min-w-0 items-center gap-5 lg:flex"><div className="min-w-0"><div className="font-bold leading-tight">XTRA-CASH Back Office</div><div className="truncate text-[10px] text-white/70">Operations · Lending · Payments · Merchants · Collections · Compliance</div></div><label className="flex h-9 w-[min(28vw,25rem)] items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 text-xs text-white/75"><Search className="h-4 w-4 shrink-0"/><input aria-label="Search back office (preview)" placeholder="Search customers, applications, loans…" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-white/65"/><kbd className="rounded bg-white/15 px-1.5 py-0.5">⌘ K</kbd></label><button type="button" aria-label="Help" className="grid h-9 w-9 place-items-center rounded-full border border-white/20"><CircleHelp className="h-4 w-4"/></button><button type="button" aria-label="Applications menu" className="grid h-9 w-9 place-items-center rounded-full border border-white/20"><Grid2X2 className="h-4 w-4"/></button><div className="hidden xl:block"><div className="text-xs font-bold">{me!.firstName} {me!.lastName}</div><div className="text-[10px] text-white/70">{me!.roles.includes('SUPER_ADMIN') ? 'Super Admin' : 'Admin'}</div></div></div><div className="text-xs font-bold lg:hidden">Back Office</div></>}
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
