'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeftRight, Banknote, Building2, ChevronRight, CreditCard, Ellipsis, Gift, House, LogOut, ReceiptText, ScanLine, ShieldCheck, ShoppingBag, UserRound, Wallet, X } from 'lucide-react';
import { ADMIN_URL } from '@/lib/config';
import { Logo, useAuth } from '@xtra/ui';

export const moreLinks = [
  { label: 'My wallet', icon: Wallet, href: '/app/wallet' },
  { label: 'My card', icon: CreditCard, href: '/app/card' },
  { label: 'My guarantees', icon: ShieldCheck, href: '/app/guarantees' },
  { label: 'Transactions', icon: ArrowLeftRight, href: '/app/activity' },
  { label: 'Pay bills', icon: ReceiptText, href: '/app/bills' },
  { label: 'Shop now, pay later', icon: ShoppingBag, href: '/app/bnpl' },
  { label: 'Vouchers', icon: Gift, href: '/app/vouchers' },
  { label: 'My profile', icon: UserRound, href: '/app/profile' },
];

export function CustomerMoreMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);
  async function signOut() {
    setSigningOut(true);
    try {
      await logout();
      onClose();
      router.replace('/login');
    } finally {
      setSigningOut(false);
    }
  }
  if (!open) return null;
  return <div className="fixed inset-0 z-50 bg-[#1b1030]/55" onClick={onClose}>
    <section role="dialog" aria-modal="true" aria-label="More services" onClick={event => event.stopPropagation()} className="safe-pb absolute inset-x-0 bottom-0 mx-auto max-w-[520px] rounded-t-[28px] bg-white p-5 text-[#1b1030] shadow-2xl">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-black">More services</h2>
        <button type="button" aria-label="Close menu" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-[#f3e7f8]"><X className="h-5 w-5" /></button>
      </div>
      <nav aria-label="More services" className="grid max-h-[min(60dvh,28rem)] gap-2.5 overflow-y-auto overscroll-contain px-1 py-1">
        {[...moreLinks, ...(me?.roles.some(role => role === 'ADMIN' || role === 'SUPER_ADMIN')
          ? [{ label: 'Open back office', href: ADMIN_URL, icon: Building2 }] : [])].map(({ label, href, icon: Icon }) => {
          const current = pathname === href;
          return <Link key={href} href={href} onClick={onClose} aria-current={current ? 'page' : undefined}
            className={`flex min-h-14 items-center gap-3 rounded-2xl border px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-700 ${current ? 'border-purple-300 bg-purple-100' : 'border-purple-100 bg-[#fcf8ff] hover:bg-purple-50'}`}>
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#efe2fb] text-[#65249a]"><Icon size={19} aria-hidden /></span>
            <span className="min-w-0 flex-1 text-sm font-bold text-[#371852]">{label}</span>
            <ChevronRight size={16} className="shrink-0 text-[#793bb1]" aria-hidden />
          </Link>;
        })}
      </nav>
      {me && <button type="button" disabled={signingOut} onClick={() => void signOut()} className="mt-4 flex min-h-14 w-full items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 text-sm font-bold text-rose-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-700">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-rose-100"><LogOut size={19} aria-hidden /></span> {signingOut ? 'Signing out…' : 'Sign out'}
      </button>}
    </section>
  </div>;
}

export function CustomerBottomNav() {
  const pathname = usePathname();
  const payActive = pathname === '/app/pay' || pathname === '/scanqr';
  const [moreOpen, setMoreOpen] = useState(false);
  const item = 'flex min-h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold';
  return <><nav aria-label="Customer navigation" className="safe-pb fixed inset-x-0 bottom-0 z-40 border-t border-white/40 bg-white/95 text-[#1b1030] shadow-[0_-8px_30px_rgba(30,0,50,.28)] backdrop-blur-xl">
    <div className="mx-auto grid max-w-[520px] grid-cols-5 items-end px-1">
      <Link href="/app" aria-current={pathname === '/app' ? 'page' : undefined} className={`${item} ${pathname === '/app' ? 'text-[#5c2394]' : ''}`}><House className={`h-6 w-6 ${pathname === '/app' ? 'fill-current' : ''}`} /><span>Home</span></Link>
      <Link href="/app/loans" aria-current={pathname.startsWith('/app/loans') || pathname === '/app/personal-loan' ? 'page' : undefined} className={`${item} ${pathname.startsWith('/app/loans') || pathname === '/app/personal-loan' ? 'text-[#5c2394]' : ''}`}><Banknote className="h-6 w-6" /><span>Loans</span></Link>
      <Link href="/app/assistant" aria-label="Open XTRA-CASH Assistant" className="-mt-7 flex flex-col items-center justify-center gap-0.5"><span className="grid h-[68px] w-[68px] place-items-center rounded-full border-[4px] border-white bg-gradient-to-br from-[#5c2394] via-[#d91f63] to-[#fb9320] shadow-[0_0_18px_rgba(166,23,211,.5)]"><Logo light markOnly size={43} /></span><span className="text-[10px] font-bold text-[#5c2394]">Assistant</span></Link>
      <Link href="/app/pay" aria-current={payActive ? 'page' : undefined} className={`${item} ${payActive ? 'text-[#5c2394]' : ''}`}><ScanLine className="h-6 w-6" /><span>Pay</span></Link>
      <button type="button" aria-label="More services" aria-expanded={moreOpen} onClick={() => setMoreOpen(true)} className={`${item} ${moreOpen || moreLinks.some(link => pathname === link.href) ? 'text-[#5c2394]' : ''}`}><Ellipsis className="h-7 w-7" /><span>More</span></button>
    </div>
  </nav><CustomerMoreMenu open={moreOpen} onClose={() => setMoreOpen(false)} /></>;
}
