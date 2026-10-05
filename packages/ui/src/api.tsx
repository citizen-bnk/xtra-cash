'use client';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, XtraClient, type Me, type Tokens } from '@xtra/shared';

interface AuthState {
  client: XtraClient;
  me: Me | null;
  loading: boolean;
  refreshMe: () => Promise<Me | null>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

function localTokenStore(key: string) {
  return {
    get(): Tokens | null {
      try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as Tokens) : null;
      } catch {
        return null;
      }
    },
    set(t: Tokens | null) {
      try {
        if (t) localStorage.setItem(key, JSON.stringify(t));
        else localStorage.removeItem(key);
      } catch {
        /* storage unavailable */
      }
    },
  };
}

export function ApiProvider({ baseUrl, storageKey, children }: { baseUrl: string; storageKey: string; children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const client = useMemo(
    () => new XtraClient({ baseUrl, tokens: localTokenStore(storageKey), onUnauthorized: () => setMe(null) }),
    [baseUrl, storageKey],
  );

  const refreshMe = useCallback(async () => {
    const hasToken = localTokenStore(storageKey).get();
    if (!hasToken) {
      setMe(null);
      setLoading(false);
      return null;
    }
    try {
      const m = await client.auth.me();
      setMe(m);
      return m;
    } catch {
      setMe(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [client, storageKey]);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  const logout = useCallback(async () => {
    await client.auth.logout();
    setMe(null);
  }, [client]);

  return <Ctx.Provider value={{ client, me, loading, refreshMe, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <ApiProvider>');
  return v;
}

export function useClient() {
  return useAuth().client;
}

/** Tiny data hook: runs `fn` on mount / when deps change and exposes reload. */
export function useApi<T>(fn: (c: XtraClient) => Promise<T>, deps: unknown[] = []) {
  const client = useClient();
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const requestVersion = useRef(0);

  const reload = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      const d = await fnRef.current(client);
      if (version === requestVersion.current) {
        setData(d);
        setError(null);
      }
      return d;
    } catch (e) {
      if (version === requestVersion.current) setError(errorMessage(e));
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, ...deps]);

  useEffect(() => {
    reload();
    return () => { requestVersion.current++; };
  }, [reload]);

  return { data, error, loading, reload, setData };
}

/** Wraps an async action with loading + error state. */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      setLoading(true);
      setError(null);
      try {
        return await fn(...args);
      } catch (e) {
        setError(errorMessage(e));
        return undefined;
      } finally {
        setLoading(false);
      }
    },
    [fn],
  );
  return { run, loading, error, setError };
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof TypeError) return 'Cannot reach XTRA-CASH servers. Check your connection.';
  return (e as Error)?.message ?? 'Something went wrong';
}

// ---------- toasts
type Toast = { id: number; text: string; tone: 'ok' | 'err' };
const ToastCtx = createContext<(text: string, tone?: 'ok' | 'err') => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg ${t.tone === 'ok' ? 'bg-ink text-white' : 'bg-red-600 text-white'}`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
