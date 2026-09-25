'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { EMPLOYMENT_LABELS, EmploymentStatus, formatZAR, parseSaId, PROVINCES } from '@xtra/shared';
import { Alert, Button, Card, Field, Input, MoneyInput, PageHeader, Select, StatusBadge, useAction, useAuth, useToast } from '@xtra/ui';

export default function KycPage() {
  const { me, client, refreshMe } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const k = me?.kyc;
  const [idNumber, setIdNumber] = useState(k?.idNumber ?? '');
  const [province, setProvince] = useState(k?.province ?? 'Gauteng');
  const [employment, setEmployment] = useState<EmploymentStatus>(k?.employmentStatus ?? 'EMPLOYED_FULL_TIME');
  const [employer, setEmployer] = useState(k?.employerName ?? '');
  const [income, setIncome] = useState<number | null>(k?.monthlyIncomeCents ?? null);
  const [expenses, setExpenses] = useState<number | null>(k?.monthlyExpensesCents ?? null);
  const [consent, setConsent] = useState(false);

  const id = idNumber.length === 13 ? parseSaId(idNumber) : null;
  const submit = useAction(async () => {
    const p = await client.consumer.submitKyc({
      idNumber,
      province,
      employmentStatus: employment,
      employerName: employer || undefined,
      monthlyIncomeCents: income ?? 0,
      monthlyExpensesCents: expenses ?? 0,
      consentCreditCheck: consent,
    });
    await refreshMe();
    toast(p.status === 'VERIFIED' ? 'Verified! Your XTRA-CASH card is ready.' : 'Submitted for review');
    router.push('/app');
  });

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Verify your profile" subtitle="Lenders use this to match you with offers. We never share your details without your consent." actions={k && <StatusBadge status={k.status} />} />
      <Card>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit.run();
          }}
        >
          <Field label="South African ID number" error={id && !id.valid ? id.reason : undefined} hint={id?.valid ? `Born ${id.dateOfBirth!.toLocaleDateString('en-ZA')}` : '13 digits'}>
            <Input inputMode="numeric" maxLength={13} value={idNumber} onChange={(e) => setIdNumber(e.target.value.replace(/\D/g, ''))} disabled={k?.status === 'VERIFIED'} required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Province">
              <Select value={province} onChange={(e) => setProvince(e.target.value)}>
                {PROVINCES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </Select>
            </Field>
            <Field label="Employment">
              <Select value={employment} onChange={(e) => setEmployment(e.target.value as EmploymentStatus)}>
                {Object.entries(EMPLOYMENT_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Employer / business name (optional)">
            <Input value={employer} onChange={(e) => setEmployer(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Monthly income (after tax)">
              <MoneyInput cents={income} onCents={setIncome} required />
            </Field>
            <Field label="Monthly expenses" hint="Rent, transport, food, other debt">
              <MoneyInput cents={expenses} onCents={setExpenses} required />
            </Field>
          </div>
          {income != null && expenses != null && (
            <div className="rounded-xl bg-surface px-3 py-2 text-sm">
              Money left each month: <span className="font-semibold">{formatZAR(income - expenses)}</span>
            </div>
          )}
          <label className="flex items-start gap-2 text-sm text-muted">
            <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>
              I consent to XTRA-CASH and its partner credit providers obtaining my credit report from a registered credit bureau, and confirm the information above is true (National Credit Act).
            </span>
          </label>
          {submit.error && <Alert tone="red">{submit.error}</Alert>}
          <Button className="w-full" size="lg" loading={submit.loading} disabled={!consent || !id?.valid}>
            {k ? 'Update and re-check offers' : 'Verify and see my offers'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
