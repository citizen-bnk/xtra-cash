import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: { default: 'XTRA-CASH — credit at the point of payment', template: '%s · XTRA-CASH' },
  description: 'Shop now with extra cash from trusted micro-lenders, right at the till.',
  applicationName: 'XTRA-CASH',
  // Installed on iPhone/iPad from Safari's "Add to Home Screen": full screen, branded status bar.
  appleWebApp: { capable: true, title: 'XTRA-CASH', statusBarStyle: 'black-translucent' },
  formatDetection: { telephone: false },
};
export const viewport: Viewport = {
  themeColor: '#1b1030',
  width: 'device-width',
  initialScale: 1,
  // Draw under the notch and home indicator; screens add safe-area padding themselves.
  viewportFit: 'cover',
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
