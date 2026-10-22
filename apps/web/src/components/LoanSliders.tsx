'use client';
import { formatZAR } from '@xtra/shared';
import { Field } from '@xtra/ui';

const rangeClass = 'h-11 w-full cursor-pointer accent-brand-purple focus-visible:rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-purple';
export function LoanAmountSlider({ amount, onChange }: { amount: number | null; onChange: (cents: number) => void }) {
  return <Field label="Loan amount"><output className="block font-display text-3xl font-bold tabular-nums text-brand-purple">{formatZAR(amount ?? 100000, { decimals: (amount ?? 100000) % 100 !== 0 })}</output><input type="range" aria-label="Loan amount" aria-valuetext={formatZAR(amount ?? 100000, { decimals: (amount ?? 100000) % 100 !== 0 })} min={500} max={100000} step="any" value={(amount ?? 100000) / 100} onChange={e => onChange(Math.max(50000, Math.min(10000000, Math.round(Number(e.target.value) / 100) * 10000)))} onKeyDown={e => { const direction = ['ArrowRight', 'ArrowUp'].includes(e.key) ? 1 : ['ArrowLeft', 'ArrowDown'].includes(e.key) ? -1 : 0; if (direction) { e.preventDefault(); onChange(Math.max(50000, Math.min(10000000, (amount ?? 100000) + direction * 10000))); } }} className={rangeClass} /><span aria-hidden="true" className="flex justify-between text-xs text-muted"><span>R500</span><span>R100,000</span></span></Field>;
}
export function LoanTermSlider({ term, onChange }: { term: number; onChange: (months: number) => void }) {
  return <Field label="Loan period in months"><output className="block font-display text-3xl font-bold tabular-nums text-brand-purple">{term} {term === 1 ? 'month' : 'months'}</output><input type="range" aria-label="Loan period in months" aria-valuetext={`${term} ${term === 1 ? 'month' : 'months'}`} min={1} max={24} step={1} value={term} onChange={e => onChange(Number(e.target.value))} className={rangeClass} /><span aria-hidden="true" className="flex justify-between text-xs text-muted"><span>1 month</span><span>24 months</span></span></Field>;
}
