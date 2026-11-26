import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QuoteStore } from './core/data';
import { ClockEngine, type EngineSnapshot } from './core/engine';
import { activeThemeId, nightActive, type Settings } from './core/settings';
import { openStore, type Store } from './core/storage';
import { resolveTheme } from './core/themes';
import { createMinuteTicker, formatClock, formatMinute, minuteOfDay, timeInWords } from './core/time';
import type { Quote } from './core/types';
import { isIOS, isStandalone, useAutoHide, useHashRoute, useMediaQuery, useSettings, useWakeLock } from './hooks/hooks';
import { Icon } from './ui/icons';
import { FitBox, QuoteFigure, attributionLine } from './ui/QuoteView';
import { ShareDialog } from './ui/ShareDialog';
import { FONT_STACKS } from './ui/fonts';
import { onUpdateReady, applyUpdate } from './sw-register';

const Library = lazy(() => import('./ui/Library'));
const SettingsPanel = lazy(() => import('./ui/SettingsPanel'));

const quoteStore = new QuoteStore();
const dbPromise: Promise<Store> = openStore();

/** `?at=HH:MM` freezes the clock at a chosen minute (previewing and testing); `?quote=id` requests a quotation. */
function readParams(): { at: number | null; quote: string | null } {
  if (typeof location === 'undefined') return { at: null, quote: null };
  const p = new URLSearchParams(location.search);
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(p.get('at') ?? '');
  return { at: m ? Number(m[1]) * 60 + Number(m[2]) : null, quote: p.get('quote') };
}
const PARAMS = readParams();

const SHIFTS: [number, number][] = [
  [0, 0], [4, 2], [-3, 5], [-6, -1], [3, -4], [6, 4], [-4, -5], [1, 6], [-6, 3], [5, -2],
];

function ClockFace({ settings, now }: { settings: Settings; now: Date }) {
  const [tick, setTick] = useState(now);
  useEffect(() => setTick(now), [now]);
  useEffect(() => {
    if (!settings.showSeconds || PARAMS.at !== null) return;
    const t = createMinuteTicker({ onMinute: () => undefined, onSecond: (d) => setTick(d) });
    return () => t.stop();
  }, [settings.showSeconds]);
  if (!settings.showClock || settings.displayMode === 'minimal') return null;
  const date = settings.showDate
    ? new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(tick)
    : null;
  return (
    <div className="clock__time" aria-hidden="true">
      <time dateTime={tick.toISOString()}>{formatClock(tick, { hour12: settings.hour12, seconds: settings.showSeconds })}</time>
      {date ? <span className="clock__date">{date}</span> : null}
    </div>
  );
}

