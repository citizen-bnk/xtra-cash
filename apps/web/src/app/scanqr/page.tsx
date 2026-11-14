import type { Metadata } from 'next';
import { CustomerBottomNav } from '@/components/CustomerBottomNav';
import ScanCheckout from './ScanCheckout';
import './scan.css';

export const metadata: Metadata = {
  title: 'Scan to Pay',
  robots: { index: false, follow: false },
};

export default function ScanQrPage() {
  return <>
    <div className="pb-[calc(5.25rem+env(safe-area-inset-bottom,0px))]">
      <ScanCheckout />
    </div>
    <CustomerBottomNav />
  </>;
}
