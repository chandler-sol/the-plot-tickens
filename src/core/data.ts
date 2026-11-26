/**
 * Lazy access to the sharded quotation database. Only the metadata (~small)
 * and the current hour's shard are fetched for the clock; the library loads
 * the remaining shards on demand. The service worker makes all of this
 * available offline.
 */
import { hydrate, type DatasetMeta, type Quote, type Shard } from './types';

export type Fetcher = (url: string) => Promise<unknown>;

const defaultFetcher: Fetcher = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
};

export class QuoteStore {
  private metaPromise?: Promise<DatasetMeta>;
  private shards = new Map<number, Promise<Shard>>();
  private readonly base: string;
  private readonly fetcher: Fetcher;
  /** Bounded cache: the clock needs at most two shards (current and next hour). */
  private readonly maxShards: number;

  constructor(opts: { base?: string; fetcher?: Fetcher; maxShards?: number } = {}) {
    this.base = (opts.base ?? `${import.meta.env?.BASE_URL ?? '/'}data`).replace(/\/$/, '');
    this.fetcher = opts.fetcher ?? defaultFetcher;
    this.maxShards = opts.maxShards ?? 3;
  }

  meta(): Promise<DatasetMeta> {
    this.metaPromise ??= (this.fetcher(`${this.base}/meta.json`) as Promise<DatasetMeta>).catch((e) => {
      this.metaPromise = undefined;
      throw e;
    });
    return this.metaPromise;
  }

  shard(hour: number): Promise<Shard> {
    let p = this.shards.get(hour);
    if (p) {
      // refresh LRU position
      this.shards.delete(hour);
      this.shards.set(hour, p);
      return p;
    }
    p = this.meta()
      .then((m) => this.fetcher(`${this.base}/${m.shardFiles?.[hour] ?? `q/${String(hour).padStart(2, '0')}.json`}`) as Promise<Shard>)
      .catch((e) => {
      this.shards.delete(hour);
      throw e;
    });
    this.shards.set(hour, p);
    while (this.shards.size > this.maxShards) {
      const oldest = this.shards.keys().next().value as number;
      this.shards.delete(oldest);
    }
    return p;
  }

  async quotesForMinute(minute: number): Promise<Quote[]> {
    const [meta, shard] = await Promise.all([this.meta(), this.shard(Math.floor(minute / 60))]);
    const rows = shard.minutes[String(minute)] ?? [];
    return rows.map((r) => hydrate(r, minute, meta));
  }

  /** Warm the next hour's shard shortly before it is needed. */
  prefetchHour(hour: number): void {
    void this.shard(((hour % 24) + 24) % 24).catch(() => undefined);
  }
}

/** Loads the entire database (library/search only). */
export async function loadAll(base?: string, fetcher: Fetcher = defaultFetcher): Promise<{ meta: DatasetMeta; quotes: Quote[] }> {
  const store = new QuoteStore({ base, fetcher, maxShards: 24 });
  const meta = await store.meta();
  const shards = await Promise.all(Array.from({ length: 24 }, (_, h) => store.shard(h)));
  const quotes: Quote[] = [];
  for (const s of shards) {
    for (const [k, rows] of Object.entries(s.minutes)) {
      const minute = Number(k);
      for (const r of rows) quotes.push(hydrate(r, minute, meta));
    }
  }
  quotes.sort((a, b) => a.minute - b.minute);
  return { meta, quotes };
}
