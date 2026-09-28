'use client';
import React, { useEffect, useState } from 'react';
import { ArrowRight, Landmark, Loader2, PlayCircle, ShieldCheck, ShoppingBag, Users } from 'lucide-react';
import type { AuthResponse, DemoPersona } from '@xtra/shared';
import { useAuth } from './api';
import { Alert, Card, cx } from './components';

const GROUP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Shoppers: ShoppingBag,
  'Micro-lenders': Landmark,
  Affiliates: Users,
  'XTRA-CASH staff': ShieldCheck,
};

/**
 * One-click demo sign-in tiles. Renders nothing unless the API has demo mode on (ENABLE_DEMO_LOGIN=true).
 * Visitors pick a role from its description; no email or password needed.
 */
export function DemoAccounts({
  app,
  onSignedIn,
  footer,
  className,
}: {
  app: 'web' | 'admin';
  onSignedIn: (r: AuthResponse) => void | Promise<void>;
  footer?: React.ReactNode;
  className?: string;
}) {
  const { client } = useAuth();
  const [personas, setPersonas] = useState<DemoPersona[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    client.auth
      .demoPersonas()
      .then((r) => live && setPersonas(r.enabled ? r.personas.filter((p) => p.app === app) : []))
      .catch(() => live && setPersonas([]));
    return () => {
      live = false;
    };
  }, [client, app]);

  if (!personas?.length) return null;

  const groups = personas.reduce<Record<string, DemoPersona[]>>((acc, p) => {
    (acc[p.group] ??= []).push(p);
    return acc;
  }, {});

  const start = async (p: DemoPersona) => {
    setBusy(p.key);
    setError(null);
    try {
      const r = await client.auth.demoLogin(p.key);
      await onSignedIn(r);
    } catch (e: any) {
      setError(e?.message ?? 'Could not start the demo. Please try again.');
      setBusy(null);
    }
  };

  return (
    <Card className={cx('w-full p-5 sm:p-6', className)}>
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-gradient text-white">
          <PlayCircle className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-bold leading-tight">Try a demo</h2>
          <p className="mt-0.5 text-sm text-muted">Pick a role to explore XTRA-CASH with sample data. No password needed.</p>
        </div>
      </div>
      {busy && !error && (
        <p className="mt-3 text-xs text-muted">The first demo sign-in can take up to a minute while sample data is prepared.</p>
      )}
      {error && (
        <div className="mt-4">
          <Alert tone="red">{error}</Alert>
        </div>
      )}
      <div className="mt-5 space-y-5">
        {Object.entries(groups).map(([group, list]) => {
          const Icon = GROUP_ICONS[group] ?? Users;
          return (
            <div key={group}>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
                <Icon className="h-3.5 w-3.5" /> {group}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {list.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    disabled={!!busy}
                    onClick={() => start(p)}
                    className={cx(
                      'group flex h-full flex-col rounded-xl border border-line bg-white p-3 text-left transition',
                      'hover:border-brand/40 hover:bg-brand-soft/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50',
                      'disabled:cursor-not-allowed disabled:opacity-60',
                      busy === p.key && 'border-brand/50 bg-brand-soft/50 opacity-100',
                    )}
                  >
                    <span className="flex items-center justify-between gap-2 text-sm font-semibold text-ink">
                      {p.title}
                      {busy === p.key ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-brand" />
                      ) : (
                        <ArrowRight className="h-4 w-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-brand" />
                      )}
                    </span>
                    <span className="mt-1 text-xs leading-relaxed text-muted">{p.description}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {footer && <div className="mt-5 border-t border-line pt-4 text-sm text-muted">{footer}</div>}
    </Card>
  );
}
