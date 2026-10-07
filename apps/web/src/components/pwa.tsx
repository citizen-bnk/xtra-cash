'use client';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/** Chrome/Edge/Samsung's install event (not in the TS DOM lib yet). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type Platform = 'ios' | 'android' | 'desktop';

interface PwaState {
  /** Running as the installed app (home-screen icon). */
  installed: boolean;
  /** The browser offered a one-tap install (Android Chrome, Edge, Samsung Internet). */
  canPrompt: boolean;
  platform: Platform;
  /** A phone or small touch tablet. */
  isMobile: boolean;
  /** Facebook / Instagram / WhatsApp etc. in-app browsers can't install apps. */
  inAppBrowser: boolean;
  /** Has the page worked out the device yet (false during the first render). */
  ready: boolean;
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
  sheetOpen: boolean;
  openInstall: () => void;
  closeInstall: () => void;
}

const Ctx = createContext<PwaState | null>(null);

function detect() {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const small = Math.min(window.screen.width, window.screen.height) < 820;
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  return {
    platform: (ios ? 'ios' : android ? 'android' : 'desktop') as Platform,
    isMobile: ios || android || /Mobi/i.test(ua) || (coarse && small),
    installed: standalone,
    inAppBrowser: /FBAN|FBAV|Instagram|Line\/|WhatsApp|Snapchat|TikTok|; wv\)/i.test(ua),
  };
}

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [env, setEnv] = useState({ platform: 'desktop' as Platform, isMobile: false, installed: false, inAppBrowser: false, ready: false });
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    setEnv({ ...detect(), ready: true });
    const onPrompt = (e: Event) => {
      e.preventDefault(); // we show our own install button instead of the browser's mini-bar
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setSheetOpen(false);
      setEnv((s) => ({ ...s, installed: true }));
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);

    // Register the service worker (skipped in local development so code changes always show).
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      const register = () => navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
      if (document.readyState === 'complete') register();
      else window.addEventListener('load', register, { once: true });
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferred) return 'unavailable' as const;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null); // a prompt can only be used once
    return outcome;
  }, [deferred]);

  const value = useMemo<PwaState>(
    () => ({
      ...env,
      canPrompt: !!deferred,
      promptInstall,
      sheetOpen,
      openInstall: () => setSheetOpen(true),
      closeInstall: () => setSheetOpen(false),
    }),
    [env, deferred, promptInstall, sheetOpen],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePwa() {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePwa must be used inside <PwaProvider>');
  return v;
}

const DISMISS_KEY = 'xc.install.dismissedAt';
const DISMISS_DAYS = 7;

/** Whether the small "Get the app" banner was dismissed in the last week (per device, best effort). */
export function bannerDismissed() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return Date.now() - at < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}
export function dismissBanner() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* storage unavailable: the banner just comes back next visit */
  }
}
