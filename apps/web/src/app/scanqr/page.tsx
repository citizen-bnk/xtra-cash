import type { Metadata } from 'next';
import ScanCheckout from './ScanCheckout';
import './scan.css';

export const metadata: Metadata = {
  title: 'Scan to Pay',
  robots: { index: false, follow: false },
};

export default function ScanQrPage() {
  return <ScanCheckout />;
}
