'use client';
import { BadgeCheck, Banknote, FileStack, LayoutDashboard, Tags } from 'lucide-react';
import { RequireRole } from '@/lib/guard';
import { PortalShell } from '@/components/PortalShell';
import { LenderPersonalAccess } from '@/components/LenderPersonalAccess';

const NAV = [
  { href: '/lender', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/lender/accreditation', label: 'Accreditation', short: 'Accredit', icon: BadgeCheck },
  { href: '/lender/funds', label: 'Funds', icon: Banknote },
  { href: '/lender/offers', label: 'Offers & criteria', short: 'Offers', icon: Tags },
  { href: '/lender/campaigns', label: 'Nearby campaigns', short: 'Campaigns', icon: Tags },
  { href: '/lender/loans', label: 'Loan book', short: 'Loans', icon: FileStack },
  { href: '/lender/applications', label: 'Loan applications', short: 'Applications', icon: FileStack },
  { href: '/lender/ai', label: 'XTRA-Lender-AI', short: 'Lender AI', icon: Tags },
];

export default function LenderLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole roles={['LENDER']}>
      <PortalShell
        nav={NAV}
        section="Credit Mall · Lender"
        footer={
          <LenderPersonalAccess />
        }
      >
        {children}
      </PortalShell>
    </RequireRole>
  );
}
