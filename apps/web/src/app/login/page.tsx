'use client';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Button, Card, DemoAccounts, Field, Input, useAction, useAuth } from '@xtra/ui';
import { AuthPageShell } from '@/components/AuthPageShell';
import { ADMIN_URL, homeFor } from '@/lib/config';

function LoginForm() {
  const { client, refreshMe } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get('next');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [staff, setStaff] = useState(false);
  const { run, loading, error } = useAction(async () => {
    const r = await client.auth.login(identifier, password);
    if (r.user.roles.some((x) => x === 'ADMIN' || x === 'SUPER_ADMIN') && !r.user.roles.some((x) => ['CONSUMER', 'LENDER', 'AFFILIATE'].includes(x))) {
      await client.auth.logout();
      setStaff(true);
      return;
    }
    const me = await refreshMe();
    router.replace(next && next.startsWith('/') ? next : homeFor(me ?? r.user));
  });

  return (
    <Card className="w-full max-w-sm shrink-0 p-6">
      <h1 className="text-xl font-bold">Welcome back</h1>
      <p className="mt-1 text-sm text-muted">Sign in with your email or mobile number.</p>
      <form
        className="mt-5 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <Field label="Email or mobile number">
          <Input autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
        </Field>
        <Field label="Password">
          <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Field>
        {error && <Alert tone="red">{error}</Alert>}
        {staff && (
          <Alert tone="blue">
            Staff accounts sign in to the <a className="font-semibold underline" href={ADMIN_URL}>back office</a>.
          </Alert>
        )}
        <Button className="w-full" loading={loading}>
          Sign in
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-muted">
        New to XTRA-CASH?{' '}
        <Link href="/register" className="font-semibold text-ink underline">
          Create an account
        </Link>
      </p>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <AuthPageShell currentPath="/login">
      <Suspense>
        <LoginArea />
      </Suspense>
    </AuthPageShell>
  );
}

function LoginArea() {
  const { refreshMe } = useAuth();
  const router = useRouter();
  return (
    <div className="flex w-full max-w-5xl flex-col items-center gap-6 lg:flex-row lg:items-start lg:justify-center">
      <LoginForm />
      <DemoAccounts
        app="web"
        className="max-w-sm sm:max-w-xl lg:max-w-2xl"
        onSignedIn={async (r) => {
          const me = await refreshMe();
          router.replace(homeFor(me ?? r.user));
        }}
        footer={
          <>
            XTRA-CASH staff?{' '}
            <a className="font-semibold text-ink underline" href={`${ADMIN_URL}/login`}>
              Try the back-office demo
            </a>
          </>
        }
      />
    </div>
  );
}
