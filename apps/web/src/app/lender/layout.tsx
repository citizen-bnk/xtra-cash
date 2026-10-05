'use client';
import Link from 'next/link';
import { BadgeCheck, Banknote, FileStack, LayoutDashboard, ShoppingBag, Tags } from 'lucide-react';
import { RequireRole } from '@/lib/guard';
import { PortalShell } from '@/components/PortalShell';

const NAV = [
  { href: '/lender', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/lender/accreditation', label: 'Accreditation', icon: BadgeCheck },
  { href: '/lender/funds', label: 'Funds', icon: Banknote },
  { href: '/lender/offers', label: 'Offers & criteria', icon: Tags },
  { href: '/lender/loans', label: 'Loan book', icon: FileStack },
  { href: '/lender/applications', label: 'Loan applications', icon: FileStack },
];

export default function LenderLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole roles={['LENDER']}>
      <PortalShell
        nav={NAV}
        section="Credit Mall · Lender"
        footer={
          <Link href="/app" className="flex items-center gap-2 text-xs font-medium text-white/60 hover:text-white">
            <ShoppingBag className="h-3.5 w-3.5" /> Shopper app
          </Link>
        }
      >
        {children}
      </PortalShell>
    </RequireRole>
  );
}
