import type { MetadataRoute } from 'next';

/** Web app manifest: makes XTRA-CASH installable as an app (Add to Home Screen / Install app). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'XTRA-CASH',
    short_name: 'XTRA-CASH',
    description: 'Credit at the point of payment. Tap your XTRA-CASH card; any shortfall is covered by your best matched lender.',
    start_url: '/app?source=pwa',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'portrait',
    background_color: '#1b1030',
    theme_color: '#1b1030',
    lang: 'en-ZA',
    dir: 'ltr',
    categories: ['finance', 'shopping'],
    prefer_related_applications: false,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Pay', short_name: 'Pay', description: 'Pay with XTRA-CASH', url: '/app?pay=1&source=shortcut', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'My card', short_name: 'Card', url: '/app/card?source=shortcut', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Repayments', short_name: 'Repay', url: '/app/loans?source=shortcut', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
