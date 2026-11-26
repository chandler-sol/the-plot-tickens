import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMinuteTicker, formatClock, minuteOfDay, msUntilNextMinute, timeInWords, zoneFingerprint } from '../src/core/time';

describe('minute arithmetic', () => {
  it('computes the minute of the day', () => {
    expect(minuteOfDay(new Date(2026, 0, 1, 0, 0))).toBe(0);
    expect(minuteOfDay(new Date(2026, 0, 1, 12, 0))).toBe(720);
    expect(minuteOfDay(new Date(2026, 0, 1, 23, 59))).toBe(1439);
  });

  it('measures time to the next boundary', () => {
    expect(msUntilNextMinute(new Date(2026, 0, 1, 10, 0, 59, 900))).toBe(100);
    expect(msUntilNextMinute(new Date(2026, 0, 1, 10, 0, 0, 0))).toBe(60000);
  });

  it('formats 12- and 24-hour clocks around midnight and noon', () => {
    expect(formatClock(new Date(2026, 0, 1, 0, 5), { hour12: true, seconds: false })).toBe('12:05 AM');
    expect(formatClock(new Date(2026, 0, 1, 12, 5), { hour12: true, seconds: false })).toBe('12:05 PM');
    expect(formatClock(new Date(2026, 0, 1, 0, 5, 9), { hour12: false, seconds: true })).toBe('00:05:09');
  });

  it('writes the fallback time in words', () => {
    expect(timeInWords(0)).toBe('midnight');
    expect(timeInWords(720)).toBe('noon');
    expect(timeInWords(15 * 60 + 2)).toBe('two minutes past three in the afternoon');
    expect(timeInWords(16 * 60 + 37)).toBe('twenty-three minutes to five in the afternoon');
    expect(timeInWords(23 * 60 + 45)).toBe('a quarter to midnight');
    expect(timeInWords(11 * 60 + 59)).toBe('one minute to noon');
  });
});

describe('daylight saving and timezone changes (America/New_York)', () => {
  it('spring forward: 01:59 EST is followed by 03:00 EDT', () => {
    const before = new Date('2026-03-08T06:59:00Z'); // 01:59 EST
    const after = new Date(before.getTime() + 60_000);
    expect(minuteOfDay(before)).toBe(119);
    expect(minuteOfDay(after)).toBe(180);
    expect(zoneFingerprint(before)).not.toBe(zoneFingerprint(after));
  });

  it('fall back: 01:59 EDT is followed by 01:00 EST', () => {
    const before = new Date('2026-11-01T05:59:00Z');
    const after = new Date(before.getTime() + 60_000);
    expect(minuteOfDay(before)).toBe(119);
    expect(minuteOfDay(after)).toBe(60);
  });

  it('detects a device timezone change', () => {
    const t = new Date('2026-07-01T12:00:00Z');
    const ny = zoneFingerprint(t);
    process.env.TZ = 'Europe/London';
    try {
      expect(zoneFingerprint(t)).not.toBe(ny);
      expect(minuteOfDay(t)).toBe(13 * 60);
    } finally {
      process.env.TZ = 'America/New_York';
    }
  });
});

describe('minute ticker', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function fakeDoc() {
    const handlers: Record<string, () => void> = {};
    return {
      visibilityState: 'visible' as DocumentVisibilityState,
      addEventListener: (t: string, h: () => void) => void (handlers[t] = h),
      removeEventListener: () => undefined,
      fire: (t: string) => handlers[t]?.(),
      handlers,
    };
  }

  it('fires at each minute boundary rather than every 60s from start', () => {
    vi.setSystemTime(new Date(2026, 0, 1, 10, 0, 42, 0));
    const seen: number[] = [];
    const doc = fakeDoc();
    const t = createMinuteTicker({ onMinute: (d) => seen.push(minuteOfDay(d)), doc, win: doc });
    expect(seen).toEqual([600]);
    vi.advanceTimersByTime(17_900);
    expect(seen).toEqual([600]);
    vi.advanceTimersByTime(200);
    expect(seen).toEqual([600, 601]);
    vi.advanceTimersByTime(60_000);
    expect(seen).toEqual([600, 601, 602]);
    t.stop();
  });

  it('crosses midnight', () => {
    vi.setSystemTime(new Date(2026, 0, 1, 23, 59, 30));
    const seen: number[] = [];
    const doc = fakeDoc();
    const t = createMinuteTicker({ onMinute: (d) => seen.push(minuteOfDay(d)), doc, win: doc });
    vi.advanceTimersByTime(31_000);
    expect(seen).toEqual([1439, 0]);
    t.stop();
  });

  it('resynchronises immediately on resume after sleep', () => {
    vi.setSystemTime(new Date(2026, 0, 1, 10, 0, 0));
    const seen: number[] = [];
    const doc = fakeDoc();
    const t = createMinuteTicker({ onMinute: (d) => seen.push(minuteOfDay(d)), doc, win: doc });
    // Simulate a suspended device: the wall clock jumps 47 minutes, timers did not run.
    vi.setSystemTime(new Date(2026, 0, 1, 10, 47, 12));
    doc.fire('visibilitychange');
    expect(seen).toEqual([600, 647]);
    t.stop();
  });

  it('re-emits the same minute when the timezone changes', () => {
    vi.setSystemTime(new Date('2026-07-01T16:00:10Z'));
    const seen: string[] = [];
    const doc = fakeDoc();
    const t = createMinuteTicker({ onMinute: (d) => seen.push(`${minuteOfDay(d)}`), doc, win: doc });
    process.env.TZ = 'America/Chicago';
    try {
      doc.fire('focus');
      expect(seen).toEqual([String(12 * 60), String(11 * 60)]);
    } finally {
      process.env.TZ = 'America/New_York';
      t.stop();
    }
  });
});
