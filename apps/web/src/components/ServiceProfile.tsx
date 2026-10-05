'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Alert, Button, Card, Field, Input, useAuth } from '@xtra/ui';
/** Names are requested in place, only when entering a service that needs them. */
export function ServiceProfile({ afterSave }: { afterSave?: () => Promise<void> } = {}) {
  const { me, client, refreshMe } = useAuth();
  const [firstName, setFirstName] = useState(me?.firstName ?? ''), [lastName, setLastName] = useState(me?.lastName ?? ''), [lenderName, setLenderName] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function save() {
    setBusy(true); setError('');
    try { await client.request('PUT', '/auth/passwordless/profile', { firstName, lastName, ...(me?.roles.includes('LENDER') ? { lenderName } : {}) }); await refreshMe(); await afterSave?.(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not save your name'); } finally { setBusy(false); }
  }
  return <div className="mx-auto max-w-md p-4 py-12"><Card className="space-y-5"><div><p className="text-xs font-bold uppercase text-brand">One detail before you continue</p><h1 className="mt-2 text-2xl font-bold">What should we call you?</h1><p className="mt-2 text-sm text-muted">Use the names on your identity document. We will reuse them across your services.</p></div><form className="space-y-4" onSubmit={e => { e.preventDefault(); save(); }}><Field label="First name"><Input required autoFocus autoComplete="given-name" maxLength={80} value={firstName} onChange={e => setFirstName(e.target.value)} /></Field><Field label="Surname"><Input required autoComplete="family-name" maxLength={80} value={lastName} onChange={e => setLastName(e.target.value)} /></Field>{me?.roles.includes('LENDER') && <Field label="Business name"><Input required minLength={2} maxLength={120} autoComplete="organization" value={lenderName} onChange={e => setLenderName(e.target.value)} /></Field>}{error && <Alert tone="red">{error}</Alert>}<Button className="w-full" loading={busy}>Save & continue</Button></form><Link href={me?.roles.includes('LENDER') ? '/lender' : me?.roles.includes('AFFILIATE') ? '/affiliate' : '/app'} className="block text-center text-sm underline">Back to my dashboard</Link></Card></div>;
}
