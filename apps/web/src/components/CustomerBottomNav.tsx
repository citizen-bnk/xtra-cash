'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Banknote, Ellipsis, House, ScanLine, X } from 'lucide-react';
import { Logo, useAuth } from '@xtra/ui';

export const moreLinks = [
  { label: 'My wallet', href: '/app/wallet' },
  { label: 'My card', href: '/app/card' },
  { label: 'Transactions', href: '/app/activity' },
  { label: 'Pay bills', href: '/app/bills' },
  { label: 'Shop now, pay later', href: '/app/bnpl' },
  { label: 'Vouchers', href: '/app/vouchers' },
  { label: 'My profile', href: '/app/profile' },
];

export function CustomerMoreMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me } = useAuth();
  if (!open) return null;
  return <div className="fixed inset-0 z-50 bg-[#1b1030]/55" onClick={onClose}><section role="dialog" aria-modal="true" aria-label="More services" onClick={event => event.stopPropagation()} className="safe-pb absolute inset-x-0 bottom-0 mx-auto max-w-[520px] rounded-t-[28px] bg-white p-5 text-[#1b1030] shadow-2xl"><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-black">More services</h2><button type="button" aria-label="Close menu" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-[#f3e7f8]"><X className="h-5 w-5" /></button></div><div className="grid max-h-[60dvh] grid-cols-2 gap-2 overflow-y-auto">{moreLinks.map(link => <Link key={link.href} href={link.href} onClick={onClose} className="rounded-xl border border-purple-100 bg-[#faf6fd] p-3 text-sm font-bold text-[#5c2394]">{link.label}</Link>)}{me?.roles.some(role => role === 'ADMIN' || role === 'SUPER_ADMIN') && <Link href="https://xtra-cash-admin.vercel.app" onClick={onClose} className="rounded-xl border border-purple-100 bg-[#faf6fd] p-3 text-sm font-bold text-[#5c2394]">Open Back Office</Link>}</div></section></div>;
}

export function CustomerBottomNav({ onAssistant }: { onAssistant?: () => void }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const item = 'flex min-h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold';
  return <><nav aria-label="Customer navigation" className="safe-pb fixed inset-x-0 bottom-0 z-40 border-t border-white/40 bg-white/95 text-[#1b1030] shadow-[0_-8px_30px_rgba(30,0,50,.28)] backdrop-blur-xl">
    <div className="mx-auto grid max-w-[520px] grid-cols-5 items-end px-1">
      <Link href="/app" aria-current={pathname === '/app' ? 'page' : undefined} className={`${item} ${pathname === '/app' ? 'text-[#5c2394]' : ''}`}><House className={`h-6 w-6 ${pathname === '/app' ? 'fill-current' : ''}`} /><span>Home</span></Link>
      <Link href="/app/loans" aria-current={pathname.startsWith('/app/loans') || pathname === '/app/personal-loan' ? 'page' : undefined} className={`${item} ${pathname.startsWith('/app/loans') || pathname === '/app/personal-loan' ? 'text-[#5c2394]' : ''}`}><Banknote className="h-6 w-6" /><span>Loans</span></Link>
      {onAssistant ? <button type="button" aria-label="Open XTRA-CASH Assistant" onClick={onAssistant} className="-mt-7 flex flex-col items-center justify-center gap-0.5"><span className="grid h-[68px] w-[68px] place-items-center rounded-full border-[4px] border-white bg-gradient-to-br from-[#5c2394] via-[#d91f63] to-[#fb9320] shadow-[0_0_18px_rgba(166,23,211,.5)]"><Logo light markOnly size={43} /></span><span className="text-[10px] font-bold text-[#5c2394]">Assistant</span></button> : <Link href="/app?assistant=1" aria-label="Open XTRA-CASH Assistant" className="-mt-7 flex flex-col items-center justify-center gap-0.5"><span className="grid h-[68px] w-[68px] place-items-center rounded-full border-[4px] border-white bg-gradient-to-br from-[#5c2394] via-[#d91f63] to-[#fb9320] shadow-[0_0_18px_rgba(166,23,211,.5)]"><Logo light markOnly size={43} /></span><span className="text-[10px] font-bold text-[#5c2394]">Assistant</span></Link>}
      <Link href="/app/pay" aria-current={pathname === '/app/pay' ? 'page' : undefined} className={`${item} ${pathname === '/app/pay' ? 'text-[#5c2394]' : ''}`}><ScanLine className="h-6 w-6" /><span>Pay</span></Link>
      <button type="button" aria-label="More services" aria-expanded={moreOpen} onClick={() => setMoreOpen(true)} className={`${item} ${moreOpen || moreLinks.some(link => pathname === link.href) ? 'text-[#5c2394]' : ''}`}><Ellipsis className="h-7 w-7" /><span>More</span></button>
    </div>
  </nav><CustomerMoreMenu open={moreOpen} onClose={() => setMoreOpen(false)} /></>;
}
