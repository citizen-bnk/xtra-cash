'use client';
import Link from 'next/link';
import { LayoutDashboard, ShoppingBag } from 'lucide-react';
import { RequireRole } from '@/lib/guard';
import { PortalShell } from '@/components/PortalShell';

export default function AffiliateLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireRole roles={['AFFILIATE']} fallback="/app/profile">
      <PortalShell
        nav={[{ href: '/affiliate', label: 'Dashboard', icon: LayoutDashboard, exact: true }]}
        section="Affiliate programme"
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
