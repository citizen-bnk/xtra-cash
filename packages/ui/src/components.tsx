'use client';
import React, { useEffect } from 'react';
import { Flame, Loader2, X } from 'lucide-react';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';
const variants: Record<Variant, string> = {
  primary: 'bg-ink text-white hover:bg-ink-2',
  accent: 'bg-brand text-white hover:bg-brand-dark',
  secondary: 'bg-white text-ink border border-line hover:bg-surface',
  ghost: 'text-ink hover:bg-black/5',
  danger: 'bg-red-600 text-white hover:bg-red-700',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  className,
  children,
  disabled,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60',
        size === 'sm' ? 'h-8 px-3 text-sm' : size === 'lg' ? 'h-12 px-6 text-base' : 'h-10 px-4 text-sm',
        variants[variant],
        className,
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cx('rounded-2xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(11,27,51,0.04)]', className)}>
      {children}
    </div>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

const inputCls =
  'w-full rounded-xl border border-line bg-white px-3 h-10 text-sm text-ink placeholder:text-muted/70 focus:border-ink focus:outline-none focus:ring-2 focus:ring-brand/30';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} {...rest} className={cx(inputCls, className)} />;
});

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cx(inputCls, 'pr-8', className)}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cx(inputCls, 'h-auto py-2 min-h-20', className)} />;
}

/** Rand amount input that reports integer cents. */
export function MoneyInput({ cents, onCents, ...rest }: { cents: number | null; onCents: (c: number | null) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [text, setText] = React.useState(cents == null ? '' : String(cents / 100));
  useEffect(() => {
    const current = text === '' ? null : Math.round(Number(text) * 100);
    if (current !== cents) setText(cents == null ? '' : String(cents / 100));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cents]);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">R</span>
      <input
        inputMode="decimal"
        {...rest}
        value={text}
        onChange={(e) => {
          const v = e.target.value.replace(/[^0-9.]/g, '');
          setText(v);
          onCents(v === '' || isNaN(Number(v)) ? null : Math.round(Number(v) * 100));
        }}
        className={cx(inputCls, 'pl-7')}
      />
    </div>
  );
}

const tones = {
  gray: 'bg-slate-100 text-slate-700',
  green: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/15',
  amber: 'bg-amber-50 text-amber-800 ring-1 ring-amber-600/20',
  red: 'bg-red-50 text-red-700 ring-1 ring-red-600/15',
  blue: 'bg-sky-50 text-sky-700 ring-1 ring-sky-600/15',
  brand: 'bg-brand-soft text-brand-dark',
};
export type Tone = keyof typeof tones;

