/** Local-time helpers and a minute-boundary scheduler that survives sleep, backgrounding and timezone changes. */

export const MINUTES_PER_DAY = 1440;

export function minuteOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** Milliseconds until the next local minute boundary (always in (0, 60000]). */
export function msUntilNextMinute(d: Date): number {
  const ms = 60_000 - (d.getSeconds() * 1000 + d.getMilliseconds());
  return ms <= 0 ? 60_000 : ms;
}

export function msUntilNextSecond(d: Date): number {
  return 1000 - d.getMilliseconds();
}

/** A fingerprint of the current zone rules; changes when the device timezone or DST offset changes. */
export function zoneFingerprint(d: Date = new Date()): string {
  let tz = '';
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    /* very old engines */
  }
  return `${tz}|${d.getTimezoneOffset()}`;
}

export function formatClock(d: Date, opts: { hour12: boolean; seconds: boolean }): string {
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  let suffix = '';
  if (opts.hour12) {
    suffix = h < 12 ? ' AM' : ' PM';
    h = h % 12 || 12;
  }
  const hh = opts.hour12 ? String(h) : String(h).padStart(2, '0');
  return `${hh}:${m}${opts.seconds ? `:${s}` : ''}${suffix}`;
}

export function formatMinute(minute: number, hour12: boolean): string {
  const d = new Date(2000, 0, 1, Math.floor(minute / 60), minute % 60);
  return formatClock(d, { hour12, seconds: false });
}

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty'];

function numberWords(n: number): string {
  if (n < 20) return ONES[n];
  const t = TENS[Math.floor(n / 10)];
  return n % 10 ? `${t}-${ONES[n % 10]}` : t;
}

/** "twenty-three minutes to five in the afternoon" — used for the honest fallback display. */
export function timeInWords(minute: number): string {
  const h24 = Math.floor(minute / 60);
  const m = minute % 60;
  if (m === 0 && h24 === 0) return 'midnight';
  if (m === 0 && h24 === 12) return 'noon';
  const dialHour = (h: number) => {
    const x = ((h % 24) + 24) % 24;
    if (x === 0) return 'midnight';
    if (x === 12) return 'noon';
    return numberWords(x % 12);
  };
  const period = (h: number) => {
    const x = ((h % 24) + 24) % 24;
    if (x === 0 || x === 12) return '';
    if (x < 12) return ' in the morning';
    if (x < 18) return ' in the afternoon';
    return x < 21 ? ' in the evening' : ' at night';
  };
  if (m === 0) return `${dialHour(h24)} o’clock${period(h24)}`;
  if (m === 15) return `a quarter past ${dialHour(h24)}${period(h24)}`;
  if (m === 30) return `half past ${dialHour(h24)}${period(h24)}`;
  if (m === 45) return `a quarter to ${dialHour(h24 + 1)}${period(h24 + 1)}`;
  if (m < 30) return `${numberWords(m)} minute${m === 1 ? '' : 's'} past ${dialHour(h24)}${period(h24)}`;
  const to = 60 - m;
  return `${numberWords(to)} minute${to === 1 ? '' : 's'} to ${dialHour(h24 + 1)}${period(h24 + 1)}`;
}

/** Minimal event-target shape (lets tests pass simple fakes for document/window). */
export interface EventSourceLike {
  addEventListener(type: string, handler: () => void): void;
  removeEventListener(type: string, handler: () => void): void;
}

export interface TickerOptions {
  /** Called with the new Date whenever the displayed minute (or zone) changes. */
  onMinute: (now: Date) => void;
  /** Optional per-second callback (only while visible). */
  onSecond?: (now: Date) => void;
  now?: () => Date;
  /** Injected for tests. */
  doc?: EventSourceLike & { readonly visibilityState: DocumentVisibilityState };
  win?: EventSourceLike;
}

/**
 * Schedules work exactly at local minute boundaries using a one-shot timeout
 * re-armed after each fire (never a fixed 60s interval, which drifts and is
 * frozen during sleep). On resume (visibilitychange / pageshow / focus) the
 * minute is recomputed immediately and the timer re-armed.
 */
export function createMinuteTicker(opts: TickerOptions): { stop: () => void; resync: () => void } {
  const now = opts.now ?? (() => new Date());
  const doc: TickerOptions['doc'] = opts.doc ?? (typeof document !== 'undefined' ? document : undefined);
  const win: TickerOptions['win'] = opts.win ?? (typeof window !== 'undefined' ? window : undefined);
  let minuteTimer: ReturnType<typeof setTimeout> | undefined;
  let secondTimer: ReturnType<typeof setTimeout> | undefined;
  let lastKey = '';
  let stopped = false;

  const keyFor = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()} ${minuteOfDay(d)} ${zoneFingerprint(d)}`;

  const check = () => {
    const d = now();
    const key = keyFor(d);
    if (key !== lastKey) {
      lastKey = key;
      opts.onMinute(d);
    }
    return d;
  };

  const armMinute = () => {
    clearTimeout(minuteTimer);
    if (stopped) return;
    const d = check();
    // +25ms guards against timers that fire a hair early.
    minuteTimer = setTimeout(armMinute, msUntilNextMinute(d) + 25);
  };

  const armSecond = () => {
    clearTimeout(secondTimer);
    if (stopped || !opts.onSecond) return;
    if (doc && doc.visibilityState === 'hidden') return;
    const d = now();
    opts.onSecond(d);
    secondTimer = setTimeout(armSecond, msUntilNextSecond(d) + 5);
  };

  const resync = () => {
    armMinute();
    armSecond();
  };

  const onVisibility = () => {
    if (!doc || doc.visibilityState === 'visible') resync();
    else clearTimeout(secondTimer);
  };

  doc?.addEventListener('visibilitychange', onVisibility);
  win?.addEventListener('pageshow', resync);
  win?.addEventListener('focus', resync);
  resync();

  return {
    resync,
    stop: () => {
      stopped = true;
      clearTimeout(minuteTimer);
      clearTimeout(secondTimer);
      doc?.removeEventListener('visibilitychange', onVisibility);
      win?.removeEventListener('pageshow', resync);
      win?.removeEventListener('focus', resync);
    },
  };
}
