'use client';
import { ApiProvider, ToastProvider } from '@xtra/ui';
import { API_URL } from '@/lib/config';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ApiProvider baseUrl={API_URL} storageKey="xtra.web.tokens">
      <ToastProvider>{children}</ToastProvider>
    </ApiProvider>
  );
}
