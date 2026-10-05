'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, Field, Input, Logo, PasskeyButton, useAuth } from '@xtra/ui';
export default function AdminLogin() {
  const { client, refreshMe } = useAuth(), router = useRouter();
  const [identifier, setIdentifier] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function finish() {
    const me = await refreshMe();
    if (!me?.roles.some(r => r === 'ADMIN' || r === 'SUPER_ADMIN')) { await client.auth.logout(); setError('This account does not have back-office access.'); return; }
    router.replace('/');
  }
  async function login() {
    setBusy(true); setError('');
    try { await client.auth.login(identifier, password); await finish(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not sign in.'); } finally { setBusy(false); }
  }
  return <div className="flex min-h-screen items-center justify-center bg-ink px-4 py-10"><Card className="w-full max-w-md p-8"><Logo /><p className="mt-2 text-xs font-bold uppercase text-muted">XTRA-CASH back office</p><h1 className="mt-5 text-2xl font-bold">Welcome back</h1><div className="mt-5"><PasskeyButton onSuccess={finish} /></div><form className="mt-6 space-y-4" onSubmit={e => { e.preventDefault(); login(); }}><p className="text-center text-xs text-muted">Or use your staff password</p><Field label="Staff email"><Input value={identifier} onChange={e => setIdentifier(e.target.value)} autoComplete="username" required /></Field><Field label="Password"><Input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required /></Field>{error && <Alert tone="red">{error}</Alert>}<Button className="w-full" loading={busy}>Sign in</Button></form><p className="mt-5 text-xs text-muted">Sign in with your password once, then enable a passkey in Sign-in & security.</p><a className="mt-4 block text-center text-sm underline" href="https://web-tawny-three-22.vercel.app/">XTRA-CASH home</a></Card></div>;
}
