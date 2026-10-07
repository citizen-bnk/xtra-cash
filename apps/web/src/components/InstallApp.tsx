'use client';
import { useEffect, useState } from 'react';
import { ArrowDown, Check, Copy, Download, EllipsisVertical, Fingerprint, PlusSquare, Share, Smartphone, X, Zap } from 'lucide-react';
import { cx } from '@xtra/ui';
import { bannerDismissed, dismissBanner, usePwa } from './pwa';

function AppIcon({ size = 64 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/icons/icon-192.png" alt="" width={size} height={size} className="shrink-0 rounded-[22%] shadow-lg shadow-brand/20" />
  );
}

function Step({ n, children, icon }: { n: number; children: React.ReactNode; icon: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink text-xs font-bold text-white">{n}</span>
      <span className="flex-1 text-sm text-ink">{children}</span>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-brand shadow-sm">{icon}</span>
    </li>
  );
}

/** Bottom sheet explaining how to install XTRA-CASH on this particular device. */
export function InstallSheet() {
  const pwa = usePwa();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pwa.sheetOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && pwa.closeInstall();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pwa]);

  if (!pwa.sheetOpen || pwa.installed) return null;

  const install = async () => {
    setBusy(true);
    const r = await pwa.promptInstall();
    setBusy(false);
    if (r === 'accepted') pwa.closeInstall();
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
    } catch {
      /* clipboard blocked: the address is shown on screen */
    }
  };

  let body: React.ReactNode;
  if (pwa.inAppBrowser) {
    body = (
      <>
        <p className="text-sm text-muted">This in-app browser can’t install apps. Open XTRA-CASH in {pwa.platform === 'ios' ? 'Safari' : 'Chrome'} first:</p>
        <ol className="mt-4 space-y-2">
          <Step n={1} icon={<EllipsisVertical className="h-5 w-5" />}>Tap the menu in the corner</Step>
          <Step n={2} icon={<Smartphone className="h-5 w-5" />}>Choose <b>Open in {pwa.platform === 'ios' ? 'Safari' : 'browser'}</b></Step>
        </ol>
        <button onClick={copyLink} className="pressable mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-line font-semibold">
          {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />} {copied ? 'Link copied' : 'Copy link'}
        </button>
      </>
    );
  } else if (pwa.canPrompt) {
    body = (
      <button
        onClick={install}
        disabled={busy}
        className="pressable flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-brand text-base font-bold text-white shadow-lg shadow-brand/30 disabled:opacity-60"
      >
        <Download className="h-5 w-5" /> Install XTRA-CASH
      </button>
    );
  } else if (pwa.platform === 'ios') {
    body = (
      <ol className="space-y-2">
        <Step n={1} icon={<Share className="h-5 w-5" />}>
          Tap <b>Share</b> in Safari’s toolbar
        </Step>
        <Step n={2} icon={<PlusSquare className="h-5 w-5" />}>
          Scroll down and tap <b>Add to Home Screen</b>
        </Step>
        <Step n={3} icon={<Check className="h-5 w-5" />}>
          Tap <b>Add</b>. XTRA-CASH appears on your home screen
        </Step>
      </ol>
    );
  } else if (pwa.platform === 'android') {
    body = (
      <ol className="space-y-2">
        <Step n={1} icon={<EllipsisVertical className="h-5 w-5" />}>
          Tap the <b>⋮ menu</b> at the top right
        </Step>
        <Step n={2} icon={<Download className="h-5 w-5" />}>
          Tap <b>Install app</b> or <b>Add to Home screen</b>
        </Step>
      </ol>
    );
  } else {
    body = <p className="text-sm text-muted">Open XTRA-CASH on your phone to install it, or use the install icon in your browser’s address bar.</p>;
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/50 animate-fade-in sm:items-center sm:p-4" onClick={pwa.closeInstall}>
      <div
        role="dialog"
        aria-modal
        aria-labelledby="install-title"
        onClick={(e) => e.stopPropagation()}
        className="safe-pb w-full max-w-md rounded-t-[28px] bg-white shadow-2xl animate-sheet-up sm:rounded-[28px]"
      >
        <div className="px-5 pb-5 pt-3">
          <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line sm:hidden" />
          <div className="flex items-start gap-4">
            <AppIcon />
            <div className="min-w-0 flex-1">
              <h2 id="install-title" className="text-lg font-black leading-tight">Get the XTRA-CASH app</h2>
              <p className="mt-0.5 text-sm text-muted">Credit at the point of payment</p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold text-muted">
                <span className="rounded-full bg-surface px-2 py-0.5">Free</span>
                <span className="rounded-full bg-surface px-2 py-0.5">No app store</span>
                <span className="rounded-full bg-surface px-2 py-0.5">Tiny download</span>
              </div>
            </div>
            <button onClick={pwa.closeInstall} className="-mr-1 grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-surface" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>

          <ul className="mt-5 space-y-2.5 text-sm">
            <li className="flex items-center gap-3">
              <Zap className="h-4 w-4 shrink-0 text-brand" /> Opens instantly from your home screen, full screen
            </li>
            <li className="flex items-center gap-3">
              <Smartphone className="h-4 w-4 shrink-0 text-brand" /> Pay, check your balance and repay in a tap
            </li>
            <li className="flex items-center gap-3">
              <Fingerprint className="h-4 w-4 shrink-0 text-brand" /> Unlock with your fingerprint or face (passkey)
            </li>
          </ul>

          <div className="mt-5">{body}</div>
          <button onClick={pwa.closeInstall} className="mt-3 h-11 w-full rounded-2xl text-sm font-semibold text-muted">
            Not now
          </button>
        </div>
      </div>
      {/* On iPhone, Safari's Share button sits in the bottom toolbar: point at it. */}
      {pwa.platform === 'ios' && !pwa.canPrompt && !pwa.inAppBrowser && (
        <ArrowDown aria-hidden className="pointer-events-none fixed bottom-1 left-1/2 h-7 w-7 -translate-x-1/2 animate-bounce text-brand sm:hidden" />
      )}
    </div>
  );
}

/** Slim "Get the app" bar for phone browsers, shown inside the app screens until installed or dismissed. */
export function InstallBanner({ className }: { className?: string }) {
  const pwa = usePwa();
  const [hidden, setHidden] = useState(true);
  useEffect(() => setHidden(bannerDismissed()), []);
  if (!pwa.ready || !pwa.isMobile || pwa.installed || hidden) return null;
  return (
    <div className={cx('flex items-center gap-3 rounded-2xl border border-line bg-white p-3 shadow-sm', className)}>
      <AppIcon size={40} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold leading-tight">Get the app</div>
        <div className="truncate text-xs text-muted">Faster payments from your home screen</div>
      </div>
      <button onClick={pwa.openInstall} className="pressable h-9 shrink-0 rounded-xl bg-ink px-3 text-sm font-semibold text-white">
        Install
      </button>
      <button
        onClick={() => {
          dismissBanner();
          setHidden(true);
        }}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