export function Badge({ tone = 'gray', children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold', tones[tone], className)}>{children}</span>;
}

const STATUS_TONES: Record<string, Tone> = {
  ACTIVE: 'green',
  APPROVED: 'green',
  VERIFIED: 'green',
  ACCREDITED: 'green',
  CONFIRMED: 'green',
  PAID: 'green',
  SETTLED: 'blue',
  ACCEPTED: 'green',
  PENDING: 'amber',
  SUBMITTED: 'amber',
  UNDER_REVIEW: 'amber',
  REQUESTED: 'amber',
  DUE: 'gray',
  UPLOADED: 'gray',
  DRAFT: 'gray',
  NOT_STARTED: 'gray',
  FROZEN: 'blue',
  IN_ARREARS: 'red',
  OVERDUE: 'red',
  DECLINED: 'red',
  REJECTED: 'red',
  SUSPENDED: 'red',
  DEFAULTED: 'red',
  CANCELLED: 'gray',
  REVERSED: 'gray',
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONES[status] ?? 'gray'}>{status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</Badge>;
}

export function Stat({ label, value, sub, icon }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between text-sm text-muted">
        <span>{label}</span>
        {icon}
      </div>
      <div className="mt-1.5 text-2xl font-bold tracking-tight tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </Card>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Alert({ tone = 'amber', title, children }: { tone?: 'amber' | 'red' | 'green' | 'blue'; title?: string; children?: React.ReactNode }) {
  const map = {
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
    red: 'bg-red-50 border-red-200 text-red-900',
    green: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    blue: 'bg-sky-50 border-sky-200 text-sky-900',
  };
  return (
    <div className={cx('rounded-xl border px-4 py-3 text-sm', map[tone])}>
      {title && <div className="font-semibold">{title}</div>}
      {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx('h-5 w-5 animate-spin text-muted', className)} />;
}

export function Loading() {
  return (
    <div className="flex justify-center py-16">
      <Spinner />
    </div>
  );
}

export function Empty({ title, children, icon }: { title: string; children?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-white px-6 py-12 text-center">
      {icon && <div className="mb-3 text-muted">{icon}</div>}
      <div className="font-semibold">{title}</div>
      {children && <div className="mt-1 max-w-sm text-sm text-muted">{children}</div>}
    </div>
  );
}

export interface Column<T> {
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
  align?: 'right';
}

export function Table<T>({ rows, columns, onRowClick, empty = 'Nothing here yet' }: { rows: T[]; columns: Column<T>[]; onRowClick?: (r: T) => void; empty?: string }) {
  if (!rows.length) return <Empty title={empty} />;
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-surface/60 text-left text-xs uppercase tracking-wide text-muted">
            {columns.map((c) => (
              <th key={c.header} className={cx('px-4 py-2.5 font-semibold whitespace-nowrap', c.align === 'right' && 'text-right', c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={i}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={cx('border-b border-line last:border-0', onRowClick && 'cursor-pointer hover:bg-surface/70')}
            >
              {columns.map((c) => (
                <td key={c.header} className={cx('px-4 py-3 align-middle', c.align === 'right' && 'text-right tabular-nums', c.className)}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal className="w-full max-w-lg rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-muted hover:bg-surface" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="mb-4 inline-flex flex-wrap gap-1 rounded-xl border border-line bg-white p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx('rounded-lg px-3 py-1.5 text-sm font-medium transition', value === o.value ? 'bg-ink text-white' : 'text-muted hover:text-ink')}
        >
          {o.label}
          {o.count ? <span className={cx('ml-1.5 rounded-full px-1.5 text-xs', value === o.value ? 'bg-brand text-white' : 'bg-surface')}>{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/**
 * The XTRA-CASH card visual, drawn to match the brand card artwork (orange-to-purple flames).
 * A frozen card shows the frosted ice artwork (apps serve /brand/card-frozen.jpg) over an
 * icy gradient fallback. No card-network logo until XTRA-CASH has an issuing agreement.
 */
export function XtraCard({ name, maskedPan, expiry, frozen }: { name: string; maskedPan: string; expiry: string; frozen?: boolean }) {
  return (
    <div
      className={cx(
        'relative aspect-[1.586] w-full max-w-sm overflow-hidden rounded-2xl bg-cover bg-center p-5 shadow-lg transition',
        frozen ? 'text-ink' : 'text-white',
      )}
      style={{
        backgroundImage: frozen
          ? 'url(/brand/card-frozen.jpg), linear-gradient(135deg, #bfe3f5 0%, #6fb3d9 100%)'
          : 'linear-gradient(135deg, #fb9320 0%, #e5476a 42%, #a617d3 76%, #5c2394 100%)',
      }}
    >
      {!frozen && (
        <>
          <Flame className="absolute -bottom-8 -right-6 h-48 w-48 text-white/15" strokeWidth={1.25} aria-hidden="true" />
          <Flame className="absolute -top-6 right-24 h-24 w-24 rotate-12 text-white/10" strokeWidth={1.25} aria-hidden="true" />
          <div className="absolute -left-10 -top-10 h-40 w-40 rounded-full bg-[#ffd29a]/40 blur-2xl" />
        </>
      )}
      <div className="relative flex items-start justify-between">
        <Logo light={!frozen} mono={!frozen} />
        {frozen && <span className="rounded-full bg-ink/80 px-2 py-0.5 text-xs font-bold text-white">FROZEN</span>}
      </div>
      <div
        className="relative mt-4 h-8 w-11 rounded-md border border-black/10 bg-gradient-to-br from-[#f6e27a] via-[#d4af37] to-[#b8912a] shadow-inner"
        aria-hidden="true"
      />
      <div className="absolute bottom-5 left-5 right-5">
        <div className="font-mono text-lg tracking-widest drop-shadow-sm">{maskedPan}</div>
        <div className={cx('mt-2 flex justify-between text-xs font-semibold uppercase', frozen ? 'text-ink/80' : 'text-white/85')}>
          <span>{name}</span>
          <span>{expiry}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * The XTRA-CASH logo: burning-wallet mark + wordmark (from the official brand artwork).
 * Apps serve the mark at /brand/mark.png. `light` is for dark or coloured backgrounds.
 */
export function Logo({ light, mono, className, markOnly, size = 28 }: { light?: boolean; mono?: boolean; className?: string; markOnly?: boolean; size?: number }) {
  const mark = light ? (
    <span className="grid place-items-center rounded-lg bg-white p-0.5 shadow-sm" style={{ width: size, height: size }}>
      <img src="/brand/mark.png" alt="" className="h-full w-full object-contain" />
    </span>
  ) : (
    <img src="/brand/mark.png" alt="" style={{ width: size, height: size }} className="object-contain" />
  );
  return (
    <span className={cx('inline-flex items-center gap-2 font-black tracking-tight', className)} aria-label="XTRA-CASH">
      {mark}
      {!markOnly && (
        <span className={cx('text-[1.15em] leading-none', mono ? 'text-white' : light ? 'text-brand-gradient-light' : 'text-brand-gradient')}>XTRA-CASH</span>
      )}
    </span>
  );
}
