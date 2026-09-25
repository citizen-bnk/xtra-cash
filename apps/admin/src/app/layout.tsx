import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: { default: 'XTRA-CASH Back Office', template: '%s · XTRA-CASH Back Office' },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZA">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
