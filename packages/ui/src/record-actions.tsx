'use client';
import { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';

export type RecordAction = { label: string; href?: string; onSelect?: () => void; disabled?: boolean };
export function RecordActions({ actions, label = 'Record actions' }: { actions: RecordAction[]; label?: string }) {
  const [open, setOpen] = useState(false);
  return <div className="relative inline-block text-left" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
    <button type="button" aria-label={label} aria-expanded={open} onClick={() => setOpen(!open)} className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-white hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-purple"><MoreHorizontal className="h-5 w-5" /></button>
    {open && <div role="menu" className="absolute right-0 z-40 mt-1 min-w-44 rounded-xl border border-line bg-white p-1 shadow-xl">{actions.map((action) => action.href ? <a key={action.label} role="menuitem" href={action.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm hover:bg-surface">{action.label}</a> : <button key={action.label} type="button" role="menuitem" disabled={action.disabled} onClick={() => { setOpen(false); action.onSelect?.(); }} className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-surface disabled:opacity-40">{action.label}</button>)}</div>}
  </div>;
}
