'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Loading, useAuth } from '@xtra/ui';

export default function LenderSupportHandoff() {
  const { client, refreshMe } = useAuth();
  const router = useRouter();
  const [error, setError] = useState('');
  useEffect(() => {
    const code = new URLSearchParams(window.location.hash.slice(1)).get('code');
    history.replaceState(null, '', window.location.pathname);
    if (!code) { setError('This lender support link is missing or has expired. Ask an administrator for a new link.'); return; }
    client.request('POST', '/auth/support/lender/exchange', { code }).then(async () => {
      const me = await refreshMe();
      if (!me?.roles.includes('LENDER')) { setError('This account does not have lender access.'); return; }
      router.replace('/lender');
    }).catch((e) => setError(e instanceof Error ? e.message : 'Could not open the lender workspace.'));
  }, [client, refreshMe, router]);
  return <main className="mx-auto max-w-lg p-6 pt-20">{error ? <Alert tone="red">{error}</Alert> : <div className="space-y-3 text-center"><Loading/><p>Opening the lender workspace securely…</p></div>}</main>;
}
