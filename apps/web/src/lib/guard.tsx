'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Role } from '@xtra/shared';
import { Loading, useAuth } from '@xtra/ui';

/** Client-side route guard: redirects to /login when signed out, or away when the role is missing. */
export function RequireRole({ roles, children, fallback = '/app' }: { roles: Role[]; children: React.ReactNode; fallback?: string }) {
  const { me, loading } = useAuth();
  const router = useRouter();
  const allowed = !!me && roles.some((r) => me.roles.includes(r));
  useEffect(() => {
    if (loading) return;
    if (!me) router.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    else if (me.profileComplete === false) router.replace('/welcome');
    else if (!allowed) router.replace(fallback);
  }, [loading, me, allowed, router, fallback]);
  if (loading || !allowed || me?.profileComplete === false) return <Loading />;
  return <>{children}</>;
}
