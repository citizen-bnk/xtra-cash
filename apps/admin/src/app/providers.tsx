'use client';
import { ApiProvider, ToastProvider } from '@xtra/ui';

// Same-origin: /api/* is proxied to the API server-side (src/app/api/[...path]/route.ts).
export const API_URL = '/api';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ApiProvider baseUrl={API_URL} storageKey="xtra.admin.tokens">
      <ToastProvider>{children}</ToastProvider>
    </ApiProvider>
  );
}
