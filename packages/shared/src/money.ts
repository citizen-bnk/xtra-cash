/** All money in XTRA-CASH is stored and transported as integer cents (ZAR). */

export function formatZAR(cents: number | null | undefined, opts: { decimals?: boolean } = {}): string {
  const value = (cents ?? 0) / 100;
  const decimals = opts.decimals ?? true;
  const abs = Math.abs(value).toLocaleString('en-ZA', {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  });
  // en-ZA uses a non-breaking space as the thousands separator; normalise to a thin readable space.
  return `${value < 0 ? '-' : ''}R${abs.replace(/ /g, ' ')}`;
}

export function randsToCents(rands: number | string): number {
  const n = typeof rands === 'string' ? Number(rands.replace(/[^0-9.-]/g, '')) : rands;
  if (!Number.isFinite(n)) throw new Error('Invalid amount');
  return Math.round(n * 100);
}

export function centsToRands(cents: number): number {
  return cents / 100;
}

/** Basis points (1 bps = 0.01%) to a percentage string, e.g. 500 -> "5%". */
export function bpsToPercent(bps: number): string {
  const pct = bps / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2)}%`;
}
