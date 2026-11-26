/**
 * Glue between the minute ticker, the quote store, the rotation state and
 * persistence. Framework-agnostic so it can be unit-tested without React.
 */
import { QuoteStore } from './data';
import { compactRotation, emptyRotation, filterQuotes, pickQuote, type RotationState } from './selection';
import type { Settings } from './settings';
import type { Store } from './storage';
import type { Quote } from './types';

export type EngineStatus = 'loading' | 'ready' | 'empty' | 'error';

export interface EngineSnapshot {
  status: EngineStatus;
  minute: number;
  quote: Quote | null;
  /** eligible quotations for this minute after filtering */
  total: number;
  /** quotations for this minute before filtering */
  unfilteredTotal: number;
  /** position of the current quote in this minute's trail (for previous/next) */
  position: number;
  trailLength: number;
}

const ROTATION_KEY = 'rotation';

export class ClockEngine {
  private rotation: RotationState = emptyRotation();
  private rotationLoaded: Promise<void>;
  private candidates: Quote[] = [];
  private all: Quote[] = [];
  private trail: Quote[] = [];
  private pointer = -1;
  private minute = -1;
  private seq = 0;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private snap: EngineSnapshot = { status: 'loading', minute: -1, quote: null, total: 0, unfilteredTotal: 0, position: 0, trailLength: 0 };
  private listeners = new Set<(s: EngineSnapshot) => void>();
  /** A specific quotation requested by deep link (?quote=id); shown once if it matches the minute. */
  private preferId: string | null = null;

  prefer(id: string | null): void {
    this.preferId = id;
  }

  constructor(
    private quotes: QuoteStore,
    private db: Promise<Store>,
    private getSettings: () => Settings,
    private rng: () => number = Math.random,
  ) {
    this.rotationLoaded = db
      .then((s) => s.getKV<RotationState>(ROTATION_KEY))
      .then((r) => {
        if (r && typeof r === 'object' && r.seen && r.last) this.rotation = r;
      })
      .catch(() => undefined);
  }

  subscribe(fn: (s: EngineSnapshot) => void): () => void {
    this.listeners.add(fn);
    fn(this.snap);
    return () => this.listeners.delete(fn);
  }

  get snapshot(): EngineSnapshot {
    return this.snap;
  }

  private emit(patch: Partial<EngineSnapshot>) {
    this.snap = { ...this.snap, ...patch, position: this.pointer + 1, trailLength: this.trail.length };
    for (const l of this.listeners) l(this.snap);
  }

  /** Called on every minute boundary (and on resume). */
  async setMinute(minute: number): Promise<void> {
    if (minute === this.minute && this.snap.status !== 'error') return;
    const seq = ++this.seq;
    this.minute = minute;
    this.trail = [];
    this.pointer = -1;
    if (this.snap.minute !== minute) this.emit({ minute, status: this.snap.quote ? this.snap.status : 'loading' });
    try {
      const [quotes] = await Promise.all([this.quotes.quotesForMinute(minute), this.rotationLoaded]);
      if (seq !== this.seq) return;
      this.all = quotes;
      this.applyFilters(true);
      if (minute % 60 >= 57) this.quotes.prefetchHour(Math.floor(minute / 60) + 1);
    } catch {
      if (seq !== this.seq) return;
      this.all = [];
      this.candidates = [];
      this.emit({ status: 'error', quote: null, minute, total: 0, unfilteredTotal: 0 });
    }
  }

  /** Re-filter (after a settings change). Keeps the current quote if still eligible. */
  applyFilters(forcePick = false): void {
    const s = this.getSettings();
    this.candidates = filterQuotes(this.all, s, this.minute);
    const current = this.snap.quote;
    const stillValid = !forcePick && current && current.minute === this.minute && this.candidates.some((c) => c.id === current.id);
    if (stillValid) {
      this.emit({ total: this.candidates.length, unfilteredTotal: this.all.length });
      return;
    }
    this.trail = [];
    this.pointer = -1;
    if (this.candidates.length === 0) {
      this.emit({ status: 'empty', quote: null, total: 0, unfilteredTotal: this.all.length, minute: this.minute });
      return;
    }
    this.advance();
  }

  private advance(): void {
    const s = this.getSettings();
    const current = this.trail[this.pointer];
    const preferred = this.preferId ? this.candidates.find((c) => c.id === this.preferId) : undefined;
    if (preferred) {
      this.preferId = null;
      this.trail = [...this.trail.slice(0, this.pointer + 1), preferred];
      this.pointer = this.trail.length - 1;
      this.emit({ status: 'ready', quote: preferred, total: this.candidates.length, unfilteredTotal: this.all.length, minute: this.minute });
      return;
    }
    const { quote, state } = pickQuote(this.candidates, this.minute, this.rotation, s.repeatMode, this.rng, current?.id);
    if (!quote) return;
    this.rotation = state;
    this.trail = this.trail.slice(0, this.pointer + 1);
    this.trail.push(quote);
    this.pointer = this.trail.length - 1;
    this.persist(quote);
    this.emit({ status: 'ready', quote, total: this.candidates.length, unfilteredTotal: this.all.length, minute: this.minute });
  }

  next(): void {
    if (this.candidates.length === 0) return;
    if (this.pointer < this.trail.length - 1) {
      this.pointer++;
      this.emit({ quote: this.trail[this.pointer] });
      return;
    }
    if (this.candidates.length === 1) {
      this.emit({});
      return;
    }
    this.advance();
  }

  previous(): void {
    if (this.pointer > 0) {
      this.pointer--;
      this.emit({ quote: this.trail[this.pointer] });
    }
  }

  async resetRotation(): Promise<void> {
    this.rotation = emptyRotation();
    const db = await this.db;
    await db.setKV(ROTATION_KEY, this.rotation);
  }

  private persist(quote: Quote): void {
    void this.db.then((db) => db.addHistory({ id: quote.id, minute: quote.minute, shownAt: Date.now(), quote })).catch(() => undefined);
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      void this.db.then((db) => db.setKV(ROTATION_KEY, compactRotation(this.rotation))).catch(() => undefined);
    }, 1500);
  }

  /** For tests: flush pending writes immediately. */
  async flush(): Promise<void> {
    clearTimeout(this.saveTimer);
    const db = await this.db;
    await db.setKV(ROTATION_KEY, compactRotation(this.rotation));
  }
}
