'use client';
import { useEffect, useState } from 'react';
import type { PlatformSettings } from '@xtra/shared';
import { Alert, Button, Card, Field, Input, Loading, MoneyInput, PageHeader, useAction, useApi, useAuth, useToast } from '@xtra/ui';

export default function SettingsPage() {
  const { me, client } = useAuth();
  const toast = useToast();
  const settings = useApi((c) => c.admin.settings());
  const [s, setS] = useState<PlatformSettings | null>(null);
  useEffect(() => { if (settings.data) setS(settings.data); }, [settings.data]);
  const save = useAction(async () => {
    const r = await client.admin.saveSettings(s!);
    setS(r);
    toast('Settings saved');
  });
  if (!s) return <Loading />;
  const canEdit = me?.roles.includes('SUPER_ADMIN');
  const pct = (k: keyof PlatformSettings, label: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <div className="relative">
        <Input type="number" step="0.01" disabled={!canEdit} value={(s[k] as number) / 100} onChange={(e) => setS({ ...s, [k]: Math.round(Number(e.target.value) * 100) })} />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">%</span>
      </div>
    </Field>
  );
  const money = (k: keyof PlatformSettings, label: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <MoneyInput disabled={!canEdit} cents={s[k] as number} onCents={(c) => setS({ ...s, [k]: c ?? 0 })} />
    </Field>
  );
  return (
    <div className="space-y-6">
      <PageHeader title="Platform settings" subtitle="Responsible-lending guardrails, fees and commissions." actions={canEdit && <Button loading={save.loading} onClick={() => save.run()}>Save changes</Button>} />
      {!canEdit && <Alert tone="blue">Only super-admins can change platform settings.</Alert>}
      <Alert tone="amber" title="Compliance">Caps must reflect the current National Credit Act regulations. Confirm with your compliance officer before changing them.</Alert>
      {save.error && <Alert tone="red">{save.error}</Alert>}
      <Card>
        <h2 className="mb-4 font-bold">Responsible lending</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {pct('affordabilityRatioBps', 'Affordability ratio', 'Share of (income − expenses) that XTRA-CASH installments may use')}
          {pct('maxRateBps', 'Max interest per month')}
          {money('maxMonthlyServiceFeeCents', 'Max monthly service fee')}
        </div>
      </Card>
      <Card>
        <h2 className="mb-4 font-bold">Revenue</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {pct('platformShareBps', 'Platform share of repayments')}
          {money('assistedAccreditationFeeCents', 'Assisted accreditation fee')}
        </div>
        <div className="mt-4">
          <Field label="Platform bank details (shown to lenders loading funds)">
            <Input disabled={!canEdit} value={s.platformBankDetails} onChange={(e) => setS({ ...s, platformBankDetails: e.target.value })} />
          </Field>
        </div>
      </Card>
      <Card>
        <h2 className="mb-4 font-bold">Affiliate commissions</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {money('commissionConsumerActivationCents', 'Per shopper verified')}
          {money('commissionLenderAccreditedCents', 'Per lender accredited')}
          {pct('commissionLoanOriginationBps', 'Share of credit used')}
          {money('minPayoutCents', 'Minimum payout')}
        </div>
      </Card>
    </div>
  );
}
