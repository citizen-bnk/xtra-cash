'use client';
import { useState } from 'react';
import { formatZAR } from '@xtra/shared';

// Validated with the dataviz palette checker (light surface): both pass lightness, chroma, CVD & normal-vision.
// Credit green is below 3:1 contrast, so the chart always ships a legend, hover values and the totals row.
const WALLET = '#2563b8';
const CREDIT = '#7fae12';

export function VolumeChart({ data }: { data: { date: string; walletCents: number; creditCents: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720;
  const H = 220;
  const pad = { l: 56, r: 8, t: 12, b: 24 };
  const max = Math.max(1, ...data.map((d) => d.walletCents + d.creditCents));
  const nice = niceMax(max);
  const bw = (W - pad.l - pad.r) / data.length;
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / nice);
  const ticks = [0, nice / 2, nice];
  const h = hover != null ? data[hover] : null;

  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: WALLET }} /> Paid from wallet</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: CREDIT }} /> Funded by XTRA-CASH credit</span>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Daily approved card volume, last 30 days" onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#e3e8ef" strokeWidth={1} />
              <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#5b6b82">
                {formatZAR(t, { decimals: false })}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = pad.l + i * bw + bw * 0.18;
            const w = bw * 0.64;
            const yw = y(d.walletCents);
            const yc = y(d.walletCents + d.creditCents);
            const base = y(0);
            const gap = d.walletCents > 0 && d.creditCents > 0 ? 2 : 0;
            return (
              <g key={d.date} onMouseEnter={() => setHover(i)}>
                <rect x={pad.l + i * bw} y={pad.t} width={bw} height={H - pad.t - pad.b} fill={hover === i ? 'rgba(11,27,51,0.04)' : 'transparent'} />
                {d.walletCents > 0 && <path d={bar(x, yw, w, base - yw, d.creditCents > 0 ? 0 : 3)} fill={WALLET} />}
                {d.creditCents > 0 && <path d={bar(x, yc, w, Math.max(0, yw - yc - gap), 3)} fill={CREDIT} />}
                {(data.length - 1 - i) % 7 === 0 && (
                  <text x={pad.l + i * bw + bw / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="#5b6b82">
                    {new Date(d.date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {h && hover != null && (
          <div
            className="pointer-events-none absolute top-0 z-10 w-48 rounded-xl border border-line bg-white p-3 text-xs shadow-lg"
            style={{ left: `min(calc(${((pad.l + hover * bw + bw) / W) * 100}% + 8px), calc(100% - 12rem))` }}
          >
            <div className="font-semibold text-ink">{new Date(h.date).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
            <Row color={WALLET} k="Wallet" v={formatZAR(h.walletCents)} />
            <Row color={CREDIT} k="Credit" v={formatZAR(h.creditCents)} />
            <div className="mt-1 flex justify-between border-t border-line pt-1 font-semibold text-ink"><span>Total</span><span>{formatZAR(h.walletCents + h.creditCents)}</span></div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ color, k, v }: { color: string; k: string; v: string }) {
  return (
    <div className="mt-1 flex items-center justify-between text-muted">
      <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: color }} />{k}</span>
      <span className="tabular-nums text-ink">{v}</span>
    </div>
  );
}

/** Bar path with rounded top corners only (data end), square at the baseline. */
function bar(x: number, y: number, w: number, h: number, r: number) {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

function niceMax(v: number) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
