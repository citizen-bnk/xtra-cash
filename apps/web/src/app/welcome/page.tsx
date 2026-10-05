'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, Field, Input, Loading, useAuth } from '@xtra/ui';
import { AuthPageShell } from '@/components/AuthPageShell';
import { homeFor } from '@/lib/config';
export default function WelcomePage() {
  const { me, client, loading, refreshMe } = useAuth(), router = useRouter();
  const [step, setStep] = useState(0), [firstName, setFirstName] = useState(''), [lastName, setLastName] = useState(''), [lenderName, setLenderName] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  useEffect(() => { if (loading) return; if (!me) router.replace('/login'); else if (me.profileComplete !== false) router.replace(homeFor(me)); else { setFirstName(me.firstName); setLastName(me.lastName); } }, [loading, me, router]);
  async function next() {
    if (!(step === 0 ? firstName : step === 1 ? lastName : lenderName).trim()) { setError('Please enter this detail.'); return; }
    setError(null); if (step < (me?.roles.includes('LENDER') ? 2 : 1)) { setStep(s => s + 1); return; }
    setBusy(true); try { await client.request('PUT', '/auth/passwordless/profile', { firstName, lastName, ...(me?.roles.includes('LENDER') ? { lenderName } : {}) }); const updated = await refreshMe(); if (updated) router.replace(homeFor(updated)); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save your profile'); } finally { setBusy(false); }
  }
  if (loading || !me) return <Loading />;
  return <AuthPageShell currentPath="/register"><Card className="w-full max-w-lg p-8"><p className="text-sm text-muted">Before you start using XTRA-CASH</p><h1 className="mt-3 text-2xl font-bold">{step === 0 ? 'What is your first name?' : step === 1 ? 'And your surname?' : 'What is your lending business called?'}</h1><form className="mt-6 space-y-4" onSubmit={e => { e.preventDefault(); next(); }}><Field label={step === 0 ? 'First name' : step === 1 ? 'Surname' : 'Business name'}><Input key={step} autoFocus maxLength={step === 2 ? 120 : 80} value={step === 0 ? firstName : step === 1 ? lastName : lenderName} onChange={e => (step === 0 ? setFirstName : step === 1 ? setLastName : setLenderName)(e.target.value)} /></Field>{error && <Alert tone="red">{error}</Alert>}<div className="flex justify-between gap-3"><Button type="button" variant="ghost" disabled={step === 0 || busy} onClick={() => setStep(s => s - 1)}>Back</Button><Button loading={busy}>{step < (me.roles.includes('LENDER') ? 2 : 1) ? 'Continue' : 'Start using XTRA-CASH'}</Button></div></form></Card></AuthPageShell>;
}
