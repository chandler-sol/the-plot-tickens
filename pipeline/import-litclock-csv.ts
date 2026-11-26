/**
 * Import a legacy "literary clock" pipe-delimited CSV
 * (HH:MM|time phrase|quote|title|author|sfw-flag), as used by
 * JohannesNE/JohsEnevoldsen literature-clock and kapoorankush/litclock.
 *
 * Usage:
 *   npx tsx pipeline/import-litclock-csv.ts <file.csv> <out.jsonl> <source-key> "<licence>" [source-url]
 *
 * These compilations are licensed CC BY-NC-SA and consist largely of excerpts
 * from in-copyright books, so pipeline/sources.json marks them "exclude": they are
 * analysed for the coverage report but never shipped. See docs/DATA.md.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { contentFlags } from './lib/text.ts';
import type { CandidateRecord } from './lib/schema.ts';

const [, , file, out, source, license, url] = process.argv;
if (!file || !out || !source || !license) {
  console.error('usage: import-litclock-csv.ts <file.csv> <out.jsonl> <source-key> "<licence>" [url]');
  process.exit(2);
}

function unquote(s: string): string {
  const t = s.trim();
  if (t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1).replace(/""/g, '"');
  return t;
}

const lines: string[] = [];
let skipped = 0;
for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
  if (!line.trim()) continue;
  const cols = line.split('|');
  if (cols.length < 5) {
    skipped++;
    continue;
  }
  const [time, phraseRaw, quoteRaw, title, author, sfw] = cols.map(unquote);
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) {
    skipped++;
    continue;
  }
  const quote = quoteRaw.replace(/<br\s*\/?>/gi, '\n');
  const idx = quote.toLowerCase().indexOf(phraseRaw.toLowerCase());
  if (idx < 0) {
    skipped++;
    continue;
  }
  const minute = Number(m[1]) * 60 + Number(m[2]);
  const flags = contentFlags(quote);
  if (sfw && /^(nsfw|yes|no)$/i.test(sfw) && /nsfw/i.test(sfw) && !flags.includes('sexual')) flags.push('sexual');
  const rec: CandidateRecord = {
    source,
    workId: `${author}|${title}`,
    quote,
    phrase: quote.slice(idx, idx + phraseRaw.length),
    phraseStart: idx,
    phraseEnd: idx + phraseRaw.length,
    minutes: [minute],
    meridiem: minute < 720 ? 'am' : 'pm',
    approximate: false,
    author,
    title,
    license,
    ...(url ? { sourceUrl: url } : {}),
    flags,
  };
  lines.push(JSON.stringify(rec));
}
writeFileSync(out, lines.join('\n') + '\n');
console.log(`${source}: ${lines.length} records (${skipped} unparseable) → ${out}`);
