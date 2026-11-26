import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

/** Minimal Cache Storage + ServiceWorkerGlobalScope simulation to exercise sw-template.js offline. */
function boot(shell: string[], data: string[], online: { value: boolean }) {
  const stores = new Map<string, Map<string, Response>>();
  const key = (r: string | Request) => new URL(typeof r === 'string' ? r : r.url, 'https://clock.test/').pathname;
  const caches = {
    async open(name: string) {
      if (!stores.has(name)) stores.set(name, new Map());
      const m = stores.get(name)!;
      return {
        async addAll(paths: string[]) { for (const p of paths) m.set(key(p), await net(p)); },
        async add(p: string) { m.set(key(p), await net(p)); },
        async put(r: string | Request, res: Response) { m.set(key(r), res); },
        async match(r: string | Request) { return m.get(key(r))?.clone(); },
        async keys() { return [...m.keys()]; },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(n: string) { return stores.delete(n); },
  };
  async function net(p: string | Request): Promise<Response> {
    if (!online.value) throw new TypeError('Failed to fetch');
    return new Response(`body of ${key(p)}`, { status: 200 });
  }
  const handlers: Record<string, (e: unknown) => void> = {};
  const self = {
    location: new URL('https://clock.test/sw.js'),
    registration: { scope: 'https://clock.test/' },
    clients: { claim: async () => undefined },
    skipWaiting: () => undefined,
    addEventListener: (t: string, h: (e: unknown) => void) => (handlers[t] = h),
  };
  const src = readFileSync('src/sw/sw-template.js', 'utf8')
    .replace('__VERSION__', 'v1')
    .replace('__SHELL__', JSON.stringify(shell))
    .replace('__DATA__', JSON.stringify(data));
  runInNewContext(src, { self, caches, fetch: net, URL, Response, Request, Promise, console });
  const dispatch = async (type: string, extra: object = {}) => {
    let p: Promise<unknown> | undefined;
    let responded: Promise<Response> | undefined;
    handlers[type]({ ...extra, waitUntil: (x: Promise<unknown>) => (p = x), respondWith: (x: Promise<Response>) => (responded = x) });
    await p;
    return responded ? await responded : undefined;
  };
  return { dispatch, stores };
}

describe('service worker offline behaviour', () => {
  const shell = ['./', 'assets/index.js', 'data/meta.json'];
  const data = ['data/q/00.abc.json', 'data/q/13.def.json'];

  it('precaches the shell and the whole quotation database on install', async () => {
    const online = { value: true };
    const sw = boot(shell, data, online);
    await sw.dispatch('install');
    await sw.dispatch('activate');
    const names = [...sw.stores.keys()];
    expect(names).toEqual(['shell-v1', 'data-v1']);
    expect([...sw.stores.get('data-v1')!.keys()]).toEqual(['/data/q/00.abc.json', '/data/q/13.def.json']);
  });

  it('serves navigations, metadata and shards with the network down', async () => {
    const online = { value: true };
    const sw = boot(shell, data, online);
    await sw.dispatch('install');
    online.value = false;
    const nav = await sw.dispatch('fetch', { request: { method: 'GET', url: 'https://clock.test/?at=10:00', mode: 'navigate' } });
    expect(await nav!.text()).toBe('body of /');
    const shard = await sw.dispatch('fetch', { request: new Request('https://clock.test/data/q/13.def.json') });
    expect(shard!.status).toBe(200);
    const meta = await sw.dispatch('fetch', { request: new Request('https://clock.test/data/meta.json') });
    expect(await meta!.text()).toBe('body of /data/meta.json');
  });

});
