'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

export type RecordAction = { label: string; href?: string; onSelect?: () => void; disabled?: boolean };
export function RecordActions({ actions, label = 'Record actions' }: { actions: RecordAction[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      const panel = menu.current?.getBoundingClientRect();
      if (!anchor || !panel) return;
      if (anchor.bottom < 0 || anchor.top > window.innerHeight) {
        setOpen(false);
        return;
      }
      const padding = 8;
      const left = Math.max(padding, Math.min(anchor.right - panel.width, window.innerWidth - panel.width - padding));
      const top = anchor.bottom + panel.height + padding < window.innerHeight
        ? anchor.bottom + 4
        : Math.max(padding, anchor.top - panel.height - 4);
      setPosition({ top, left });
    };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !trigger.current?.contains(event.target) && !menu.current?.contains(event.target))
        setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    };
    place();
    menu.current?.querySelector<HTMLElement>('a, button:not([disabled])')?.focus({ preventScroll: true });
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape, true);
    };
  }, [open]);

  const itemClass = 'block w-full break-words rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-surface disabled:opacity-50';
  return <div className="inline-block text-left">
    <button ref={trigger} type="button" aria-label={label} aria-expanded={open} onClick={() => {
      setPosition(null);
      setOpen(!open);
    }} className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-white hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-purple">
      <MoreHorizontal className="h-5 w-5" />
    </button>
    {open && createPortal(
      <div ref={menu} role="group" aria-label={label} className="fixed z-[90] max-h-[calc(100dvh-1rem)] w-max min-w-40 max-w-[calc(100vw-1rem)] overflow-auto rounded-xl border border-line bg-white p-1 shadow-xl" style={{ top: position?.top ?? 0, left: position?.left ?? 0, opacity: position ? 1 : 0 }}
        onClick={event => event.stopPropagation()}
        onBlur={event => { if (!menu.current?.contains(event.relatedTarget) && event.relatedTarget !== trigger.current) setOpen(false); }}>
        {actions.map(action => action.href
          ? <a key={action.label} href={action.href} onClick={() => setOpen(false)} className={itemClass}>{action.label}</a>
          : <button key={action.label} type="button" disabled={action.disabled} className={itemClass} onClick={() => {
              setOpen(false);
              trigger.current?.focus();
              action.onSelect?.();
            }}>{action.label}</button>)}
      </div>,
      document.body,
    )}
  </div>;
}
