'use client';
import React, { useEffect, useState } from 'react';
import { Fingerprint } from 'lucide-react';
import { Alert, Button, Card } from './components';
import { useApi, useAuth } from './api';

function bytes(value: string): ArrayBuffer {
  const decoded = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(decoded, c => c.charCodeAt(0)).buffer;
}
function encoded(value: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function PasskeyButton({ register = false, onSuccess }: { register?: boolean; onSuccess?: () => void | Promise<void> }) {
  const { client, refreshMe } = useAuth();
  const [supported, setSupported] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { setSupported(!!window.PublicKeyCredential && window.isSecureContext); }, []);
  async function run() {
    setBusy(true); setError('');
    try {
      const route = '/auth/passkeys/' + (register ? 'register' : 'login');
      const request = await client.request<{ options: any; challengeId: string; binding: string }>('POST', route + '/options', { origin: location.origin });
      const o = request.options;
      const options = { ...o, challenge: bytes(o.challenge) };
      let credential: PublicKeyCredential | null;
      if (register) {
        options.user = { ...o.user, id: bytes(o.user.id) };
        options.excludeCredentials = o.excludeCredentials?.map((x: any) => ({ ...x, id: bytes(x.id) }));
        credential = await navigator.credentials.create({ publicKey: options }) as PublicKeyCredential | null;
      } else {
        options.allowCredentials = o.allowCredentials?.map((x: any) => ({ ...x, id: bytes(x.id) }));
        credential = await navigator.credentials.get({ publicKey: options }) as PublicKeyCredential | null;
      }
      if (!credential) throw new Error('Unlock was cancelled. Try again or use your password.');
      const common = { id: credential.id, rawId: encoded(credential.rawId), type: credential.type, clientExtensionResults: credential.getClientExtensionResults(), authenticatorAttachment: credential.authenticatorAttachment };
      const r = credential.response;
      const response = register ? { ...common, response: { clientDataJSON: encoded(r.clientDataJSON), attestationObject: encoded((r as AuthenticatorAttestationResponse).attestationObject), transports: (r as AuthenticatorAttestationResponse).getTransports?.() ?? [] } } : { ...common, response: { clientDataJSON: encoded(r.clientDataJSON), authenticatorData: encoded((r as AuthenticatorAssertionResponse).authenticatorData), signature: encoded((r as AuthenticatorAssertionResponse).signature), userHandle: (r as AuthenticatorAssertionResponse).userHandle ? encoded((r as AuthenticatorAssertionResponse).userHandle!) : null } };
      await client.request('POST', route + '/verify', { origin: location.origin, challengeId: request.challengeId, binding: request.binding, response });
      if (onSuccess) await onSuccess(); else await refreshMe();
    } catch (e) {
      setError(e instanceof Error && e.name === 'NotAllowedError' ? 'Unlock was cancelled or no passkey is available. Try your password instead.' : e instanceof Error ? e.message : 'Could not use your passkey.');
    } finally { setBusy(false); }
  }
  return <div className="space-y-3"><Button type="button" className="w-full" size="lg" disabled={!supported} loading={busy} onClick={run}><Fingerprint className="h-5 w-5" />{register ? 'Enable quick unlock' : 'Unlock XTRA-CASH'}</Button><p className="text-center text-xs text-muted">{supported ? 'Use your fingerprint, face or device PIN.' : 'Use a passkey-compatible browser to enable quick unlock.'}</p>{error && <Alert tone="red">{error}</Alert>}</div>;
}

type Key = { id: string; name: string; rpId: string; createdAt: string };
type Session = { id: string; authenticatedAt: string; current: boolean };
export function SecuritySettings({ compact = false }: { compact?: boolean }) {
  const { client } = useAuth();
  const keys = useApi(c => c.request<Key[]>('GET', '/auth/passkeys'));
  const sessions = useApi(c => c.request<Session[]>('GET', '/auth/sessions'));
  const [error, setError] = useState('');
  async function remove(path: string) { try { setError(''); await client.request('DELETE', path); await keys.reload(); await sessions.reload(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not update security'); } }
  if (compact && (keys.loading || keys.error || keys.data?.some(k => k.rpId === location.hostname))) return null;
  return <Card className="space-y-4"><div><h2 className="text-lg font-bold">{compact ? 'Next time, just unlock.' : 'Sign-in & security'}</h2><p className="mt-1 text-sm text-muted">Enable a passkey on your own device. Keep your password as a backup. Biometrics stay on your device.</p></div><PasskeyButton register onSuccess={async () => { await keys.reload(); }} />{!compact && <><div className="space-y-2">{keys.data?.map(k => <div key={k.id} className="flex items-center justify-between gap-3 border-t border-line pt-3 text-sm"><span>{k.name}<span className="block text-xs text-muted">{k.rpId}</span></span><Button variant="ghost" size="sm" onClick={() => remove('/auth/passkeys/' + encodeURIComponent(k.id))}>Remove</Button></div>)}</div><h3 className="font-semibold">Active sessions</h3>{sessions.data?.map(s => <div key={s.id} className="flex justify-between gap-3 text-sm"><span>{s.current ? 'This session' : 'Other session'} · {new Date(s.authenticatedAt).toLocaleString()}</span>{!s.current && <Button variant="ghost" size="sm" onClick={() => remove('/auth/sessions/' + s.id)}>Sign out</Button>}</div>)}</>}{(error || keys.error || sessions.error) && <Alert tone="red">{error || keys.error || sessions.error}</Alert>}</Card>;
}
