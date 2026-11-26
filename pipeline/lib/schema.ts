import type { Meridiem } from './timeParse.ts';
import type { ContentFlag } from './text.ts';

/** One candidate quotation, as emitted by any importer (JSON Lines). */
export interface CandidateRecord {
  /** Key into pipeline/sources.json */
  source: string;
  /** Stable identifier of the work within the source, e.g. a repository slug. */
  workId: string;
  quote: string;
  phrase: string;
  /** Offsets of `phrase` within `quote` (UTF-16 code units, as in JS). */
  phraseStart: number;
  phraseEnd: number;
  /** Minutes of the day (0–1439) this quote can represent. */
  minutes: number[];
  meridiem: Meridiem;
  approximate: boolean;
  author: string;
  title: string;
  /** Story/poem title when the work is a collection. */
  part?: string;
  translator?: string;
  year?: number;
  sourceUrl?: string;
  license: string;
  provenance?: Record<string, string>;
  flags: ContentFlag[];
}

export interface SourceConfig {
  key: string;
  name: string;
  url: string;
  license: string;
  licenseUrl?: string;
  /** include → shipped in the default database; exclude → reported only. */
  policy: 'include' | 'exclude';
  reason: string;
  attribution: string;
}
