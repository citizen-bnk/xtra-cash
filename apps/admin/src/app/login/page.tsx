'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { Alert, Button, Card, DemoAccounts, Field, Input, Logo, useAction, useAuth } from '@xtra/ui';

export default function AdminLogin() {
  const { client, refreshMe } = useAuth();
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const { run, loading, error, setError } = useAction(async () => {
    const r = await client.auth.login(identifier, password);
    if (!r.user.roles.some((x) => x === 'ADMIN' || x === 'SUPER_ADMIN')) {
      await client.auth.logout();
      setError('This account does not have back-office access.');
      return;
    }
    await refreshMe();
    router.replace('/');
  });
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink px-4 py-10">
      <div className="flex w-full max-w-4xl flex-col items-center gap-6 lg:flex-row lg:items-start lg:justify-center">
        <Card className="w-full max-w-sm shrink-0 p-6">
          <Logo size={36} className="text-lg" />
          <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
            <ShieldCheck className="h-3.5 w-3.5" /> Back office
          </div>
          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              run();
            }}
          >
            <Field label="Staff email">
              <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required />
            </Field>
            <Field label="Password">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </Field>
            {error && <Alert tone="red">{error}</Alert>}
            <Button className="w-full" loading={loading}>Sign in</Button>
          </form>
          <p className="mt-4 text-xs text-muted">All actions in the back office are recorded in the audit log.</p>
        </Card>
        <DemoAccounts
          app="admin"
          className="max-w-sm sm:max-w-xl"
          onSignedIn={async () => {
            await refreshMe();
            router.replace('/');
          }}
        />
      </div>
    </div>
  );
}
