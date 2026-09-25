'use client';
import { bpsToPercent, EMPLOYMENT_LABELS, formatZAR } from '@xtra/shared';
import { Badge, Button, Loading, PageHeader, Table, useApi, useAuth, useToast } from '@xtra/ui';

export default function OffersPage() {
  const { client } = useAuth();
  const toast = useToast();
  const offers = useApi((c) => c.admin.offers());
  if (!offers.data) return <Loading />;
  return (
    <div>
      <PageHeader title="Loan offers" subtitle="Every product listed in the Credit Mall. Disable an offer to stop it matching shoppers immediately." />
      <Table
        rows={offers.data}
        empty="No offers"
        columns={[
          { header: 'Offer', cell: (o) => <div><div className="font-medium">{o.name}</div><div className="text-xs text-muted">{o.lender?.name}</div></div> },
          { header: 'Price', cell: (o) => `${bpsToPercent(o.monthlyInterestRateBps)} p/m · ${o.termMonths}m` },
          { header: 'Fees', cell: (o) => `${formatZAR(o.initiationFeeCents)} + ${formatZAR(o.monthlyServiceFeeCents)}/m` },
          { header: 'Amount', cell: (o) => `${formatZAR(o.minAmountCents, { decimals: false })}–${formatZAR(o.maxAmountPerUserCents, { decimals: false })}` },
          { header: 'Criteria', cell: (o) => <span className="text-xs text-muted">≥{formatZAR(o.minMonthlyIncomeCents, { decimals: false })} · score ≥{o.minCreditScore} · {o.minAge}–{o.maxAge}y · {o.employmentStatuses.length ? o.employmentStatuses.map((e) => EMPLOYMENT_LABELS[e]).join(', ') : 'any job'} · {o.provinces.length ? o.provinces.join(', ') : 'all SA'}</span> },
          { header: 'Status', cell: (o) => <Badge tone={o.active ? 'green' : 'gray'}>{o.active ? 'Active' : 'Disabled'}</Badge> },
          {
            header: '',
            cell: (o) => (
              <Button size="sm" variant="secondary" onClick={async () => { await client.admin.setOfferActive(o.id, !o.active); toast(o.active ? 'Offer disabled' : 'Offer enabled'); offers.reload(); }}>
                {o.active ? 'Disable' : 'Enable'}
              </Button>
            ),
          },
        ]}
      />
    </div>
  );
}
