# Future development

Roughly in order of value.

## Coverage
* **More public-domain text.** The GITenberg mirror stops at about eBook #60,000. Mirroring newer Project Gutenberg releases (through the official rsync mirrors, from a machine with access), plus English Wikisource and Faded Page (Canada) where the works are US public domain, would fill rare minutes such as 4:37 or 9:53. Each new source only needs an importer that writes `CandidateRecord` JSON Lines, plus an entry in `pipeline/sources.json`.
* **Timetables, logs and diaries.** Public-domain ship logs, railway guides and diaries (Pepys, for example) use exact minutes far more than novels do.
* **Better approximate matching.** Use "nearly six" at 5:5x as well as 6:00, marked as approximate in the UI.
* **Human curation.** Add a lightweight review queue in which rejected candidates (false positives, poor excerpts) are recorded as IDs in `pipeline/curation.json` and dropped by `build.ts`.

## Parser
* Recognise more forms: "the half hour", "a few minutes after five", "1430 hours", "two bells", Roman-numeral clock faces and French/German translations' idioms.
* Use a small local classifier to reject idiomatic false positives ("at sixes and sevens", "five to one odds") instead of relying on context word lists alone.
* Offer a per-quote report button that writes to a local exclusion list, and export it for upstream fixes.

## Experience
* An optional chime or spoken time, synthesised offline with the Web Speech API.
* Per-day themes, an "on this day" mode that prefers quotations mentioning today's date, and seasonal palettes.
* Pick the quotation by author or by work ("only Dickens").
* Shared deep links: `?at=HH:MM&quote=<id>` already works, and the share sheet could include it.
* A larger typographic system: optical sizes, old-style figures for the numerical clock, and drop caps.
* Native wrappers (Capacitor/Tauri) only if StandBy mode, widgets or true background operation become essential, since a web app cannot provide them on iOS.

## Engineering
* Add Playwright to CI to run `npm run test:e2e` across WebKit and Chromium on every pull request.
* Compress shards with Brotli at build time for hosts that don't do it automatically.
* Add a storage-pressure handler that evicts the data cache under quota pressure and refetches lazily.
* Add internationalisation for UI strings. The quotations remain English.
