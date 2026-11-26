/** Service-worker registration with a user-confirmed update flow. */
let waiting: ServiceWorker | null = null;
/** Only reload when the user accepted an update (not when the very first worker claims the page). */
let updateRequested = false;
const listeners = new Set<() => void>();

export function onUpdateReady(cb: () => void): () => void {
  listeners.add(cb);
  if (waiting) cb();
  return () => listeners.delete(cb);
}

function announce(w: ServiceWorker) {
  waiting = w;
  listeners.forEach((l) => l());
}

export function applyUpdate(): void {
  updateRequested = true;
  if (!waiting) return location.reload();
  waiting.postMessage({ type: 'SKIP_WAITING' });
}

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !updateRequested) return;
    reloading = true;
    location.reload();
  });
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL });
      if (reg.waiting && navigator.serviceWorker.controller) announce(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) announce(nw);
        });
      });
      // Check for a new edition when the app comes back to the foreground (at most hourly).
      let last = Date.now();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && Date.now() - last > 3_600_000) {
          last = Date.now();
          void reg.update().catch(() => undefined);
        }
      });
    } catch {
      /* SW unsupported or blocked: the app still works online */
    }
  });
}
