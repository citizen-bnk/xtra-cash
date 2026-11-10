// Same-origin: /api/* is proxied to the API server-side (src/app/api/[...path]/route.ts).
export const API_URL = '/api';
export const ADMIN_URL = (process.env.NEXT_PUBLIC_ADMIN_URL ?? 'https://xtra-cash-admin.vercel.app').replace(/\/$/, '');
export const WEB_URL = (process.env.NEXT_PUBLIC_WEB_URL ?? 'https://xtra-cash.vercel.app').replace(/\/$/, '');

import type { Me } from '@xtra/shared';
/** Where a user lands after signing in. */
export function homeFor(me: Pick<Me, 'roles'>): string {
  if (me.roles.includes('LENDER')) return '/lender';
  if (me.roles.includes('CONSUMER')) return '/app';
  if (me.roles.includes('AFFILIATE')) return '/affiliate';
  return '/app';
}
