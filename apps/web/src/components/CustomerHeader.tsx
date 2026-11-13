'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Menu } from 'lucide-react';
import { LoanActionCentre, Logo } from '@xtra/ui';
import { CustomerProfileLink } from './CustomerProfileLink';
import { CustomerMoreMenu } from './CustomerBottomNav';

export function CustomerHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  return <><header className="safe-pt sticky top-0 z-30 bg-gradient-to-r from-[#1b1030] via-[#5c2394] to-[#a617d3] text-white shadow-lg shadow-purple-950/15">
    <div className="mx-auto flex h-14 w-full max-w-[520px] items-center justify-between gap-2 px-4">
      <button type="button" aria-label="Open app menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl hover:bg-white/10"><Menu className="h-6 w-6" /></button>
      <Link href="/app" aria-label="XTRA-CASH home" className="min-w-0 flex-1 text-center"><Logo light size={30} className="mx-auto" /></Link>
      <div className="flex shrink-0 items-center gap-1"><LoanActionCentre variant="immersive" /><CustomerProfileLink /></div>
    </div>
  </header><CustomerMoreMenu open={menuOpen} onClose={() => setMenuOpen(false)} /></>;
}
