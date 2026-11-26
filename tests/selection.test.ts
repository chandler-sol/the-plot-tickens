import { describe, expect, it } from 'vitest';
import { emptyRotation, filterQuotes, pickQuote } from '../src/core/selection';
import { DEFAULT_SETTINGS } from '../src/core/settings';
import { q } from './helpers';

const rng = (() => {
  let s = 42;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
})();

describe('rotation', () => {
  it('shows every candidate once before repeating', () => {
    const cands = ['a', 'b', 'c', 'd', 'e'].map((id) => q(id, 600));
    let state = emptyRotation();
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = pickQuote(cands, 600, state, 'exhaust', rng);
      state = r.state;
      seen.push(r.quote!.id);
    }
    expect(new Set(seen).size).toBe(5);
    // next cycle never starts with the one just shown
    const r = pickQuote(cands, 600, state, 'exhaust', rng);
    expect(r.quote!.id).not.toBe(seen[4]);
    expect(r.state.seen['600']).toEqual([r.quote!.id]);
  });

  it('handles a minute with exactly one quotation', () => {
    const cands = [q('only', 61)];
    let state = emptyRotation();
    for (let i = 0; i < 3; i++) {
      const r = pickQuote(cands, 61, state, 'exhaust', rng);
      expect(r.quote!.id).toBe('only');
      state = r.state;
    }
  });

  it('returns null when nothing is eligible', () => {
    expect(pickQuote([], 5, emptyRotation(), 'exhaust').quote).toBeNull();
  });

  it('ignores stale ids from older database editions', () => {
    const state = { seen: { '600': ['gone1', 'gone2', 'a'] }, last: {} };
    const r = pickQuote([q('a', 600), q('b', 600)], 600, state, 'exhaust', rng);
    expect(r.quote!.id).toBe('b');
  });

  it('random mode avoids back-to-back repeats', () => {
    const cands = [q('a', 1), q('b', 1)];
    let state = emptyRotation();
    let last = '';
    for (let i = 0; i < 20; i++) {
      const r = pickQuote(cands, 1, state, 'random', rng);
      expect(r.quote!.id).not.toBe(last);
      last = r.quote!.id;
      state = r.state;
    }
  });
});

describe('filtering', () => {
  const cands = [
    q('plain', 900),
    q('slur', 900, { flags: ['slur'] }),
    q('violent', 900, { flags: ['violence'] }),
    q('approx', 900, { approximate: true }),
    q('pm', 900, { meridiem: 'pm' }),
    q('am', 900, { meridiem: 'am' }),
    q('trans', 900, { translator: 'Someone' }),
    q('long', 900, { text: 'x'.repeat(500) }),
  ];
  const ids = (s = DEFAULT_SETTINGS) => filterQuotes(cands, s, 900).map((c) => c.id);

  it('hides slurs by default', () => expect(ids()).not.toContain('slur'));
  it('family-friendly hides every flagged category', () => {
    const r = ids({ ...DEFAULT_SETTINGS, familyFriendly: true });
    expect(r).not.toContain('violent');
    expect(r).toContain('plain');
  });
  it('never shows an explicit AM quotation in the afternoon', () => expect(ids()).not.toContain('am'));
  it('can require explicit AM/PM', () => expect(ids({ ...DEFAULT_SETTINGS, allowAmbiguous: false })).toEqual(['pm']));
  it('respects approximate, translation and length preferences', () => {
    const r = ids({ ...DEFAULT_SETTINGS, allowApproximate: false, includeTranslations: false, maxLength: 160 });
    expect(r).toEqual(['plain', 'violent', 'pm']);
  });
});
