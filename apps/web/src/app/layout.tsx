import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: { default: 'XTRA-CASH — credit at the point of payment', template: '%s · XTRA-CASH' },
  description: 'Shop now with extra cash from trusted micro-lenders, right at the till.',
};
export const viewport: Viewport = { themeColor: '#0b1b33', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZA">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
