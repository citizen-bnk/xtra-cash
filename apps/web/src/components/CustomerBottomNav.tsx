'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Banknote, House, ScanLine } from 'lucide-react';
import { Logo, useAuth } from '@xtra/ui';

export function CustomerBottomNav({ onAssistant, onPay }: { onAssistant?: () => void; onPay?: () => void }) {
  const pathname = usePathname();
  const { me } = useAuth();
  const initials = `${me?.firstName?.[0] ?? 'X'}${me?.lastName?.[0] ?? ''}`.toUpperCase();
  const item = 'flex min-h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold';
  return <nav aria-label="Customer navigation" className="safe-pb fixed inset-x-0 bottom-0 z-40 border-t border-white/40 bg-white/95 text-[#1b1030] shadow-[0_-8px_30px_rgba(30,0,50,.28)] backdrop-blur-xl">
    <div className="mx-auto grid max-w-[520px] grid-cols-5 items-end px-1">
      <Link href="/app" aria-current={pathname === '/app' ? 'page' : undefined} className={`${item} ${pathname === '/app' ? 'text-[#5c2394]' : ''}`}><House className={`h-6 w-6 ${pathname === '/app' ? 'fill-current' : ''}`} /><span>Home</span></Link>
      <Link href="/app/loans" aria-current={pathname.startsWith('/app/loans') || pathname === '/app/personal-loan' ? 'page' : undefined} className={`${item} ${pathname.startsWith('/app/loans') || pathname === '/app/personal-loan' ? 'text-[#5c2394]' : ''}`}><Banknote className="h-6 w-6" /><span>Loans</span></Link>
      {onAssistant ? <button type="button" aria-label="Open XTRA-CASH Assistant" onClick={onAssistant} className="-mt-7 flex flex-col items-center justify-center gap-0.5"><span className="grid h-[68px] w-[68px] place-items-center rounded-full border-[4px] border-white bg-gradient-to-br from-[#5c2394] via-[#d91f63] to-[#fb9320] shadow-[0_0_18px_rgba(166,23,211,.5)]"><Logo light markOnly size={43} /></span><span className="text-[10px] font-bold text-[#5c2394]">Assistant</span></button> : <Link href="/app?assistant=1" aria-label="Open XTRA-CASH Assistant" className="-mt-7 flex flex-col items-center justify-center gap-0.5"><span className="grid h-[68px] w-[68px] place-items-center rounded-full border-[4px] border-white bg-gradient-to-br from-[#5c2394] via-[#d91f63] to-[#fb9320] shadow-[0_0_18px_rgba(166,23,211,.5)]"><Logo light markOnly size={43} /></span><span className="text-[10px] font-bold text-[#5c2394]">Assistant</span></Link>}
      {onPay ? <button type="button" onClick={onPay} className={item}><ScanLine className="h-6 w-6" /><span>Pay</span></button> : <Link href="/app?pay=1" className={item}><ScanLine className="h-6 w-6" /><span>Pay</span></Link>}
      <Link href="/app/profile" aria-current={pathname.startsWith('/app/profile') ? 'page' : undefined} className={`${item} ${pathname.startsWith('/app/profile') ? 'text-[#5c2394]' : ''}`}><span className="grid h-7 w-7 place-items-center rounded-full border-2 border-[#5c2394] text-[11px] font-bold">{initials}</span><span>Profile</span></Link>
    </div>
  </nav>;
}
