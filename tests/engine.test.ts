import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { QuoteStore } from '../src/core/data';
import { ClockEngine, type EngineSnapshot } from '../src/core/engine';
import { DEFAULT_SETTINGS } from '../src/core/settings';
import { MemoryStore, openStore } from '../src/core/storage';
import { fakeDataset } from './helpers';

function setup(byMinute: Record<number, number>, db = Promise.resolve(new MemoryStore()) as ReturnType<typeof openStore>) {
  const { fetcher } = fakeDataset(byMinute);
  const store = new QuoteStore({ base: '/data', fetcher });
  let settings = { ...DEFAULT_SETTINGS };
  const engine = new ClockEngine(store, db, () => settings);
  let snap: EngineSnapshot = engine.snapshot;
  engine.subscribe((s) => (snap = s));
  return { engine, get snap() { return snap; }, setSettings: (s: typeof settings) => (settings = s) };
}

describe('clock engine', () => {
  it('shows a quotation that matches the current minute', async () => {
    const t = setup({ 182: 3 });
    await t.engine.setMinute(182);
    expect(t.snap.status).toBe('ready');
    expect(t.snap.quote!.minute).toBe(182);
    expect(t.snap.total).toBe(3);
  });

  it('reports an empty minute instead of borrowing another', async () => {
    const t = setup({ 182: 3 });
    await t.engine.setMinute(183);
    expect(t.snap.status).toBe('empty');
    expect(t.snap.quote).toBeNull();
  });

  it('cycles forward and back through the minute’s quotations', async () => {
    const t = setup({ 600: 3 });
    await t.engine.setMinute(600);
    const first = t.snap.quote!.id;
    t.engine.next();
    const second = t.snap.quote!.id;
    expect(second).not.toBe(first);
    t.engine.previous();
    expect(t.snap.quote!.id).toBe(first);
    t.engine.next();
    expect(t.snap.quote!.id).toBe(second);
  });

  it('transitions at each minute and across noon', async () => {
    const t = setup({ 719: 1, 720: 2 });
    await t.engine.setMinute(719);
    expect(t.snap.quote!.minute).toBe(719);
    await t.engine.setMinute(720);
    expect(t.snap.quote!.minute).toBe(720);
  });

  it('re-filters when preferences change', async () => {
    const t = setup({ 30: 2 });
    await t.engine.setMinute(30);
    t.setSettings({ ...DEFAULT_SETTINGS, allowAmbiguous: false });
    t.engine.applyFilters();
    expect(t.snap.status).toBe('empty');
    expect(t.snap.unfilteredTotal).toBe(2);
  });

  it('persists rotation between sessions (IndexedDB)', async () => {
    const factory = new IDBFactory();
    const a = setup({ 900: 4 }, openStore(factory));
    await a.engine.setMinute(900);
    const seen = [a.snap.quote!.id];
    a.engine.next();
    seen.push(a.snap.quote!.id);
    await a.engine.flush();
    // a new session over the same database
    const b = setup({ 900: 4 }, openStore(factory));
    await b.engine.setMinute(900);
    const third = b.snap.quote!.id;
    b.engine.next();
    const fourth = b.snap.quote!.id;
    expect(new Set([...seen, third, fourth]).size).toBe(4);
  });

  it('surfaces data errors (e.g. offline before first sync)', async () => {
    const store = new QuoteStore({ base: '/data', fetcher: async () => { throw new Error('offline'); } });
    const engine = new ClockEngine(store, Promise.resolve(new MemoryStore()), () => DEFAULT_SETTINGS);
    await engine.setMinute(10);
    expect(engine.snapshot.status).toBe('error');
  });
});
