# Quotation database coverage report

Generated 2026-11-26T17:51:16.691Z · edition `2026-11-26.57975eac`

## Summary

| Measure | Value |
| --- | --- |
| Minutes with at least one quotation | **1305 / 1440 (90.6%)** |
| Minutes with no quotation (fallback display) | 135 |
| Minutes with exactly one quotation | 214 |
| Quote–minute entries shipped | 20,614 |
| Distinct quotation texts shipped | 12,292 |
| Works represented | 3,967 |
| Candidate records read (all sources) | 203,627 |
| Exact duplicates removed | 24,623 |
| Cross-edition duplicates removed | 2,993 |
| Dropped by per-minute cap (80/minute, 2/work/minute) | 248,913 |
| Invalid records rejected | 155 (too-short: 155) |

Explicit AM: 2,252 · explicit PM: 2,298 · usable at either (ambiguous 12-hour): 16,064 entries.

Content flags (entries): slur 15 · profanity 18 · sexual 36 · violence 213 · drugs 4

## Sources

| Source | Policy | Licence | Records read |
| --- | --- | --- | --- |
| Standard Ebooks | shipped | Public domain in the USA; Standard Ebooks editions dedicated to the public domain under CC0 1.0 | 33,236 |
| Project Gutenberg (via the GITenberg mirror) | shipped | Public domain in the USA (per Project Gutenberg catalogue rights statement) | 157,168 |
| JohsEnevoldsen/literature-clock (literature-clock.jenevoldsen.com) | **excluded** | CC BY-NC-SA 2.5 | 3,626 |
| kapoorankush/litclock | **excluded** | CC BY-NC-SA 4.0 (quote database; software is MIT) | 4,803 |
| itsfoss/literary-clock | **excluded** | MIT for code; quotes taken from kapoorankush/litclock (CC BY-NC-SA 4.0) | 4,794 |

### Licensing exclusions

- **JohsEnevoldsen/literature-clock (literature-clock.jenevoldsen.com)** — 3,626 records excluded. Non-commercial, share-alike compilation of reader-submitted excerpts (originally The Guardian’s 2011 call-out), most from in-copyright modern books. The CC licence covers the compilation, not the quoted works, so it cannot grant redistribution rights for the excerpts.
- **kapoorankush/litclock** — 4,803 records excluded. The repository states explicitly that its MIT licence does not cover the quote database, which is CC BY-NC-SA 4.0 and derived from the JohsEnevoldsen corpus, cdmoro/literature-clock and the Guardian thread; most excerpts are from in-copyright books.
- **itsfoss/literary-clock** — 4,794 records excluded. Its README states the quote database is taken from kapoorankush/litclock, so the same restrictions apply; the MIT software licence does not extend to the quotations.

Excluded records would have filled 135 of the 135 currently empty minutes.

## Quotations per minute

| Quotations | Minutes |
| --- | --- |
| 0 | 135 |
| 1 | 214 |
| 2 | 206 |
| 3–4 | 318 |
| 5–9 | 223 |
| 10–19 | 75 |
| 20–39 | 61 |
| 40+ | 208 |

| Hour | Minutes covered | Entries |
| --- | --- | --- |
| 00:00 | 52/60 | 835 |
| 01:00 | 52/60 | 740 |
| 02:00 | 55/60 | 860 |
| 03:00 | 57/60 | 805 |
| 04:00 | 52/60 | 766 |
| 05:00 | 57/60 | 808 |
| 06:00 | 55/60 | 794 |
| 07:00 | 53/60 | 889 |
| 08:00 | 56/60 | 963 |
| 09:00 | 54/60 | 964 |
| 10:00 | 55/60 | 910 |
| 11:00 | 56/60 | 951 |
| 12:00 | 52/60 | 788 |
| 13:00 | 52/60 | 736 |
| 14:00 | 53/60 | 866 |
| 15:00 | 57/60 | 818 |
| 16:00 | 51/60 | 783 |
| 17:00 | 57/60 | 809 |
| 18:00 | 54/60 | 801 |
| 19:00 | 53/60 | 902 |
| 20:00 | 55/60 | 962 |
| 21:00 | 55/60 | 975 |
| 22:00 | 55/60 | 918 |
| 23:00 | 57/60 | 971 |

## Missing minutes

00:24, 00:31, 00:34, 00:41–00:42, 00:44, 00:46, 00:54, 01:08, 01:19, 01:24, 01:31, 01:34, 01:38–01:39, 01:46, 02:04, 02:21, 02:24, 02:26, 02:46, 03:26, 03:39, 03:44, 04:04, 04:09, 04:21, 04:23–04:24, 04:26, 04:31, 04:47, 05:06, 05:34, 05:44, 06:06, 06:09, 06:14, 06:33, 06:39, 07:04, 07:06, 07:09, 07:18, 07:24, 07:37, 07:48, 08:08, 08:33, 08:39, 08:41, 09:08, 09:26, 09:34, 09:39, 09:41, 09:44, 10:14, 10:24, 10:32, 10:39, 10:44, 11:09, 11:26, 11:34, 11:38, 12:24, 12:31, 12:34, 12:41–12:42, 12:44, 12:46, 12:54, 13:08, 13:19, 13:24, 13:31, 13:34, 13:38–13:39, 13:46, 14:04, 14:16, 14:23–14:24, 14:26, 14:34, 14:46, 15:26, 15:39, 15:44, 16:04, 16:09, 16:21–16:24, 16:26, 16:31, 16:47, 17:06, 17:34, 17:44, 18:06, 18:09, 18:14, 18:33, 18:39, 18:53, 19:04, 19:06, 19:09, 19:18, 19:24, 19:37, 19:48, 20:08, 20:24, 20:33, 20:39, 20:41, 21:08, 21:26, 21:39, 21:41, 21:44, 22:16, 22:24, 22:32, 22:39, 22:44, 23:09, 23:34, 23:38

When a minute has no eligible quotation the clock shows the time in words with a short note, rather than borrowing a quotation from another minute.
