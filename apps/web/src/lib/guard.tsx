'use client';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ServiceProfile } from '@/components/ServiceProfile';
import type { Role } from '@xtra/shared';
import { Loading, useAuth } from '@xtra/ui';

/** Client-side route guard: redirects to /login when signed out, or away when the role is missing. */
export function RequireRole({ roles, children, fallback = '/app' }: { roles: Role[]; children: React.ReactNode; fallback?: string }) {
  const { me, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const needsName = !['/app', '/app/profile', '/app/activity', '/app/loans', '/lender', '/affiliate', '/security'].includes(pathname);
  const allowed = !!me && roles.some((r) => me.roles.includes(r));
  useEffect(() => {
    if (loading) return;
    if (!me) router.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    else if (!allowed) router.replace(fallback);
  }, [loading, me, allowed, router, fallback]);
  if (loading || !allowed) return <Loading />;
  if (me?.profileComplete === false && needsName) return <ServiceProfile />;
  return <>{children}</>;
}
