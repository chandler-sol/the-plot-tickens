import type { ThemeId } from './themes';
import { CONTENT_FLAGS, type ContentFlag } from './types';

export type FontId = 'eb-garamond' | 'libre-baskerville' | 'literata' | 'crimson-pro' | 'cormorant' | 'source-serif' | 'system-serif';
export type HighlightStyle = 'bold' | 'bold-color' | 'underline' | 'marker' | 'small-caps';
export type DisplayMode = 'standard' | 'bedside' | 'minimal';
export type Alignment = 'left' | 'center' | 'justify';
export type RepeatMode = 'exhaust' | 'random';
export type NightMode = 'off' | 'on' | 'scheduled';

export interface Settings {
  version: 1;
  theme: ThemeId;
  font: FontId;
  /** multiplier applied to the automatically fitted size: 0.6 – 1.2 */
  fontScale: number;
  fontWeight: 300 | 400 | 500;
  alignment: Alignment;
  customBg: string | null;
  customText: string | null;
  customHighlight: string | null;
  highlightStyle: HighlightStyle;
  showAttribution: boolean;
  showClock: boolean;
  hour12: boolean;
  showSeconds: boolean;
  showDate: boolean;
  displayMode: DisplayMode;
  wakeLock: boolean;
  burnInShift: boolean;
  nightMode: NightMode;
  /** 0.2 – 0.9: apparent brightness while night mode is active */
  nightDim: number;
  themeSchedule: { enabled: boolean; dayTheme: ThemeId; nightTheme: ThemeId; dayStart: string; nightStart: string };
  /** Night-mode schedule uses the same night window */
  familyFriendly: boolean;
  excludedFlags: ContentFlag[];
  allowAmbiguous: boolean;
  allowApproximate: boolean;
  includeTranslations: boolean;
  maxLength: number | null;
  repeatMode: RepeatMode;
  autoHideSeconds: number;
  reduceMotion: 'system' | 'on' | 'off';
}

export const FAMILY_FRIENDLY_FLAGS: ContentFlag[] = ['slur', 'profanity', 'sexual', 'violence', 'drugs'];

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  theme: 'paper',
  font: 'eb-garamond',
  fontScale: 1,
  fontWeight: 400,
  alignment: 'left',
  customBg: null,
  customText: null,
  customHighlight: null,
  highlightStyle: 'bold',
  showAttribution: true,
  showClock: true,
  hour12: true,
  showSeconds: false,
  showDate: false,
  displayMode: 'standard',
  wakeLock: false,
  burnInShift: false,
  nightMode: 'off',
  nightDim: 0.55,
  themeSchedule: { enabled: false, dayTheme: 'paper', nightTheme: 'midnight', dayStart: '07:00', nightStart: '21:00' },
  familyFriendly: false,
  // Racial and ethnic slurs are common in older literature; hidden unless the reader opts in.
  excludedFlags: ['slur'],
  allowAmbiguous: true,
  allowApproximate: true,
  includeTranslations: true,
  maxLength: null,
  repeatMode: 'exhaust',
  autoHideSeconds: 4,
  reduceMotion: 'system',
};

const KEY = 'plot-tickens:settings';

