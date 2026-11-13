'use client';
import Link from 'next/link';
import { useAuth } from '@xtra/ui';

export function CustomerProfileLink() {
  const { me } = useAuth();
  const initials = `${me?.firstName?.[0] ?? 'X'}${me?.lastName?.[0] ?? ''}`.toUpperCase();
  return <Link href="/app/profile" aria-label="Open profile" title="Profile" className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-white/80 bg-white/20 text-xs font-black text-white shadow-sm">{initials}</Link>;
}
