# Architecture

The Plot Tickens is a static single-page app: React + TypeScript built by Vite, served from Cloudflare Pages, with no backend, accounts or analytics. After the first visit the service worker serves everything offline.

```
pipeline/ (Node, run by hand)                          browser
────────────────────────────                           ─────────────────────────────────────────────
Standard Ebooks repos ─┐                               index.html  (inline script paints theme colour)
Project Gutenberg    ──┼─► importers ─► candidates ─►      │
legacy CSVs (report) ─┘     (JSONL)     build.ts           ▼
                                          │            main.tsx ─► App
                                          ▼              │  ├─ createMinuteTicker  (core/time.ts)
                         public/data/meta.json           │  ├─ ClockEngine         (core/engine.ts)
                         public/data/q/HH.<hash>.json    │  │    ├─ QuoteStore      (core/data.ts)   fetch meta + 1 shard
                         docs/coverage-report.md         │  │    ├─ filter/pick     (core/selection.ts)
                                                         │  │    └─ Store (IDB)     (core/storage.ts) rotation, history, favourites
                                                         │  ├─ FitBox / QuoteFigure (ui/QuoteView.tsx)
                                                         │  ├─ Library      (lazy chunk) loads all 24 shards on demand
                                                         │  └─ SettingsPanel(lazy chunk)
                                                         └─ sw.js (generated) precaches shell + every shard
```

## Time

`core/time.ts#createMinuteTicker` arms a one-shot `setTimeout` for the next local minute boundary (+25 ms), recomputes the time on every fire, and re-arms. It never uses a fixed 60-second interval, which drifts and stalls while the device sleeps. On `visibilitychange`, `pageshow` and `focus` it recomputes immediately. Each emission is keyed on *date + minute-of-day + timezone fingerprint* (IANA zone and UTC offset), so travelling, a manual zone change or a daylight-saving transition takes effect at once, even within the same minute. All times are local wall-clock time from `Date`; there is no network time.

Seconds (optional) use a separate one-second ticker that runs only while the page is visible and only re-renders the small numerical clock.

`?at=HH:MM` freezes the clock at a chosen minute, for previews, screenshots and tests. `?quote=<id>` asks for a particular quotation, which is shown if it belongs to that minute.

## Data format

`pipeline/build.ts` writes:

* `data/meta.json`: version, per-minute counts (1,440 numbers), a works table `[title, author, year, translator, part, sourceIndex, url]`, source and licence records, and the 24 shard file names.
* `data/q/HH.<contenthash>.json`: `{ hour, minutes: { "<minute-of-day>": QuoteRow[] } }`, where `QuoteRow = [id, text, phraseStart, phraseEnd, workIndex, meridiem(0 ambiguous | 1 AM | 2 PM), flagBits, approximate]`.

A quotation that doesn't say AM or PM ("three o'clock") appears in both the 03:xx and 15:xx shards. Quote IDs are a hash of the normalised text and phrase offsets, so favourites and rotation memory survive database rebuilds. Shard names are content-hashed, so CDN caching is `immutable` and a service-worker update copies unchanged shards from the old cache instead of downloading them again.

The clock fetches `meta.json` plus the current hour's shard, and prefetches the next hour's shard a few minutes before the hour. It keeps at most three shards in memory. Only the library loads all 24.

## Selection

`ClockEngine.setMinute(m)` loads the minute's rows and filters them by the reader's preferences: content flags, explicit vs ambiguous AM/PM, approximate times, translations and maximum length. It then draws from a per-minute "shuffle bag" (`selection.ts#pickQuote`). Seen IDs are stored per minute, a quotation is not repeated until every eligible alternative for that minute has been shown, and a new cycle never starts with the quotation just shown. The bag is saved to IndexedDB (debounced) and pruned to bounded size, so rotation carries over between sessions. Previous/next move along a per-minute trail. When nothing is eligible the engine reports `empty` (or `error` when the data couldn't be loaded), and the UI shows the time in words with a short note. It never shows a quotation from another minute.

## Storage

* Settings: `localStorage`. They are small and synchronous, so the very first frame paints with the right theme, before React mounts. Every load and import goes through `sanitizeSettings`, which validates each field individually.
* IndexedDB (`plot-tickens` database): `kv` (rotation state), `history` (auto-increment, capped at 500, stores full quote snapshots), `favorites` (keyed by quote ID, full snapshots so exports work offline). If IndexedDB is unavailable (some private-browsing modes), the app falls back to `MemoryStore`.

## Rendering and layout

`FitBox` binary-searches the largest font size, between 11 px and `min(120, width/7.5, height/3.2) × userScale`, at which the quotation and attribution fit the stage without overflow. It re-fits on `ResizeObserver`, orientation change, `document.fonts` loading and any content or typography change. The layout uses `100dvh` with a `100vh` fallback, and pads with `env(safe-area-inset-*)` for the notch and home indicator. Bedside mode puts a large numerical clock beside the quotation in landscape. Minimal mode shows the quotation alone.

Themes are CSS custom properties set on `<html>`. Custom colours override the palette. `<meta name="theme-color">` follows the active background. Night mode is a black veil whose opacity the reader controls, which can go dimmer than the system's minimum brightness. Burn-in protection shifts the content by up to 6 px every three minutes.

## PWA

`vite.config.ts` contains a small plugin that:

1. substitutes branding into `index.html`;
2. emits `manifest.webmanifest` from `src/config/brand.ts`;
3. after the build, walks `dist/`, hashes it and writes `sw.js` from `src/sw/sw-template.js`, with a versioned precache list (app shell, fonts, icons, `meta.json`, and all data shards).

The worker serves navigations from the cached shell and other requests cache-first. On update the new worker waits; the app shows "A new edition is ready · Reload" and only reloads when the reader accepts. The first install never reloads the page. Wake Lock is requested only while the clock is visible and enabled, and requested again on `visibilitychange`/`focus`. When it's unsupported or declined, the app says so plainly.

## Source map

| Path | Purpose |
| --- | --- |
| `src/config/brand.ts` | App name, colours, share footer: the one place to rename the app |
| `src/core/time.ts` | Minute maths, DST- and zone-aware ticker, time in words |
| `src/core/data.ts` | Lazy sharded quotation store |
| `src/core/selection.ts` | Filtering and no-repeat rotation |
| `src/core/engine.ts` | Ties ticker, store, rotation and persistence together |
| `src/core/settings.ts` | Settings model, defaults, validation, schedules |
| `src/core/storage.ts` | IndexedDB wrapper and memory fallback |
| `src/core/share.ts` | Text/Markdown formatting, local canvas image rendering |
| `src/ui/*` | Clock view, fitting, library, settings, share dialog |
| `src/sw/sw-template.js` | Service worker source |
| `pipeline/*` | Importers, parser, build and coverage report (see [DATA.md](DATA.md)) |
| `tests/*` | Vitest unit and integration tests |
| `scripts/e2e.mjs` | Browser checks and screenshots (playwright-core) |