const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const isTime = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const oneOf = <T extends string | number>(v: unknown, opts: readonly T[], d: T): T => (opts.includes(v as T) ? (v as T) : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const num = (v: unknown, min: number, max: number, d: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;

const THEME_IDS: ThemeId[] = ['paper', 'eink', 'parchment', 'oled', 'midnight', 'sepia', 'system'];
const FONTS: FontId[] = ['eb-garamond', 'libre-baskerville', 'literata', 'crimson-pro', 'cormorant', 'source-serif', 'system-serif'];

/** Validate and merge untrusted input (stored or imported) onto defaults. */
export function sanitizeSettings(input: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  const s = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const ts = (s.themeSchedule && typeof s.themeSchedule === 'object' ? s.themeSchedule : {}) as Record<string, unknown>;
  return {
    version: 1,
    theme: oneOf(s.theme, THEME_IDS, d.theme),
    font: oneOf(s.font, FONTS, d.font),
    fontScale: num(s.fontScale, 0.6, 1.2, d.fontScale),
    fontWeight: oneOf(s.fontWeight, [300, 400, 500] as const, d.fontWeight),
    alignment: oneOf(s.alignment, ['left', 'center', 'justify'] as const, d.alignment),
    customBg: isHex(s.customBg) ? s.customBg : null,
    customText: isHex(s.customText) ? s.customText : null,
    customHighlight: isHex(s.customHighlight) ? s.customHighlight : null,
    highlightStyle: oneOf(s.highlightStyle, ['bold', 'bold-color', 'underline', 'marker', 'small-caps'] as const, d.highlightStyle),
    showAttribution: bool(s.showAttribution, d.showAttribution),
    showClock: bool(s.showClock, d.showClock),
    hour12: bool(s.hour12, d.hour12),
    showSeconds: bool(s.showSeconds, d.showSeconds),
    showDate: bool(s.showDate, d.showDate),
    displayMode: oneOf(s.displayMode, ['standard', 'bedside', 'minimal'] as const, d.displayMode),
    wakeLock: bool(s.wakeLock, d.wakeLock),
    burnInShift: bool(s.burnInShift, d.burnInShift),
    nightMode: oneOf(s.nightMode, ['off', 'on', 'scheduled'] as const, d.nightMode),
    nightDim: num(s.nightDim, 0.2, 0.9, d.nightDim),
    themeSchedule: {
      enabled: bool(ts.enabled, d.themeSchedule.enabled),
      dayTheme: oneOf(ts.dayTheme, THEME_IDS, d.themeSchedule.dayTheme),
      nightTheme: oneOf(ts.nightTheme, THEME_IDS, d.themeSchedule.nightTheme),
      dayStart: isTime(ts.dayStart) ? ts.dayStart : d.themeSchedule.dayStart,
      nightStart: isTime(ts.nightStart) ? ts.nightStart : d.themeSchedule.nightStart,
    },
    familyFriendly: bool(s.familyFriendly, d.familyFriendly),
    excludedFlags: Array.isArray(s.excludedFlags)
      ? CONTENT_FLAGS.filter((f) => (s.excludedFlags as unknown[]).includes(f))
      : [...d.excludedFlags],
    allowAmbiguous: bool(s.allowAmbiguous, d.allowAmbiguous),
    allowApproximate: bool(s.allowApproximate, d.allowApproximate),
    includeTranslations: bool(s.includeTranslations, d.includeTranslations),
    maxLength: s.maxLength === null || s.maxLength === undefined ? null : num(s.maxLength, 80, 2000, 400),
    repeatMode: oneOf(s.repeatMode, ['exhaust', 'random'] as const, d.repeatMode),
    autoHideSeconds: num(s.autoHideSeconds, 2, 30, d.autoHideSeconds),
    reduceMotion: oneOf(s.reduceMotion, ['system', 'on', 'off'] as const, d.reduceMotion),
  };
}

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

function safeStorage(): KV | null {
  try {
    const ls = globalThis.localStorage;
    const probe = '__probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
}

/**
 * Settings live in localStorage (small, synchronous — lets the clock paint
 * with the right theme on the very first frame). Larger structured data
 * (history, favourites, rotation state) lives in IndexedDB.
 */
export function loadSettings(kv: KV | null = safeStorage()): Settings {
  try {
    const raw = kv?.getItem(KEY);
    return sanitizeSettings(raw ? JSON.parse(raw) : {});
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings, kv: KV | null = safeStorage()): void {
  try {
    kv?.setItem(KEY, JSON.stringify(s));
  } catch {
    /* quota or private mode: settings stay in memory for this session */
  }
}

export function clearSettings(kv: KV | null = safeStorage()): void {
  kv?.removeItem(KEY);
}

export function parseHHMM(s: string): number {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

/** Is `minute` within [start, end) on a circular 24h dial? */
export function inWindow(minute: number, start: number, end: number): boolean {
  return start <= end ? minute >= start && minute < end : minute >= start || minute < end;
}

export function isNightWindow(s: Settings, minute: number): boolean {
  return inWindow(minute, parseHHMM(s.themeSchedule.nightStart), parseHHMM(s.themeSchedule.dayStart));
}

export function activeThemeId(s: Settings, minute: number): ThemeId {
  if (s.displayMode === 'bedside' && !s.themeSchedule.enabled && (s.theme === 'paper' || s.theme === 'eink' || s.theme === 'parchment' || s.theme === 'sepia')) {
    return 'oled';
  }
  if (!s.themeSchedule.enabled) return s.theme;
  return isNightWindow(s, minute) ? s.themeSchedule.nightTheme : s.themeSchedule.dayTheme;
}

export function nightActive(s: Settings, minute: number): boolean {
  if (s.nightMode === 'on') return true;
  if (s.nightMode === 'scheduled') return isNightWindow(s, minute);
  return false;
}

export function effectiveExcludedFlags(s: Settings): ContentFlag[] {
  return s.familyFriendly ? [...FAMILY_FRIENDLY_FLAGS] : s.excludedFlags;
}
