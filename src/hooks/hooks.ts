import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { loadSettings, saveSettings, type Settings } from '../core/settings';

export function useSettings(): [Settings, (patch: Partial<Settings> | ((s: Settings) => Settings)) => void, (s: Settings) => void] {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const update = useCallback((patch: Partial<Settings> | ((s: Settings) => Settings)) => {
    setSettings((prev) => {
      const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);
  const replace = useCallback((s: Settings) => {
    saveSettings(s);
    setSettings(s);
  }, []);
  return [settings, update, replace];
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      if (typeof matchMedia === 'undefined') return () => undefined;
      const mq = matchMedia(query);
      mq.addEventListener?.('change', cb);
      return () => mq.removeEventListener?.('change', cb);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => (typeof matchMedia === 'undefined' ? false : matchMedia(query).matches),
    () => false,
  );
}

export type WakeLockStatus = 'off' | 'active' | 'unsupported' | 'denied' | 'released';

interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', cb: () => void): void;
}

/**
 * Screen Wake Lock with automatic re-acquisition when the page becomes visible
 * again (the platform releases the lock whenever the page is hidden).
 */
export function useWakeLock(enabled: boolean): WakeLockStatus {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  const [status, setStatus] = useState<WakeLockStatus>(supported ? 'off' : 'unsupported');
  const sentinel = useRef<WakeLockSentinelLike | null>(null);

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    const acquire = async () => {
      if (!enabled || document.visibilityState !== 'visible') return;
      if (sentinel.current && !sentinel.current.released) return;
      try {
        const s = (await (navigator as Navigator & { wakeLock: { request(t: 'screen'): Promise<WakeLockSentinelLike> } }).wakeLock.request(
          'screen',
        )) as WakeLockSentinelLike;
        if (cancelled) {
          void s.release();
          return;
        }
        sentinel.current = s;
        setStatus('active');
        s.addEventListener('release', () => {
          if (!cancelled) setStatus('released');
        });
      } catch {
        if (!cancelled) setStatus('denied');
      }
    };
    const onVis = () => void acquire();
    if (enabled) {
      void acquire();
      document.addEventListener('visibilitychange', onVis);
      window.addEventListener('focus', onVis);
    } else {
      setStatus('off');
    }
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
      if (sentinel.current && !sentinel.current.released) void sentinel.current.release();
      sentinel.current = null;
    };
  }, [enabled, supported]);

  return status;
}

/** Visible after any interaction, hidden after `seconds` of inactivity. */
export function useAutoHide(seconds: number): [boolean, () => void, () => void] {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const show = useCallback(() => {
    setVisible(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(false), seconds * 1000);
  }, [seconds]);
  const hide = useCallback(() => {
    clearTimeout(timer.current);
    setVisible(false);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return [visible, show, hide];
}

export function useHashRoute(): [string, (r: string) => void] {
  const get = () => (typeof location === 'undefined' ? '' : location.hash.replace(/^#\/?/, ''));
  const [route, setRoute] = useState(get);
  useEffect(() => {
    const on = () => setRoute(get());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = useCallback((r: string) => {
    if (r === '') {
      if (history.state?.fromClock) history.back();
      else history.replaceState(null, '', location.pathname + location.search);
      setRoute('');
    } else {
      history.pushState({ fromClock: true }, '', `#/${r}`);
      setRoute(r);
    }
  }, []);
  return [route, go];
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    (typeof matchMedia !== 'undefined' && matchMedia('(display-mode: standalone)').matches) ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
