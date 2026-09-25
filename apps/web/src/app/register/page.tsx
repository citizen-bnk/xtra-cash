'use client';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Landmark, ShoppingBag, Users } from 'lucide-react';
import { Alert, Button, Card, cx, Field, Input, Logo, useAction, useAuth } from '@xtra/ui';
import { homeFor } from '@/lib/config';

type AccountType = 'CONSUMER' | 'LENDER' | 'AFFILIATE';
const TYPES: { value: AccountType; label: string; text: string; icon: typeof Users }[] = [
  { value: 'CONSUMER', label: 'Shopper', text: 'Get the XTRA-CASH card', icon: ShoppingBag },
  { value: 'LENDER', label: 'Micro-lender', text: 'Open a Credit Mall stall', icon: Landmark },
  { value: 'AFFILIATE', label: 'Affiliate', text: 'Earn by onboarding others', icon: Users },
];

function RegisterForm() {
  const params = useSearchParams();
  const router = useRouter();
  const { client, refreshMe } = useAuth();
  const initial = (params.get('type') as AccountType) || 'CONSUMER';
  const [type, setType] = useState<AccountType>(TYPES.some((t) => t.value === initial) ? initial : 'CONSUMER');
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '', lenderName: '', referralCode: params.get('ref') ?? '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const [agree, setAgree] = useState(false);

  const { run, loading, error } = useAction(async () => {
    const r = await client.auth.register({
      ...f,
      accountType: type,
      referralCode: f.referralCode || undefined,
      lenderName: type === 'LENDER' ? f.lenderName : undefined,
    });
    const me = await refreshMe();
    const home = homeFor(me ?? r.user);
    router.replace(type === 'CONSUMER' ? '/app/kyc' : home);
  });

  return (
    <Card className="w-full max-w-lg p-6">
      <h1 className="text-xl font-bold">Create your XTRA-CASH account</h1>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {TYPES.map((t) => (
          <button
            type="button"
            key={t.value}
            onClick={() => setType(t.value)}
            className={cx(
              'rounded-xl border p-3 text-left transition',
              type === t.value ? 'border-ink bg-ink text-white' : 'border-line hover:border-ink/40',
            )}
          >
            <t.icon className={cx('h-5 w-5', type === t.value ? 'text-lime' : 'text-muted')} />
            <div className="mt-2 text-sm font-semibold">{t.label}</div>
            <div className={cx('text-xs', type === t.value ? 'text-white/70' : 'text-muted')}>{t.text}</div>
          </button>
        ))}
      </div>
      <form
        className="mt-5 grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <Field label="First name">
          <Input value={f.firstName} onChange={set('firstName')} required autoComplete="given-name" />
        </Field>
        <Field label="Surname">
          <Input value={f.lastName} onChange={set('lastName')} required autoComplete="family-name" />
        </Field>
        {type === 'LENDER' && (
          <div className="sm:col-span-2">
            <Field label="Registered business name">
              <Input value={f.lenderName} onChange={set('lenderName')} required />
            </Field>
          </div>
        )}
        <Field label="Email">
          <Input type="email" value={f.email} onChange={set('email')} required autoComplete="email" />
        </Field>
        <Field label="Mobile number" hint="e.g. 082 123 4567">
          <Input type="tel" value={f.phone} onChange={set('phone')} required autoComplete="tel" />
        </Field>
        <Field label="Password" hint="At least 8 characters">
          <Input type="password" value={f.password} onChange={set('password')} required minLength={8} autoComplete="new-password" />
        </Field>
        <Field label="Referral code (optional)">
          <Input value={f.referralCode} onChange={set('referralCode')} placeholder="XC…" />
        </Field>
        <label className="flex items-start gap-2 text-sm text-muted sm:col-span-2">
          <input type="checkbox" className="mt-1" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>I agree to the Terms of Use and consent to XTRA-CASH processing my personal information in line with POPIA.</span>
        </label>
        {error && (
          <div className="sm:col-span-2">
            <Alert tone="red">{error}</Alert>
          </div>
        )}
        <Button className="sm:col-span-2" loading={loading} disabled={!agree}>
          Create account
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-muted">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-ink underline">
          Sign in
        </Link>
      </p>
    </Card>
  );
}

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-10">
      <Link href="/">
        <Logo className="text-xl" />
      </Link>
      <Suspense>
        <RegisterForm />
      </Suspense>
    </div>
  );
}
