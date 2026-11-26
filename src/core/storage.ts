/**
 * Small IndexedDB wrapper with an in-memory fallback (private browsing,
 * storage disabled, or very old engines). All methods are async and never throw
 * for storage-unavailable conditions.
 */
import type { Quote } from './types';

export interface HistoryEntry {
  key?: number;
  id: string;
  minute: number;
  shownAt: number;
  quote: Quote;
}

export interface FavoriteEntry {
  id: string;
  addedAt: number;
  quote: Quote;
}

export interface Store {
  getKV<T>(key: string): Promise<T | undefined>;
  setKV<T>(key: string, value: T): Promise<void>;
  addHistory(e: Omit<HistoryEntry, 'key'>): Promise<void>;
  listHistory(limit?: number): Promise<HistoryEntry[]>;
  clearHistory(): Promise<void>;
  putFavorite(e: FavoriteEntry): Promise<void>;
  removeFavorite(id: string): Promise<void>;
  listFavorites(): Promise<FavoriteEntry[]>;
  clearAll(): Promise<void>;
}

const DB_NAME = 'plot-tickens';
const DB_VERSION = 1;
export const HISTORY_LIMIT = 500;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

class IDBStore implements Store {
  constructor(private db: IDBDatabase) {}

  async getKV<T>(key: string) {
    const tx = this.db.transaction('kv', 'readonly');
    return (await req(tx.objectStore('kv').get(key))) as T | undefined;
  }

  async setKV<T>(key: string, value: T) {
    const tx = this.db.transaction('kv', 'readwrite');
    tx.objectStore('kv').put(value, key);
    await done(tx);
  }

  async addHistory(e: Omit<HistoryEntry, 'key'>) {
    const tx = this.db.transaction('history', 'readwrite');
    const os = tx.objectStore('history');
    os.add(e);
    const count = await req(os.count());
    if (count > HISTORY_LIMIT) {
      let toDelete = count - HISTORY_LIMIT;
      const cur = os.openCursor();
      await new Promise<void>((resolve) => {
        cur.onsuccess = () => {
          const c = cur.result;
          if (!c || toDelete <= 0) return resolve();
          c.delete();
          toDelete--;
          c.continue();
        };
        cur.onerror = () => resolve();
      });
    }
    await done(tx);
  }

  async listHistory(limit = HISTORY_LIMIT) {
    const tx = this.db.transaction('history', 'readonly');
    const out: HistoryEntry[] = [];
    const cur = tx.objectStore('history').openCursor(null, 'prev');
    await new Promise<void>((resolve, reject) => {
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c || out.length >= limit) return resolve();
        out.push({ ...(c.value as HistoryEntry), key: c.primaryKey as number });
        c.continue();
      };
      cur.onerror = () => reject(cur.error);
    });
    return out;
  }

  async clearHistory() {
    const tx = this.db.transaction('history', 'readwrite');
    tx.objectStore('history').clear();
    await done(tx);
  }

  async putFavorite(e: FavoriteEntry) {
    const tx = this.db.transaction('favorites', 'readwrite');
    tx.objectStore('favorites').put(e);
    await done(tx);
  }

  async removeFavorite(id: string) {
    const tx = this.db.transaction('favorites', 'readwrite');
    tx.objectStore('favorites').delete(id);
    await done(tx);
  }

  async listFavorites() {
    const tx = this.db.transaction('favorites', 'readonly');
    const all = (await req(tx.objectStore('favorites').getAll())) as FavoriteEntry[];
    return all.sort((a, b) => b.addedAt - a.addedAt);
  }

  async clearAll() {
    const tx = this.db.transaction(['kv', 'history', 'favorites'], 'readwrite');
    for (const n of ['kv', 'history', 'favorites']) tx.objectStore(n).clear();
    await done(tx);
  }
}

export class MemoryStore implements Store {
  private kv = new Map<string, unknown>();
  private history: HistoryEntry[] = [];
  private favorites = new Map<string, FavoriteEntry>();
  private seq = 0;
  async getKV<T>(key: string) {
    return structuredClone(this.kv.get(key)) as T | undefined;
  }
  async setKV<T>(key: string, value: T) {
    this.kv.set(key, structuredClone(value));
  }
  async addHistory(e: Omit<HistoryEntry, 'key'>) {
    this.history.push({ ...e, key: ++this.seq });
    if (this.history.length > HISTORY_LIMIT) this.history.splice(0, this.history.length - HISTORY_LIMIT);
  }
  async listHistory(limit = HISTORY_LIMIT) {
    return [...this.history].reverse().slice(0, limit);
  }
  async clearHistory() {
    this.history = [];
  }
  async putFavorite(e: FavoriteEntry) {
    this.favorites.set(e.id, e);
  }
  async removeFavorite(id: string) {
    this.favorites.delete(id);
  }
  async listFavorites() {
    return [...this.favorites.values()].sort((a, b) => b.addedAt - a.addedAt);
  }
  async clearAll() {
    this.kv.clear();
    this.history = [];
    this.favorites.clear();
  }
}

export async function openStore(factory: IDBFactory | undefined = globalThis.indexedDB): Promise<Store> {
  if (!factory) return new MemoryStore();
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = factory.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('history')) db.createObjectStore('history', { autoIncrement: true });
        if (!db.objectStoreNames.contains('favorites')) db.createObjectStore('favorites', { keyPath: 'id' });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new Error('IndexedDB blocked'));
    });
    db.onversionchange = () => db.close();
    return new IDBStore(db);
  } catch {
    return new MemoryStore();
  }
}
