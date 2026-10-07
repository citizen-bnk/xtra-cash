'use client';
import { ApiProvider, ToastProvider } from '@xtra/ui';
import { API_URL } from '@/lib/config';
import { PwaProvider } from '@/components/pwa';
import { InstallSheet } from '@/components/InstallApp';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ApiProvider baseUrl={API_URL} storageKey="xtra.web.tokens">
      <ToastProvider>
        <PwaProvider>
          {children}
          <InstallSheet />
        </PwaProvider>
      </ToastProvider>
    </ApiProvider>
  );
}
