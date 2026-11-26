# The quotation database

## What ships

Every quotation in the app comes from a work believed to be **in the public domain in the United States**, extracted directly from the text by this project's own pipeline:

| Source | How it is used | Rights basis |
| --- | --- | --- |
| [Standard Ebooks](https://standardebooks.org) — sparse clones of `github.com/standardebooks/<book>` | Proofread XHTML chapters are parsed and mined for time phrases. Author, title, translator, original publication year (from the colophon), repository commit and file path are kept with each quotation. | Each repository's `LICENSE.md` says the text is believed to be US public domain, and Standard Ebooks dedicates its own contributions under CC0 1.0. The importer refuses any repository whose licence file lacks that statement. |
| [Project Gutenberg](https://www.gutenberg.org) via the [GITenberg](https://github.com/GITenberg) mirror | Plain-text eBooks for English-language literature (fiction, drama, poetry and short stories, by catalogue subject or LC class P*) are mined the same way. Works already taken from Standard Ebooks are skipped. | Project Gutenberg's US public-domain texts. Books whose header says "Copyrighted Project Gutenberg eBook" are skipped, and everything outside the `*** START` / `*** END` markers (the licence and trademark boilerplate) is removed. When the catalogue gives an author death year after 1955, the licence note says the work may still be copyrighted outside the US. |

Public-domain status depends on jurisdiction. Some works that are free in the US (for example books published from 1927 to 1930, or by authors who died after 1955) may still be protected elsewhere. The app's Settings → Sources & licensing page says so.

## Researched but not shipped

| Resource | What it is | Finding | Decision |
| --- | --- | --- | --- |
| [kapoorankush/litclock](https://github.com/kapoorankush/litclock) | E-reader literary clock; `image-gen/litclock_annotated.csv`, 4,803 rows | Its `LICENSE` says the MIT terms cover the software only; the quote database is **CC BY-NC-SA 4.0**. `NOTICE.md` traces the data to JohsEnevoldsen/literature-clock, cdmoro/literature-clock and a 2011 Guardian reader thread. | **Excluded.** The rows are mostly excerpts from in-copyright novels. A CC licence on the compilation cannot grant rights in the quoted works, and NC-SA would also bind this app. |
| [JohsEnevoldsen/literature-clock](https://github.com/JohsEnevoldsen/literature-clock) (formerly JohannesNE; the source of literature-clock.jenevoldsen.com) | `litclock_annotated.csv`, 3,626 rows, pipe-delimited `time\|phrase\|quote\|title\|author\|sfw` | `LICENCE.md`: **CC BY-NC-SA 2.5**. The site itself could not be reached from the build environment, but the repository behind it was inspected directly. | **Excluded**, for the same reasons. |
| [itsfoss/literary-clock](https://github.com/itsfoss/literary-clock) | ESP32 e-paper clock; `data/quotes.csv`, 4,794 rows | MIT `LICENSE` for code; the README says the quote database "is taken from" kapoorankush/litclock. | **Excluded.** An MIT software licence does not relicense the inherited CC BY-NC-SA quotations. |
| [lrgthu/literary-clock](https://github.com/lrgthu/literary-clock) | Kindle clock with a large mining pipeline (Standard Ebooks, Gutenberg, Wikisource) | MIT for code; `NOTICE.md` states that bulk corpora and the normalised database are **deliberately not published**. Only aggregate reports and two adjudication TSVs (which include in-copyright excerpts) are in the repository. | **Nothing imported.** Its documented approach (mine public-domain text, keep provenance) informed this pipeline, and no code was copied. |

These legacy files are still useful as a benchmark. `npm run data:legacy` imports them (after you clone the repositories into `.corpus/legacy/`), and `build.ts` counts them under **Licensing exclusions** in the coverage report, including how many currently empty minutes they would have filled. Their policy in `pipeline/sources.json` is `exclude`. Switching one to `include` for a private, non-commercial build is at your own risk and must not be published.

## Pipeline

```
pipeline/fetch-standard-ebooks.sh   sparse-clone the repos in pipeline/standard-ebooks-repos.txt
pipeline/fetch-gutenberg.sh         GITenberg list → metadata.yaml → select-gutenberg.ts → texts
pipeline/import-standard-ebooks.ts  XHTML → candidate JSONL
pipeline/import-gutenberg.ts        plain text → candidate JSONL
pipeline/import-litclock-csv.ts     legacy pipe-delimited CSV → candidate JSONL (report only)
pipeline/build.ts                   validate → dedupe → rank/cap → shards + meta + coverage report
```

`npm run data:fetch && npm run data:import && npm run data:build` rebuilds everything. Fetching uses only `git` and `curl` against GitHub. The Standard Ebooks repository list was compiled from the public catalogue at standardebooks.org/ebooks.

### Adding a dataset

1. Write an importer that emits one JSON object per line matching `CandidateRecord` in `pipeline/lib/schema.ts`. You can reuse `findTimes` and `excerptAround`, or supply your own phrase offsets and minutes.
2. Add an entry to `pipeline/sources.json` with `key`, `name`, `url`, `license`, `policy` (`include`/`exclude`), `priority` (lower wins duplicates), `reason`, `attribution` and `inputs`.
3. Run `npm run data:build && npm test`.

### Recognising times (`pipeline/lib/timeParse.ts`)

The parser handles "two minutes past three", "five-and-twenty to four", "a quarter of one", "half after seven", "three o'clock", "twelve noon", "midnight", "4.37", "15:40", "7 p.m.", "eleven-fifteen", "at three in the afternoon", and suffixes such as "in the morning", "at night", "that evening" and "a.m./p.m.".

* **AM/PM.** A phrase is explicit only when it says so: a.m./p.m., morning/afternoon/evening/night (interpreted by hour, so "two o'clock at night" is 02:00), noon, midnight, or a 24-hour figure. Everything else is *ambiguous* and listed at both readings (03:02 and 15:02). The reader can turn off ambiguous quotations to see only explicit ones.
* **Precision over recall.** Bare readings that are often not times are accepted only with clock context ("at", "was", "struck", "till"…), must be followed by punctuation or a clock-like word, and are rejected after "from/between/or/odds". This rules out "ten to one he'll come", "from four to six dollars", "three twenty years ago", "John 3:16", "page 4.30" and "a midnight feast".
* **Approximate** phrases ("nearly", "just after", "about") are kept but flagged, and the reader can exclude them.
* The exact character offsets of the phrase are stored for highlighting.

### Excerpts

`excerptAround` grows outwards by whole sentences (abbreviation-aware) until about 160 characters, with a 520-character ceiling. The text itself is never altered beyond removing invisible typesetting characters (word joiners, soft hyphens, hair spaces). For Gutenberg texts, `_italic_` markup and footnote markers are removed, line wrapping is undone, and the ASCII `--` convention is rendered as an em dash. Spelling and punctuation are otherwise preserved.

### Deduplication, ranking and caps

* **Exact duplicates.** Text is compared after lower-casing and removing punctuation, accents and spacing, within the same minute.
* **Cross-edition duplicates.** The minute plus the 45 letters either side of the phrase (ignoring punctuation, digits and hyphenation) catches the same passage in two editions ("to-day" vs "today"). The higher-priority source wins (Standard Ebooks over Gutenberg), then the better excerpt.
* **Ranking** prefers 70–320-character excerpts, exact over approximate, explicit AM/PM, a known year, sentences that start properly, and unflagged text.
* **Caps.** Each minute keeps at most `MAX_PER_MINUTE` quotations (default 80, configurable through the environment variable) and at most 2 per work, so 12:00 is not all one novel.

### Content flags

Automated word lists (`pipeline/lib/text.ts`) flag `slur`, `profanity`, `sexual`, `violence` and `drugs`. Slurs are hidden by default. Family-friendly mode hides every flagged category. A small list of works is flagged as adult in their entirety. The lists err on the side of flagging, and older literature uses some words differently, so the flags are a filter, not a judgement.

### Validation

`pipeline/lib/validate.ts` rejects records whose phrase offsets don't match the text, which lack an author, title or licence, which have impossible minutes, or which are too short or too long. `tests/database.test.ts` re-checks the shipped database: shard and minute consistency, counts, unique IDs, highlight offsets, valid work references, explicit AM quotations only before noon (and PM after), no repeated text within a minute, and no excluded source present.

## Coverage

See [coverage-report.md](coverage-report.md), regenerated by every build. It covers per-minute counts, missing minutes, duplicates removed and licensing exclusions. When a minute has no eligible quotation, the clock shows the time in words with an unobtrusive note, never a quotation from another minute.
