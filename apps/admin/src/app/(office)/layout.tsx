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
  HandCoins,
  Landmark,
  LayoutDashboard,
  Search,
  ShoppingCart,
  ScrollText,
  Settings,
  Store,
  Tags,
  UserCheck,
  Users,
  Zap,
} from 'lucide-react';
import { AppShell, Loading, useApi, useAuth } from '@xtra/ui';

export default function OfficeLayout({ children }: { children: React.ReactNode }) {
  const { me, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const staff = !!me && me.roles.some((r) => r === 'ADMIN' || r === 'SUPER_ADMIN');
  useEffect(() => {
    if (!loading && !staff) router.replace('/login?next=' + encodeURIComponent(pathname));
  }, [loading, staff, router]);
  const stats = useApi((c) => (staff ? c.admin.stats() : Promise.resolve(undefined)), [staff, pathname]);

  if (loading || !staff) return <Loading />;
  const s = stats.data;
  const customerOrigin = (process.env.NEXT_PUBLIC_WEB_URL ?? 'https://xtra-cash.vercel.app').replace(/\/$/, '');
  const apps = [{ label: 'Back office', href: '/', current: true }, { label: 'Customer app', href: customerOrigin + '/app' }];
  if (me?.roles.includes('LENDER')) apps.push({ label: 'Lender portal', href: customerOrigin + '/lender', current: false });
  if (me?.roles.includes('AFFILIATE')) apps.push({ label: 'Affiliate portal', href: customerOrigin + '/affiliate', current: false });
  if (me?.roles.includes('SALES_REP')) apps.push({ label: 'XTRA Payday', href: customerOrigin + '/team', current: false });
  const nav = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
    { href: '/security', group: 'People & access', label: 'Sign-in & security', icon: UserCheck },
    { href: '/users', group: 'People & access', label: 'Users', icon: Users },
    { href: '/payday', group: 'Partners & payroll', label: 'XTRA Payday staff & leads', icon: Users },
    { href: '/kyc', group: 'People & access', label: 'KYC review', icon: UserCheck, badge: s?.kycPending },
    { href: '/lenders', group: 'Lending', label: 'Credit Mall lenders', icon: Store, badge: s?.lendersPendingReview },
    { href: '/marketplace', group: 'Lending', label: 'Loan marketplace', icon: Tags },
    { href: '/money', group: 'Money & payments', label: 'Wallet funding & EFT', icon: Banknote },
    { href: '/funding', group: 'Money & payments', label: 'Lender funding', icon: Banknote, badge: s?.fundingPending },
    { href: '/offers', group: 'Lending', label: 'Loan offers', icon: Tags },
    { href: '/loans', group: 'Lending', label: 'Loan book', icon: FileStack },
    { href: '/applications', group: 'Lending', label: 'Loan applications', icon: FileStack },
    { href: '/guarantees', group: 'Lending', label: 'Guarantee requests', icon: FileStack },
    { href: '/reports', group: 'Money & payments', label: 'Revenue & ledger', icon: ScrollText },
    { href: '/transactions', group: 'Money & payments', label: 'Card transactions', icon: Activity },
    { href: '/billers', group: 'Money & payments', label: 'Biller network', icon: FileStack },
    { href: '/payroll', group: 'Partners & payroll', label: 'Payroll integrations', icon: Landmark },
    { href: '/collections', group: 'Lending', label: 'Collections & recovery', icon: Activity },
    { href: '/merchants', group: 'Partners & payroll', label: 'Merchants & vouchers', icon: ShoppingCart },
    { href: '/integrations', group: 'Platform', label: 'Integrations & compliance', icon: Zap },
    { href: '/affiliates', group: 'Partners & payroll', label: 'Affiliates', icon: HandCoins, badge: (s?.commissionsPending ?? 0) + (s?.payoutsPending ?? 0) },
    { href: '/audit', group: 'Platform', label: 'Audit log', icon: ScrollText },
    { href: '/settings', group: 'Platform', label: 'Platform settings', icon: Settings },
  ];
  return (
    <AppShell
      nav={nav}
      pathname={pathname}
      Link={Link as any}
      section={me!.roles.includes('SUPER_ADMIN') ? 'Back office · Super-admin' : 'Back office · Admin'}
      userName={`${me!.firstName} ${me!.lastName}`}
      userEmail={me!.email}
      accountMenu={[{ label: 'My profile', href: '/account' }, { label: 'Sign-in & security', href: '/security' }, { label: 'Platform settings', href: '/settings' }, { label: 'Audit log', href: '/audit' }]}
      switchApps={apps}
      contentClassName={pathname === '/' ? 'max-w-none px-3 py-4 sm:px-4 lg:py-4' : undefined}
      topBarClassName="border-white/10 bg-gradient-to-r from-[#5c2394] via-[#a617d3] to-[#d91f63] text-white [&_button]:text-white [&_button]:border-white/20 [&_button]:bg-white/10"
      topBarContent={<><div className="hidden min-w-0 items-center gap-5 lg:flex"><div className="min-w-0"><div className="font-bold leading-tight">XTRA-CASH Back Office</div><div className="truncate text-[10px] text-white/70">Operations · Lending · Payments · Merchants · Collections · Compliance</div></div><label className="flex h-9 w-[min(28vw,25rem)] items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 text-xs text-white/75"><Search className="h-4 w-4 shrink-0"/><input aria-label="Search back office (preview)" placeholder="Search customers, applications, loans…" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-white/65"/><kbd className="rounded bg-white/15 px-1.5 py-0.5">⌘ K</kbd></label><button type="button" aria-label="Help" className="grid h-9 w-9 place-items-center rounded-full border border-white/20"><CircleHelp className="h-4 w-4"/></button></div><div className="text-xs font-bold lg:hidden">Back Office</div></>}
      footer={
        <div className="flex items-center gap-1.5 hidden text-xs text-white/80 lg:flex">
          <BadgeCheck className="h-3.5 w-3.5" /> Actions are audit-logged
        </div>
      }
      onLogout={async () => {
        await logout();
        router.replace('/login');
      }}
    >
      <div className="xc-admin-content">{children}</div>
    </AppShell>
  );
}
