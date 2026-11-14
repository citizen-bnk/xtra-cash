'use client';
import { usePathname } from 'next/navigation';
import { RequireRole } from '@/lib/guard';
import { MarketingLocationObserver } from '@/components/MarketingLocationObserver';
import { CustomerBottomNav } from '@/components/CustomerBottomNav';
import { CustomerHeader } from '@/components/CustomerHeader';

export default function ConsumerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const immersiveHome = pathname === '/app';
  const immersiveProfile = pathname === '/app/profile';
  const immersiveAssistant = pathname === '/app/assistant';

  return (
    <RequireRole roles={['CONSUMER', 'AFFILIATE', 'LENDER', 'ADMIN', 'SUPER_ADMIN']} signedOutRoute="/onboarding">
      <MarketingLocationObserver />
      <div className={`xc-app-theme xc-customer-app min-h-[100dvh] ${immersiveAssistant ? '' : 'pb-[calc(5.25rem+env(safe-area-inset-bottom,0px))]'} ${immersiveHome || immersiveAssistant ? '' : 'bg-[#f5f0fa]'}`}>
        {!immersiveHome && !immersiveProfile && !immersiveAssistant && <CustomerHeader />}
        <main key={pathname} className={immersiveAssistant ? 'h-[100dvh]' : immersiveHome ? 'min-h-[100dvh]' : immersiveProfile ? 'min-h-[calc(100dvh-5rem)] animate-fade-in' : 'xc-customer-surface mx-auto min-h-[calc(100dvh-8rem)] max-w-5xl px-4 py-5 animate-fade-in sm:px-5 lg:py-6'}>
          {children}
        </main>
        {!immersiveHome && !immersiveAssistant && <CustomerBottomNav />}
      </div>
    </RequireRole>
  );
}
