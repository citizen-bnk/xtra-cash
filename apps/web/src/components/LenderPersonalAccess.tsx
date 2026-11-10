'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, useAuth } from '@xtra/ui';

export function LenderPersonalAccess() {
  const { client, me, refreshMe } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!me?.roles.includes('LENDER')) return null;
  if (me.roles.includes('CONSUMER')) return <a href="/app" className="flex items-center gap-2 text-xs font-medium text-white/60 hover:text-white">Personal customer account</a>;
  return <Button variant="ghost" size="sm" loading={busy} onClick={async () => { setBusy(true); try { await client.request('POST', '/me/personal-account'); await refreshMe(); router.push('/app'); } finally { setBusy(false); } }}>Enable personal loan account</Button>;
}
