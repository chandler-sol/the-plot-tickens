import type { DatasetMeta, Quote, QuoteRow, Shard } from '../src/core/types';

export function q(id: string, minute: number, extra: Partial<Quote> = {}): Quote {
  return {
    id, minute, text: `Quote ${id} at three o’clock.`, phraseStart: 14, phraseEnd: 27, meridiem: 'ambiguous', approximate: false,
    flags: [], title: 'A Book', author: 'An Author', year: 1900, translator: null, part: null, sourceName: 'Test', sourceUrl: null, license: 'PD',
    ...extra,
  };
}

/** A tiny in-memory dataset served through a fake fetcher. */
export function fakeDataset(byMinute: Record<number, number>): { fetcher: (url: string) => Promise<unknown>; meta: DatasetMeta } {
  const counts = new Array(1440).fill(0);
  const shards: Shard[] = Array.from({ length: 24 }, (_, h) => ({ hour: h, minutes: {} }));
  for (const [m, n] of Object.entries(byMinute)) {
    const minute = Number(m);
    counts[minute] = n;
    shards[Math.floor(minute / 60)].minutes[m] = Array.from({ length: n }, (_, i): QuoteRow => [
      `m${minute}q${i}`, `Number ${i}: it was three o’clock exactly.`, 17, 30, 0, 0, i === 0 ? 0 : 0, 0,
    ]);
  }
  const meta: DatasetMeta = {
    schema: 1, version: 'test', generatedAt: '', totalEntries: 0, uniqueQuotes: 0, counts,
    works: [['A Book', 'An Author', 1900, null, null, 0, null]],
    sources: [{ key: 't', name: 'Test', url: '', license: 'PD', attribution: '' }],
    flags: ['slur', 'profanity', 'sexual', 'violence', 'drugs'],
  };
  const fetcher = async (url: string) => {
    if (url.endsWith('meta.json')) return meta;
    const h = Number(/q\/(\d\d)\.json$/.exec(url)![1]);
    return shards[h];
  };
  return { fetcher, meta };
}
