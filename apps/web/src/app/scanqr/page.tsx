import type { Metadata } from 'next';
import ScanCheckout from './ScanCheckout';
import './scan.css';

export const metadata: Metadata = {
  title: 'Table checkout prototype',
  robots: { index: false, follow: false },
};

export default function ScanQrPage() {
  return <ScanCheckout />;
}
