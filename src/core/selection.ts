/**
 * Quote selection: filter candidates for the current minute, then draw from a
 * persistent per-minute "shuffle bag" so nothing repeats until every eligible
 * alternative has been shown. Pure functions + a small state object that is
 * persisted to IndexedDB between sessions.
 */
import type { Quote } from './types';
import type { Settings } from './settings';
import { effectiveExcludedFlags } from './settings';

export interface RotationState {
  /** minute → ids already shown in the current cycle */
  seen: Record<string, string[]>;
  /** minute → last id shown (avoids back-to-back repeats across cycle resets) */
  last: Record<string, string>;
}

export const emptyRotation = (): RotationState => ({ seen: {}, last: {} });

export function filterQuotes(quotes: Quote[], s: Settings, minute: number): Quote[] {
  const excluded = effectiveExcludedFlags(s);
  const isPM = minute >= 720;
  return quotes.filter((q) => {
    if (q.flags.some((f) => excluded.includes(f))) return false;
    if (!s.allowApproximate && q.approximate) return false;
    if (!s.includeTranslations && q.translator) return false;
    if (s.maxLength && q.text.length > s.maxLength) return false;
    if (q.meridiem === 'am' && isPM) return false; // defensive: data is keyed by minute already
    if (q.meridiem === 'pm' && !isPM) return false;
    if (!s.allowAmbiguous && q.meridiem === 'ambiguous') return false;
    return true;
  });
}

/** Deterministic-enough PRNG hook for tests. */
export type Rng = () => number;

export function pickQuote(
  candidates: Quote[],
  minute: number,
  state: RotationState,
  mode: Settings['repeatMode'],
  rng: Rng = Math.random,
  excludeId?: string,
): { quote: Quote | null; state: RotationState } {
  if (candidates.length === 0) return { quote: null, state };
  const key = String(minute);
  if (candidates.length === 1) {
    return { quote: candidates[0], state: recordShown(state, key, candidates[0].id, candidates) };
  }
  if (mode === 'random') {
    const pool = candidates.filter((c) => c.id !== (excludeId ?? state.last[key]));
    const q = pool[Math.floor(rng() * pool.length)] ?? candidates[0];
    return { quote: q, state: { seen: state.seen, last: { ...state.last, [key]: q.id } } };
  }
  const ids = new Set(candidates.map((c) => c.id));
  let seen = (state.seen[key] ?? []).filter((id) => ids.has(id));
  let pool = candidates.filter((c) => !seen.includes(c.id));
  if (pool.length === 0) {
    // cycle exhausted: start again, but never repeat the one just shown
    seen = [];
    const avoid = excludeId ?? state.last[key];
    pool = candidates.filter((c) => c.id !== avoid);
  }
  if (excludeId) {
    const withoutCurrent = pool.filter((c) => c.id !== excludeId);
    if (withoutCurrent.length) pool = withoutCurrent;
  }
  const q = pool[Math.floor(rng() * pool.length)];
  return { quote: q, state: recordShown({ seen: { ...state.seen, [key]: seen }, last: state.last }, key, q.id, candidates) };
}

function recordShown(state: RotationState, key: string, id: string, candidates: Quote[]): RotationState {
  const prev = state.seen[key] ?? [];
  const nextSeen = prev.includes(id) ? prev : [...prev, id];
  // Once every candidate has been seen the bag is reset on the next draw (see pickQuote).
  void candidates;
  return { seen: { ...state.seen, [key]: nextSeen }, last: { ...state.last, [key]: id } };
}

/** Bound the persisted state so it never grows without limit (1,440 minutes × modest lists). */
export function compactRotation(state: RotationState, maxPerMinute = 400): RotationState {
  const seen: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(state.seen)) seen[k] = v.slice(-maxPerMinute);
  return { seen, last: { ...state.last } };
}