export default function App() {
  const [settings, update, replace] = useSettings();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [realNow, setNow] = useState(() => new Date());
  const now = useMemo(() => {
    if (PARAMS.at === null) return realNow;
    const d = new Date(realNow);
    d.setHours(Math.floor(PARAMS.at / 60), PARAMS.at % 60, 0, 0);
    return d;
  }, [realNow]);
  const minute = minuteOfDay(now);
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const prefersReduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const [route, go] = useHashRoute();
  const [controlsVisible, showControls, hideControls] = useAutoHide(settings.autoHideSeconds);
  const [snap, setSnap] = useState<EngineSnapshot | null>(null);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [sharing, setSharing] = useState<Quote | null>(null);
  const [toast, setToast] = useState<{ text: string; action?: { label: string; run: () => void } } | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  const wakeStatus = useWakeLock(settings.wakeLock && route === '');

  const engine = useMemo(() => {
    const e = new ClockEngine(quoteStore, dbPromise, () => settingsRef.current);
    if (PARAMS.quote) e.prefer(PARAMS.quote);
    return e;
  }, []);

  // Minute-boundary ticker
  useEffect(() => {
    const t = createMinuteTicker({ onMinute: (d) => setNow(d) });
    return () => t.stop();
  }, []);

  useEffect(() => engine.subscribe(setSnap), [engine]);
  useEffect(() => {
    void engine.setMinute(minute);
  }, [engine, minute]);

  // Re-filter on preference changes that affect eligibility
  const filterKey = [
    settings.familyFriendly, settings.excludedFlags.join(), settings.allowAmbiguous, settings.allowApproximate,
    settings.includeTranslations, settings.maxLength,
  ].join('|');
  const firstFilter = useRef(true);
  useEffect(() => {
    if (firstFilter.current) {
      firstFilter.current = false;
      return;
    }
    engine.applyFilters();
  }, [engine, filterKey]);

  useEffect(() => {
    void dbPromise.then((db) => db.listFavorites()).then((f) => setFavorites(new Set(f.map((x) => x.id))));
  }, []);

  useEffect(() => onUpdateReady(() => setUpdateReady(true)), []);

  // iOS install hint, once
  useEffect(() => {
    if (!isIOS() || isStandalone()) return;
    let seen = false;
    try {
      seen = localStorage.getItem('plot-tickens:ios-hint') === '1';
    } catch {
      /* ignore */
    }
    if (seen) return;
    const t = setTimeout(() => {
      setToast({
        text: 'Install: tap Share, then “Add to Home Screen”.',
        action: { label: 'How', run: () => go('settings/install') },
      });
      try {
        localStorage.setItem('plot-tickens:ios-hint', '1');
      } catch {
        /* ignore */
      }
    }, 15000);
    return () => clearTimeout(t);
  }, [go]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 9000);
    return () => clearTimeout(t);
  }, [toast]);

  // ----- Theme -----
  const themeId = activeThemeId(settings, minute);
  const palette = resolveTheme(themeId, prefersDark);
  const colors = {
    bg: settings.customBg ?? palette.bg,
    fg: settings.customText ?? palette.text,
    hl: settings.customHighlight ?? palette.highlight,
    muted: palette.muted,
  };
  const night = nightActive(settings, minute) || settings.displayMode === 'bedside';
  const reduceMotion = settings.reduceMotion === 'on' || (settings.reduceMotion === 'system' && prefersReduced);

  useEffect(() => {
    const r = document.documentElement;
    r.style.setProperty('--bg', colors.bg);
    r.style.setProperty('--fg', colors.fg);
    r.style.setProperty('--hl', colors.hl);
    r.style.setProperty('--hl-color', colors.hl);
    r.style.setProperty('--muted', settings.customText ? `color-mix(in srgb, ${colors.fg} 62%, ${colors.bg})` : colors.muted);
    r.style.setProperty('--rule', `color-mix(in srgb, ${colors.fg} 16%, ${colors.bg})`);
    r.style.setProperty('--font', FONT_STACKS[settings.font]);
    r.style.setProperty('--weight', String(settings.fontWeight));
    r.dataset.dark = String(palette.dark);
    r.dataset.reduceMotion = String(reduceMotion);
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', colors.bg));
  }, [colors.bg, colors.fg, colors.hl, colors.muted, palette.dark, settings.font, settings.fontWeight, settings.customText, reduceMotion]);

  // ----- Actions -----
  const toggleFavorite = useCallback(async (q: Quote) => {
    const db = await dbPromise;
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(q.id)) {
        next.delete(q.id);
        void db.removeFavorite(q.id);
      } else {
        next.add(q.id);
        void db.putFavorite({ id: q.id, addedAt: Date.now(), quote: q });
      }
      return next;
    });
  }, []);

  const fullscreenSupported = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen && !isIOS();
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  const quote = snap?.quote ?? null;
  const isFav = quote ? favorites.has(quote.id) : false;

  // keyboard
  useEffect(() => {
    if (route !== '' || sharing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (target.closest('button, input, select, textarea')) {
        if (e.key === 'Escape') hideControls();
        else showControls();
        return;
      }
      switch (e.key) {
        case 'ArrowRight':
        case ' ':
        case 'n':
          e.preventDefault();
          engine.next();
          break;
        case 'ArrowLeft':
        case 'p':
          engine.previous();
          break;
        case 'f':
          if (quote) void toggleFavorite(quote);
          break;
        case 'l':
          go('library');
          return;
        case 's':
          go('settings');
          return;
        case 'Escape':
          hideControls();
          return;
        default:
          break;
      }
      showControls();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [route, sharing, engine, quote, toggleFavorite, go, showControls, hideControls]);

  const shift = settings.burnInShift ? SHIFTS[Math.floor(minute / 3) % SHIFTS.length] : [0, 0];
  const highlightClass = `hl-${settings.highlightStyle}`;

  const imageStyle = useMemo(
    () => ({ bg: colors.bg, fg: colors.fg, muted: colors.muted, hl: colors.hl, fontFamily: FONT_STACKS[settings.font] }),
    [colors.bg, colors.fg, colors.muted, colors.hl, settings.font],
  );

  const spoken = quote
    ? `${formatMinute(minute, settings.hour12)}. ${quote.text} — ${attributionLine(quote)}`
    : `${formatMinute(minute, settings.hour12)}.`;

  let stageContent;
  if (!snap || (snap.status === 'loading' && !quote)) {
    stageContent = <div className="loading-dots" aria-hidden="true">· · ·</div>;
  } else if (quote) {
    stageContent = (
      <FitBox scale={settings.fontScale} fitKey={`${quote.id}|${settings.displayMode}|${settings.showAttribution}|${settings.font}|${settings.fontWeight}|${settings.alignment}|${settings.highlightStyle}`}>
        <QuoteFigure quote={quote} settings={settings} />
      </FitBox>
    );
  } else {
    // Honest fallback: never present a quote from another minute as matching this one.
    const words = timeInWords(minute);
    const note =
      snap.status === 'error'
        ? 'The library could not be opened. Connect once to finish downloading it.'
        : snap.unfilteredTotal > 0
          ? 'No quotation for this minute matches your reading preferences.'
          : 'No literary quotation has been found for this minute — yet.';
    stageContent = (
      <FitBox scale={settings.fontScale * 0.8} fitKey={`fallback|${minute}|${snap.status}`}>
        <div className="fallback">
          <p className="fallback__words">It is {words}.</p>
          <p className="fallback__note">{note}</p>
        </div>
      </FitBox>
    );
  }

  return (
    <>
      <main
        className={`clock mode-${settings.displayMode} ${highlightClass}${controlsVisible ? '' : ' cursor-hidden'}`}
        onPointerUp={(e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          if ((e.target as HTMLElement).closest('.controls__bar')) return;
          if (controlsVisible) hideControls();
          else showControls();
        }}
        onPointerMove={(e) => e.pointerType === 'mouse' && showControls()}
        aria-label="Literary clock"
      >
        <div className="clock__inner" style={{ ['--shift-x' as string]: `${shift[0]}px`, ['--shift-y' as string]: `${shift[1]}px` }}>
          <ClockFace settings={settings} now={now} />
          <div className="clock__stage">{stageContent}</div>
        </div>
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {spoken}
        </p>
      </main>

      <div
        className="night-veil"
        aria-hidden="true"
        style={{ opacity: night ? 1 - (settings.displayMode === 'bedside' && settings.nightMode === 'off' ? 0.7 : settings.nightDim) : 0 }}
      />

      {route === '' ? (
        <div className="controls" data-visible={controlsVisible} onFocusCapture={showControls}>
          <div className="controls__bar controls__bar--top" role="toolbar" aria-label="Clock menu">
            <button className="icon-btn" onClick={() => go('library')} aria-label="Library" tabIndex={controlsVisible ? 0 : -1}>
              <Icon name="book" />
              <span>Library</span>
            </button>
            <span style={{ display: 'flex', gap: 6 }}>
              {settings.wakeLock && wakeStatus !== 'active' ? (
                <span className="controls__count" title="Screen may sleep">{wakeStatus === 'unsupported' ? 'no wake lock' : 'screen may sleep'}</span>
              ) : null}
              {fullscreenSupported ? (
                <button className="icon-btn" onClick={toggleFullscreen} aria-label="Full screen" tabIndex={controlsVisible ? 0 : -1}>
                  <Icon name="expand" />
                </button>
              ) : null}
              <button className="icon-btn" onClick={() => go('settings')} aria-label="Settings" tabIndex={controlsVisible ? 0 : -1}>
                <Icon name="settings" />
              </button>
            </span>
          </div>
          <div className="controls__bar controls__bar--bottom" role="toolbar" aria-label="Quotation">
            <button className="icon-btn" onClick={() => engine.previous()} disabled={!snap || snap.position <= 1} aria-label="Previous quotation" tabIndex={controlsVisible ? 0 : -1}>
              <Icon name="prev" />
            </button>
            <span className="controls__count" aria-label={`${snap?.total ?? 0} quotations for this minute`}>
              {snap && snap.total > 0 ? `${Math.min(snap.position, snap.total)} / ${snap.total}` : '0'}
            </span>
            <button className="icon-btn" onClick={() => engine.next()} disabled={!snap || snap.total <= 1} aria-label="Next quotation" tabIndex={controlsVisible ? 0 : -1}>
              <Icon name="next" />
            </button>
            <button
              className="icon-btn"
              onClick={() => quote && void toggleFavorite(quote)}
              disabled={!quote}
              aria-pressed={isFav}
              aria-label={isFav ? 'Remove from favourites' : 'Add to favourites'}
              tabIndex={controlsVisible ? 0 : -1}
            >
              <Icon name="heart" />
            </button>
            <button className="icon-btn" onClick={() => quote && setSharing(quote)} disabled={!quote} aria-label="Share" tabIndex={controlsVisible ? 0 : -1}>
              <Icon name="share" />
            </button>
          </div>
        </div>
      ) : null}

      {sharing ? <ShareDialog quote={sharing} style={imageStyle} hour12={settings.hour12} onClose={() => setSharing(null)} /> : null}

      <Suspense fallback={route ? <div className="sheet" aria-busy="true" /> : null}>
        {route.startsWith('library') ? (
          <Library
            db={dbPromise}
            settings={settings}
            favorites={favorites}
            onToggleFavorite={toggleFavorite}
            onShare={setSharing}
            onClose={() => go('')}
            currentMinute={minute}
          />
        ) : null}
        {route.startsWith('settings') ? (
          <SettingsPanel
            settings={settings}
            update={update}
            replace={replace}
            db={dbPromise}
            store={quoteStore}
            engine={engine}
            wakeStatus={wakeStatus}
            initialSection={route.split('/')[1]}
            onClose={() => go('')}
          />
        ) : null}
      </Suspense>

      {updateReady ? (
        <div className="toast" role="status">
          A new edition is ready.
          <button onClick={() => applyUpdate()}>Reload</button>
          <button onClick={() => setUpdateReady(false)} aria-label="Dismiss">Later</button>
        </div>
      ) : toast ? (
        <div className="toast" role="status">
          {toast.text}
          {toast.action ? <button onClick={() => { toast.action!.run(); setToast(null); }}>{toast.action.label}</button> : null}
          <button onClick={() => setToast(null)} aria-label="Dismiss">✕</button>
        </div>
      ) : null}
    </>
  );
}
