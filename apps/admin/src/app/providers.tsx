'use client';
import { ApiProvider, ToastProvider } from '@xtra/ui';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ApiProvider baseUrl={API_URL} storageKey="xtra.admin.tokens">
      <ToastProvider>{children}</ToastProvider>
    </ApiProvider>
  );
}
