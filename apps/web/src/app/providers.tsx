'use client';
import { ApiProvider, ToastProvider } from '@xtra/ui';
import { usePathname } from 'next/navigation';
import { API_URL } from '@/lib/config';
import { PwaProvider } from '@/components/pwa';
import { InstallSheet } from '@/components/InstallApp';

export function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // The public checkout prototype does not depend on a customer session.
  if (pathname === '/scanqr' || pathname === '/scanqr/') return <>{children}</>;

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
