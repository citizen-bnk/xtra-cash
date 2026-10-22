import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ApiError, XtraClient, type Me } from '@xtra/shared';
import { API_URL, tokenStore as store } from './session';
export { API_URL } from './session';

interface Ctx {
  client: XtraClient;
  me: Me | null;
  loading: boolean;
  refreshMe: () => Promise<Me | null>;
  logout: () => Promise<void>;
}
const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const client = useMemo(() => new XtraClient({ baseUrl: API_URL, tokens: store, onUnauthorized: () => setMe(null) }), []);

  const refreshMe = useCallback(async () => {
    try {
      if (!(await store.get())) {
        setMe(null);
        return null;
      }
      const m = await client.auth.me();
      setMe(m);
      return m;
    } catch {
      setMe(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  const logout = useCallback(async () => {
    const { unregisterNearbyDevice } = await import('./nearby');
    await unregisterNearbyDevice().catch(() => {});
    await client.auth.logout();
    setMe(null);
  }, [client]);

  return <AuthCtx.Provider value={{ client, me, loading, refreshMe, logout }}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}

export function useApi<T>(fn: (c: XtraClient) => Promise<T>, deps: unknown[] = []) {
  const { client } = useAuth();
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setData(await fn(client));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, ...deps]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { data, error, loading, reload };
}

export function errorMessage(e: unknown) {
  if (e instanceof ApiError) return e.message;
  if (e instanceof TypeError) return 'Cannot reach XTRA-CASH. Check your connection.';
  return (e as Error)?.message ?? 'Something went wrong';
}
