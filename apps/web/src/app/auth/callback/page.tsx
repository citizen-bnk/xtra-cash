'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Loading, useAuth } from '@xtra/ui';
import { AuthPageShell } from '@/components/AuthPageShell';
import { homeFor } from '@/lib/config';
export default function AuthCallback() {
  const { client, refreshMe } = useAuth(), router = useRouter(), started = useRef(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (started.current) return; started.current = true;
    const params = new URLSearchParams(window.location.hash.slice(1) || window.location.search);
    const state = params.get('state'), code = params.get('code');
    window.history.replaceState(null, '', '/auth/callback');
    if (params.has('error') || !state || !code) { setError('Sign-in was cancelled or did not complete. Please start again.'); return; }
    const binding = sessionStorage.getItem('xtra-sign-in-' + state); sessionStorage.removeItem('xtra-sign-in-' + state);
    if (!binding) { setError('This sign-in session does not belong to this browser. Please start again.'); return; }
    client.auth.finishSocial({ state, binding, code }).then(async () => { const me = await refreshMe(); if (me) router.replace(me.profileComplete === false ? '/welcome' : homeFor(me)); else setError('Could not load your account. Please sign in again.'); }).catch(e => setError(e instanceof Error ? e.message : 'Could not complete sign-in'));
  }, [client, refreshMe, router]);
  return <AuthPageShell currentPath="/login">{error ? <div className="max-w-lg"><Alert tone="red">{error}</Alert><Link className="mt-4 block font-semibold underline" href="/register">Start sign-in again</Link></div> : <Loading />}</AuthPageShell>;
}
