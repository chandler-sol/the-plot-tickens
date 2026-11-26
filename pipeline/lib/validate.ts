import type { CandidateRecord } from './schema.ts';

export const MIN_LEN = 25;
export const MAX_LEN = 600;

/** Returns a rejection reason, or null when the record is usable. */
export function validate(r: CandidateRecord): string | null {
  if (typeof r.quote !== 'string' || r.quote.length < MIN_LEN) return 'too-short';
  if (r.quote.length > MAX_LEN) return 'too-long';
  if (!r.author?.trim() || !r.title?.trim()) return 'missing-attribution';
  if (!r.license?.trim()) return 'missing-license';
  if (!Array.isArray(r.minutes) || r.minutes.length === 0 || r.minutes.some((m) => !Number.isInteger(m) || m < 0 || m > 1439)) return 'bad-minutes';
  if (r.quote.slice(r.phraseStart, r.phraseEnd) !== r.phrase || !r.phrase) return 'phrase-mismatch';
  return null;
}

