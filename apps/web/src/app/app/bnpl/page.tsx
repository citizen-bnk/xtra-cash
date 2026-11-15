'use client';

import Link from 'next/link';
import { formatZAR } from '@xtra/shared';
import { Alert, Card, Loading, useApi } from '@xtra/ui';

export default function BnplPage() {
  const balance = useApi(client => client.consumer.balance());
  if (balance.error) return <Alert tone="red">{balance.error}</Alert>;
  if (!balance.data) return <Loading />;
  const offers = balance.data.offers.filter(offer => offer.availableCents > 0);
  return <main className="mx-auto w-full max-w-3xl space-y-4 pb-5">
    <Link href="/app" className="text-sm font-semibold text-purple-800">Back</Link>
    <header className="rounded-3xl bg-gradient-to-br from-[#1b1030] via-[#5c2394] to-[#d91f63] p-5 text-white">
      <h1 className="text-xl font-bold text-white">Shop now, pay later</h1>
      <p className="mt-4 text-sm">Available purchase credit</p>
      <strong className="text-3xl">{formatZAR(balance.data.creditCents)}</strong>
    </header>
    {offers.length === 0 && <Card><p className="text-sm text-ink">{balance.data.reasonIfNone ?? 'No eligible offers are available yet.'}</p><Link href="/app/profile" className="mt-3 inline-flex text-sm font-bold text-purple-800">View profile</Link></Card>}
    {offers.map(offer => <Card key={offer.offerId}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0"><h2 className="break-words font-bold text-ink">{offer.offerName}</h2><p className="text-sm text-ink">{offer.lenderName}</p></div>
        <strong className="text-purple-800">{formatZAR(offer.availableCents)}</strong>
      </div>
      <p className="mt-2 text-sm text-ink">{offer.termMonths} months · {(offer.monthlyInterestRateBps / 100).toFixed(2)}% monthly interest</p>
      <details className="mt-2 text-sm text-ink">
        <summary className="cursor-pointer font-semibold text-purple-800">Fees and repayment</summary>
        <p className="mt-2">Initiation fee {formatZAR(offer.initiationFeeCents)} · Service fee {formatZAR(offer.monthlyServiceFeeCents)} per month</p>
        {offer.exampleQuote && <p className="mt-1">{formatZAR(offer.exampleQuote.principalCents)} example · {formatZAR(offer.exampleQuote.monthlyInstallmentCents)} monthly · {formatZAR(offer.exampleQuote.totalRepayableCents)} total</p>}
      </details>
    </Card>)}
    {offers.length > 0 && <Link href="/app/card" className="block rounded-2xl bg-purple-800 p-4 text-center font-bold text-white">View my card</Link>}
  </main>;
}
