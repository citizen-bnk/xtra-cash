'use client';

import { useRef, useState } from 'react';
import { useApi } from './api';
import { Button } from './components';

export function SignatureInput({ onChange }: { onChange: (value: string) => void }) {
  const saved = useApi(c => c.request<{ signature: string | null }>('GET', '/me/signature'));
  const canvas = useRef<HTMLCanvasElement>(null);
  const previous = useRef<{x:number;y:number} | null>(null);
  const [reuse, setReuse] = useState(false);
  return <fieldset className="space-y-2">
    <legend className="text-sm font-semibold">Your signature</legend>
    {saved.data?.signature && <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={reuse} onChange={event => {
        setReuse(event.target.checked);
        onChange(event.target.checked ? saved.data?.signature ?? '' : '');
      }} /> Use my saved signature
    </label>}
    {reuse && saved.data?.signature ? <img src={saved.data.signature} alt="Your saved signature" className="h-20 rounded-xl border bg-white object-contain" /> :
      <div className="rounded-xl border border-line bg-white p-2">
        <canvas ref={canvas} width={640} height={180} aria-label="Draw your signature" className="block h-24 w-full touch-none"
          onPointerDown={e => {
            e.currentTarget.setPointerCapture(e.pointerId);
            const r = e.currentTarget.getBoundingClientRect();
            previous.current = {x:(e.clientX-r.left)*640/r.width,y:(e.clientY-r.top)*180/r.height};
          }}
          onPointerMove={e => {
            const from = previous.current, ctx = e.currentTarget.getContext('2d');
            if (!from || !ctx) return;
            const r = e.currentTarget.getBoundingClientRect();
            const to = {x:(e.clientX-r.left)*640/r.width,y:(e.clientY-r.top)*180/r.height};
            ctx.strokeStyle = '#32134b'; ctx.lineWidth = 3; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.moveTo(from.x,from.y); ctx.lineTo(to.x,to.y); ctx.stroke();
            previous.current = to;
            onChange(e.currentTarget.toDataURL('image/png'));
          }}
          onLostPointerCapture={() => { previous.current = null; }} />
        <Button type="button" size="sm" variant="ghost" onClick={() => {
          canvas.current?.getContext('2d')?.clearRect(0,0,640,180);
          onChange('');
        }}>Clear</Button>
      </div>}
    <p className="text-xs text-muted">Your signature is saved to your profile for reuse.</p>
  </fieldset>;
}
