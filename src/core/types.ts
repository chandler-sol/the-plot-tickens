/** Shapes of the static quotation database served from /data (produced by pipeline/build.ts). */

export const CONTENT_FLAGS = ['slur', 'profanity', 'sexual', 'violence', 'drugs'] as const;
export type ContentFlag = (typeof CONTENT_FLAGS)[number];

export type MeridiemCode = 0 | 1 | 2; // 0 ambiguous, 1 explicit AM, 2 explicit PM

/** [id, quote, phraseStart, phraseEnd, workIndex, meridiem, flagBits, approximate] */
export type QuoteRow = [string, string, number, number, number, MeridiemCode, number, 0 | 1];

export interface Shard {
  hour: number;
  /** minute-of-day (as string key) → rows */
  minutes: Record<string, QuoteRow[]>;
}

/** [title, author, year, translator, part, sourceIndex, url] */
export type WorkRow = [string, string, number | null, string | null, string | null, number, string | null];

export interface SourceInfo {
  key: string;
  name: string;
  url: string;
  license: string;
  licenseUrl?: string;
  attribution: string;
}

export interface DatasetMeta {
  schema: 1;
  version: string;
  generatedAt: string;
  totalEntries: number;
  uniqueQuotes: number;
  /** quotations available for each minute 0..1439 */
  counts: number[];
  works: WorkRow[];
  sources: SourceInfo[];
  flags: ContentFlag[];
  /** content-hashed shard file names, index = hour (relative to /data/) */
  shardFiles?: string[];
}

export interface Quote {
  id: string;
  minute: number;
  text: string;
  phraseStart: number;
  phraseEnd: number;
  meridiem: 'ambiguous' | 'am' | 'pm';
  approximate: boolean;
  flags: ContentFlag[];
  title: string;
  author: string;
  year: number | null;
  translator: string | null;
  part: string | null;
  sourceName: string;
  sourceUrl: string | null;
  license: string;
}

export function flagsFromBits(bits: number): ContentFlag[] {
  return CONTENT_FLAGS.filter((_, i) => bits & (1 << i));
}

export function flagsToBits(flags: readonly string[]): number {
  return CONTENT_FLAGS.reduce((acc, f, i) => (flags.includes(f) ? acc | (1 << i) : acc), 0);
}

export function hydrate(row: QuoteRow, minute: number, meta: DatasetMeta): Quote {
  const [id, text, ps, pe, wi, mer, fb, ax] = row;
  const w = meta.works[wi];
  const src = meta.sources[w?.[5] ?? 0];
  return {
    id,
    minute,
    text,
    phraseStart: ps,
    phraseEnd: pe,
    meridiem: mer === 1 ? 'am' : mer === 2 ? 'pm' : 'ambiguous',
    approximate: ax === 1,
    flags: flagsFromBits(fb),
    title: w?.[0] ?? 'Unknown',
    author: w?.[1] ?? 'Unknown',
    year: w?.[2] ?? null,
    translator: w?.[3] ?? null,
    part: w?.[4] ?? null,
    sourceName: src?.name ?? '',
    sourceUrl: w?.[6] ?? null,
    license: src?.license ?? '',
  };
}
