import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, activeThemeId, inWindow, loadSettings, nightActive, sanitizeSettings, saveSettings, type KV } from '../src/core/settings';
import { HISTORY_LIMIT, openStore } from '../src/core/storage';
import { q } from './helpers';

const memKV = (): KV => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
};

describe('preferences', () => {
  it('persist and reload', () => {
    const kv = memKV();
    saveSettings({ ...DEFAULT_SETTINGS, theme: 'midnight', hour12: false, fontScale: 0.8 }, kv);
    const s = loadSettings(kv);
    expect(s.theme).toBe('midnight');
    expect(s.hour12).toBe(false);
    expect(s.fontScale).toBe(0.8);
  });

  it('reject malformed or hostile imports field by field', () => {
    const s = sanitizeSettings({ theme: 'neon', fontScale: 99, customBg: 'red; background:url(x)', excludedFlags: ['slur', 'bogus'], themeSchedule: { dayStart: '25:00' } });
    expect(s.theme).toBe('paper');
    expect(s.fontScale).toBe(1.2);
    expect(s.customBg).toBeNull();
    expect(s.excludedFlags).toEqual(['slur']);
    expect(s.themeSchedule.dayStart).toBe('07:00');
  });

  it('fall back to defaults on corrupt storage', () => {
    const kv = memKV();
    kv.setItem('plot-tickens:settings', '{not json');
    expect(loadSettings(kv)).toEqual(DEFAULT_SETTINGS);
  });

  it('schedule windows wrap midnight', () => {
    expect(inWindow(23 * 60, 21 * 60, 7 * 60)).toBe(true);
    expect(inWindow(3 * 60, 21 * 60, 7 * 60)).toBe(true);
    expect(inWindow(12 * 60, 21 * 60, 7 * 60)).toBe(false);
    const s = { ...DEFAULT_SETTINGS, nightMode: 'scheduled' as const, themeSchedule: { ...DEFAULT_SETTINGS.themeSchedule, enabled: true } };
    expect(activeThemeId(s, 22 * 60)).toBe('midnight');
    expect(activeThemeId(s, 9 * 60)).toBe('paper');
    expect(nightActive(s, 2 * 60)).toBe(true);
    expect(nightActive(s, 14 * 60)).toBe(false);
  });
});

describe('IndexedDB store', () => {
  it('keeps favourites across connections', async () => {
    const f = new IDBFactory();
    const a = await openStore(f);
    await a.putFavorite({ id: 'x', addedAt: 1, quote: q('x', 10) });
    await a.putFavorite({ id: 'y', addedAt: 2, quote: q('y', 11) });
    await a.removeFavorite('x');
    const b = await openStore(f);
    expect((await b.listFavorites()).map((e) => e.id)).toEqual(['y']);
  });

  it('bounds history and lists newest first', async () => {
    const s = await openStore(new IDBFactory());
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) await s.addHistory({ id: `h${i}`, minute: i % 1440, shownAt: i, quote: q(`h${i}`, i % 1440) });
    const h = await s.listHistory();
    expect(h.length).toBe(HISTORY_LIMIT);
    expect(h[0].id).toBe(`h${HISTORY_LIMIT + 4}`);
    await s.clearHistory();
    expect(await s.listHistory()).toEqual([]);
  });

  it('falls back to memory when IndexedDB is unavailable', async () => {
    const s = await openStore(undefined);
    await s.setKV('k', { a: 1 });
    expect(await s.getKV('k')).toEqual({ a: 1 });
  });
});
