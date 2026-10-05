'use client';
import { useEffect, useState } from 'react';
import { Pencil, Plus, Users } from 'lucide-react';
import { bpsToPercent, EMPLOYMENT_LABELS, EmploymentStatus, formatZAR, PROVINCES, quoteLoan, type LoanOffer, type OfferInput } from '@xtra/shared';
import { Alert, Badge, Button, Card, cx, Empty, Field, Input, Loading, Modal, MoneyInput, PageHeader, Textarea, useAction, useApi, useAuth, useToast } from '@xtra/ui';
import { OfferAssistant } from '@/components/OfferAssistant';

const blank: OfferInput = {
  productType: 'BNPL',
  name: '',
  description: '',
  monthlyInterestRateBps: 300,
  termMonths: 3,
  initiationFeeCents: 5_000,
  monthlyServiceFeeCents: 2_500,
  minAmountCents: 10_000,
  maxAmountPerUserCents: 300_000,
  minMonthlyIncomeCents: 300_000,
  minCreditScore: 550,
  minAge: 18,
  maxAge: 70,
  employmentStatuses: [],
  provinces: [],
  active: true,
};

export default function OffersPage() {
  const { client } = useAuth();
  const toast = useToast();
  const offers = useApi((c) => c.lender.offers());
  const org = useApi((c) => c.lender.org());
  const [editing, setEditing] = useState<LoanOffer | 'new' | null>(null);
  const [draft, setDraft] = useState<OfferInput | null>(null);

  if (!offers.data) return <Loading />;
  const live = org.data?.accreditationStatus === 'ACCREDITED';

  return (
    <div>
      <PageHeader
        title="Offers & lending criteria"
        subtitle="Each offer is a product in your stall. Shoppers who meet every criterion see it in their XTRA-Balance."
        actions={<Button variant="secondary" onClick={() => { setDraft(null); setEditing('new'); }}><Plus className="h-4 w-4" /> Open offer form</Button>}
      />
      {!live && <div className="mb-4"><Alert tone="amber">Offers go live for shoppers once your stall is accredited.</Alert></div>}
      <OfferAssistant onManual={() => { setDraft(null); setEditing('new'); }} onReview={d => { setDraft(d); setEditing('new'); }} />
      <h2 className="mb-4 text-lg font-bold">Your offers</h2>
      {offers.data.length === 0 ? (
        <Empty title="No offers yet">Create your first offer: set pricing and who you want to lend to.</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {offers.data.map((o) => (
            <Card key={o.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 font-bold">
                    {o.name} <Badge tone={o.active ? 'green' : 'gray'}>{o.active ? 'Active' : 'Paused'}</Badge>
                    <Badge tone="blue">{o.productType === 'PERSONAL' ? 'Personal loan' : 'BNPL'}</Badge>
                  </div>
                  {o.description && <p className="mt-1 text-sm text-muted">{o.description}</p>}
                </div>
                <Button aria-label={`Edit ${o.name}`} size="sm" variant="ghost" onClick={() => { setDraft(null); setEditing(o); }}><Pencil className="h-4 w-4" /></Button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <Kv k="Interest" v={`${bpsToPercent(o.monthlyInterestRateBps)} / month`} />
                <Kv k="Term" v={`${o.termMonths} months`} />
                <Kv k="Initiation fee" v={formatZAR(o.initiationFeeCents)} />
                <Kv k="Service fee" v={`${formatZAR(o.monthlyServiceFeeCents)} / month`} />
                <Kv k="Amount" v={`${formatZAR(o.minAmountCents, { decimals: false })} – ${formatZAR(o.maxAmountPerUserCents, { decimals: false })}`} />
                <Kv k="Min income" v={formatZAR(o.minMonthlyIncomeCents, { decimals: false })} />
                <Kv k="Min credit score" v={o.minCreditScore || 'Any'} />
                <Kv k="Age" v={`${o.minAge}–${o.maxAge}`} />
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {(o.employmentStatuses.length ? o.employmentStatuses.map((e) => EMPLOYMENT_LABELS[e]) : ['Any employment']).map((x) => <Badge key={x}>{x}</Badge>)}
                {(o.provinces.length ? o.provinces : ['All provinces']).map((x) => <Badge key={x} tone="blue">{x}</Badge>)}
              </div>
              <div className="mt-4 flex justify-end">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    await client.lender.updateOffer(o.id, { active: !o.active });
                    toast(o.active ? 'Offer paused' : 'Offer activated');
                    offers.reload();
                  }}
                >
                  {o.active ? 'Pause' : 'Activate'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      {editing && (
        <OfferEditor
          offer={editing === 'new' ? null : editing}
          draft={draft}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            offers.reload();
            toast('Offer saved');
          }}
        />
      )}
    </div>
  );
}

function Kv({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-surface px-3 py-2">
      <div className="text-xs text-muted">{k}</div>
      <div className="font-medium">{v}</div>
    </div>
  );
}

function OfferEditor({ offer, draft, onClose, onSaved }: { offer: LoanOffer | null; draft: OfferInput | null; onClose: () => void; onSaved: () => void }) {
  const { client } = useAuth();
  const caps = useApi((c) => c.lender.fundingInstructions());
  const [f, setF] = useState<OfferInput>(() => offer ? { ...blank, ...offer, description: offer.description ?? '' } : draft ? { ...blank, ...draft } : { ...blank });
  const [reach, setReach] = useState<{ eligibleConsumers: number; totalConsumers: number } | null>(null);
  const num = (k: keyof OfferInput) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: Number(e.target.value) });
  const toggle = <T extends string>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  useEffect(() => {
    const t = setTimeout(() => {
      client.lender
        .previewReach({
          minMonthlyIncomeCents: f.minMonthlyIncomeCents,
          minCreditScore: f.minCreditScore,
          minAge: f.minAge,
          maxAge: f.maxAge,
          employmentStatuses: f.employmentStatuses,
          provinces: f.provinces,
        })
        .then(setReach)
        .catch(() => setReach(null));
    }, 400);
    return () => clearTimeout(t);
  }, [client, f.minMonthlyIncomeCents, f.minCreditScore, f.minAge, f.maxAge, f.employmentStatuses, f.provinces]);

  const save = useAction(async () => {
    const { id: _i, lenderId: _l, createdAt: _c, lender: _x, ...payload } = f as any;
    if (offer) await client.lender.updateOffer(offer.id, payload);
    else await client.lender.createOffer(payload);
    onSaved();
  });

  let example = null;
  try {
    example = quoteLoan(Math.max(f.minAmountCents, Math.min(100_000, f.maxAmountPerUserCents)), f);
  } catch {
    example = null;
  }

  return (
    <Modal open onClose={onClose} title={offer ? 'Edit offer' : 'New offer'}>
      <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        <Field label="Product"><select className="h-10 w-full rounded-xl border border-line px-3 text-sm" value={f.productType} onChange={e => setF({ ...f, productType: e.target.value as 'BNPL' | 'PERSONAL' })}><option value="BNPL">BNPL · card purchases</option><option value="PERSONAL">Personal loan · application & review</option></select></Field>
        <Field label="Offer name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Everyday Xtra" /></Field>
        <Field label="Description (shown to shoppers)"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <div className="text-xs font-bold uppercase tracking-wide text-muted">Pricing</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Interest % per month" hint={caps.data ? `Max ${bpsToPercent(caps.data.maxRateBps)}` : undefined}>
            <Input type="number" step="0.01" min={0} value={f.monthlyInterestRateBps / 100} onChange={(e) => setF({ ...f, monthlyInterestRateBps: Math.round(Number(e.target.value) * 100) })} />
          </Field>
          <Field label="Term (months)"><Input type="number" min={1} max={24} value={f.termMonths} onChange={num('termMonths')} /></Field>
          <Field label="Initiation fee"><MoneyInput cents={f.initiationFeeCents} onCents={(c) => setF({ ...f, initiationFeeCents: c ?? 0 })} /></Field>
          <Field label="Monthly service fee" hint={caps.data ? `Max ${formatZAR(caps.data.maxMonthlyServiceFeeCents)}` : undefined}>
            <MoneyInput cents={f.monthlyServiceFeeCents} onCents={(c) => setF({ ...f, monthlyServiceFeeCents: c ?? 0 })} />
          </Field>
          <Field label="Min amount"><MoneyInput cents={f.minAmountCents} onCents={(c) => setF({ ...f, minAmountCents: c ?? 0 })} /></Field>
          <Field label="Max per shopper"><MoneyInput cents={f.maxAmountPerUserCents} onCents={(c) => setF({ ...f, maxAmountPerUserCents: c ?? 0 })} /></Field>
        </div>
        {example && (
          <div className="rounded-xl bg-surface px-3 py-2 text-sm">
            Example: {formatZAR(example.principalCents)} → {f.termMonths} × {formatZAR(example.monthlyInstallmentCents)}, total {formatZAR(example.totalRepayableCents)} (cost of credit {formatZAR(example.costOfCreditCents)})
          </div>
        )}
        <div className="text-xs font-bold uppercase tracking-wide text-muted">Who you lend to</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Min monthly income"><MoneyInput cents={f.minMonthlyIncomeCents} onCents={(c) => setF({ ...f, minMonthlyIncomeCents: c ?? 0 })} /></Field>
          <Field label="Min credit score" hint="0 = any"><Input type="number" min={0} max={999} value={f.minCreditScore} onChange={num('minCreditScore')} /></Field>
          <Field label="Min age"><Input type="number" min={18} max={100} value={f.minAge} onChange={num('minAge')} /></Field>
          <Field label="Max age"><Input type="number" min={18} max={100} value={f.maxAge} onChange={num('maxAge')} /></Field>
        </div>
        <Field label="Employment (none selected = any)">
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(EMPLOYMENT_LABELS) as EmploymentStatus[]).map((e) => (
              <Chip key={e} on={f.employmentStatuses.includes(e)} onClick={() => setF({ ...f, employmentStatuses: toggle(f.employmentStatuses, e) })}>{EMPLOYMENT_LABELS[e]}</Chip>
            ))}
          </div>
        </Field>
        <Field label="Provinces (none selected = all)">
          <div className="flex flex-wrap gap-1.5">
            {PROVINCES.map((p) => (
              <Chip key={p} on={f.provinces.includes(p)} onClick={() => setF({ ...f, provinces: toggle(f.provinces, p) })}>{p}</Chip>
            ))}
          </div>
        </Field>
        {reach && (
          <div className="flex items-center gap-2 rounded-xl bg-brand-soft px-3 py-2 text-sm">
            <Users className="h-4 w-4" /> <b>{reach.eligibleConsumers}</b> of {reach.totalConsumers} verified shoppers match these criteria (before affordability)
          </div>
        )}
        {save.error && <Alert tone="red">{save.error}</Alert>}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active ?? true} onChange={e => setF({ ...f, active: e.target.checked })} /> Make this offer active when saved</label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button loading={save.loading} disabled={!f.name} onClick={() => save.run()}>Save offer</Button>
      </div>
    </Modal>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cx('rounded-full border px-2.5 py-1 text-xs font-medium transition', on ? 'border-ink bg-ink text-white' : 'border-line bg-white hover:border-ink/40')}>
      {children}
    </button>
  );
}
