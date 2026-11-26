/**
 * Merge, validate, deduplicate and shard candidate quotations into the static
 * database served by the app, and write the coverage report.
 *
 * Usage:
 *   npx tsx pipeline/build.ts pipeline/sources.json public/data docs/coverage-report.md
 *
 * sources.json lists every importer output with its licence and a policy:
 *   "include" — shipped in the app;  "exclude" — analysed for the report only.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { CandidateRecord, SourceConfig } from './lib/schema.ts';
import { dedupeKey } from './lib/text.ts';
import { formatHHMM } from './lib/timeParse.ts';
import { validate } from './lib/validate.ts';

const FLAGS = ['slur', 'profanity', 'sexual', 'violence', 'drugs'] as const;
const MAX_PER_MINUTE = Number(process.env.MAX_PER_MINUTE ?? 80);
const MAX_PER_WORK_PER_MINUTE = 2;

interface SourceEntry extends SourceConfig {
  inputs: string[];
  priority: number;
}

const [, , configPath, outDir, reportPath] = process.argv;
if (!configPath || !outDir || !reportPath) {
  console.error('usage: build.ts <sources.json> <out-dir> <report.md>');
  process.exit(2);
}
const root = process.cwd();
const sources: SourceEntry[] = JSON.parse(readFileSync(configPath, 'utf8'));

/** Normalised fuzzy key catching the same passage in two editions (e.g. "to-day" vs "today"). */
function editionKey(r: CandidateRecord, minute: number): string {
  const letters = (t: string) => t.toLowerCase().normalize('NFKD').replace(/[^a-z]/g, '');
  const before = letters(r.quote.slice(Math.max(0, r.phraseStart - 120), r.phraseStart)).slice(-45);
  const after = letters(r.quote.slice(r.phraseEnd, r.phraseEnd + 120)).slice(0, 45);
  return `${minute}|${before}|${after}`;
}

function score(r: CandidateRecord): number {
  let s = 0;
  const len = r.quote.length;
  if (len >= 70 && len <= 320) s += 3;
  else if (len <= 420) s += 1.5;
  if (!r.approximate) s += 1.5;
  if (r.meridiem !== 'ambiguous') s += 1;
  if (r.year) s += 0.5;
  // the phrase should not be buried at the very end of a long passage
  if (r.phraseStart / Math.max(1, len) < 0.85) s += 0.5;
  // dialogue fragments that start mid-sentence read poorly
  if (/^[\p{Ll}]/u.test(r.quote)) s -= 2;
  if (r.flags.length) s -= 0.5;
  // stable tiebreak
  s += (parseInt(createHash('md5').update(r.quote).digest('hex').slice(0, 6), 16) / 0xffffff) * 0.01;
  return s;
}

function idFor(r: CandidateRecord): string {
  return createHash('sha1').update(`${dedupeKey(r.quote)}|${r.phraseStart}|${r.phraseEnd}`).digest('base64url').slice(0, 11);
}

interface Placed {
  rec: CandidateRecord;
  minute: number;
  sourceIdx: number;
  priority: number;
  score: number;
}

const stats = {
  read: 0,
  invalid: {} as Record<string, number>,
  excludedBySource: {} as Record<string, number>,
  excludedMinutes: new Map<number, number>(),
  exactDuplicates: 0,
  editionDuplicates: 0,
  cappedOut: 0,
  perSourceRead: {} as Record<string, number>,
};

const placedByMinute = new Map<number, Placed[]>();
const exactSeen = new Map<string, Placed>();
const editionSeen = new Map<string, Placed>();
const shippedSources: SourceEntry[] = [];

function readJsonl(path: string): CandidateRecord[] {
  const abs = join(root, path);
  if (!existsSync(abs)) {
    console.warn(`  (missing input ${path} — skipped)`);
    return [];
  }
  return readFileSync(abs, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as CandidateRecord);
}

for (const src of sources) {
  const recs = src.inputs.flatMap(readJsonl);
  stats.perSourceRead[src.key] = recs.length;
  stats.read += recs.length;
  if (src.policy === 'exclude') {
    stats.excludedBySource[src.key] = recs.length;
    for (const r of recs) for (const m of r.minutes ?? []) stats.excludedMinutes.set(m, (stats.excludedMinutes.get(m) ?? 0) + 1);
    continue;
  }
  const sourceIdx = shippedSources.push(src) - 1;
  for (const rec of recs) {
    const bad = validate(rec);
    if (bad) {
      stats.invalid[bad] = (stats.invalid[bad] ?? 0) + 1;
      continue;
    }
    for (const minute of rec.minutes) {
      const p: Placed = { rec, minute, sourceIdx, priority: src.priority, score: score(rec) };
      const exact = `${minute}|${dedupeKey(rec.quote)}`;
      const ed = editionKey(rec, minute);
      const prev = exactSeen.get(exact) ?? editionSeen.get(ed);
      if (prev) {
        if (exactSeen.has(exact)) stats.exactDuplicates++;
        else stats.editionDuplicates++;
        // keep the higher-priority source (lower number), then the better excerpt
        if (p.priority < prev.priority || (p.priority === prev.priority && p.score > prev.score)) {
          const list = placedByMinute.get(minute)!;
          list[list.indexOf(prev)] = p;
          exactSeen.set(exact, p);
          editionSeen.set(ed, p);
        }
        continue;
      }
      exactSeen.set(exact, p);
      editionSeen.set(ed, p);
      if (!placedByMinute.has(minute)) placedByMinute.set(minute, []);
      placedByMinute.get(minute)!.push(p);
    }
  }
}

// Rank and cap per minute, limiting any single work's dominance.
const chosen = new Map<number, Placed[]>();
for (const [minute, list] of placedByMinute) {
  list.sort((a, b) => b.score - a.score);
  const perWork = new Map<string, number>();
  const keep: Placed[] = [];
  const texts = new Set<string>();
  for (const p of list) {
    // one passage can contain two phrases for the same minute ("three o'clock … three o'clock"): keep one
    const tk = p.rec.quote.toLowerCase().normalize('NFKD').replace(/[^a-z]/g, '');
    if (texts.has(tk)) {
      stats.exactDuplicates++;
      continue;
    }
    texts.add(tk);
    const k = p.rec.workId;
    if ((perWork.get(k) ?? 0) >= MAX_PER_WORK_PER_MINUTE || keep.length >= MAX_PER_MINUTE) {
      stats.cappedOut++;
      continue;
    }
    perWork.set(k, (perWork.get(k) ?? 0) + 1);
    keep.push(p);
  }
  chosen.set(minute, keep);
}

// Works table
const works: (string | number | null)[][] = [];
const workIndex = new Map<string, number>();
function workOf(p: Placed): number {
  const r = p.rec;
  const key = `${p.sourceIdx}|${r.workId}|${r.part ?? ''}`;
  let i = workIndex.get(key);
  if (i === undefined) {
    i = works.push([r.title, r.author, r.year ?? null, r.translator ?? null, r.part ?? null, p.sourceIdx, r.sourceUrl ?? null]) - 1;
    workIndex.set(key, i);
  }
  return i;
}

// Output
const qDir = join(outDir, 'q');
if (existsSync(qDir)) for (const f of readdirSync(qDir)) rmSync(join(qDir, f));
mkdirSync(qDir, { recursive: true });

const counts = new Array(1440).fill(0) as number[];
const uniqueTexts = new Set<string>();
const flagCounts: Record<string, number> = {};
const meridiemCounts = { ambiguous: 0, am: 0, pm: 0 };
const ids = new Set<string>();
let entries = 0;
const shardFiles: string[] = [];
for (let h = 0; h < 24; h++) {
  const minutes: Record<string, unknown[]> = {};
  for (let m = h * 60; m < h * 60 + 60; m++) {
    const list = chosen.get(m) ?? [];
    if (!list.length) continue;
    minutes[String(m)] = list.map((p) => {
      const r = p.rec;
      let id = idFor(r);
      // the same passage may legitimately sit at 3:02 and 15:02 — same id is fine across minutes,
      // but must be unique within one minute
      const scoped = `${m}|${id}`;
      if (ids.has(scoped)) id = `${id}${m}`;
      ids.add(`${m}|${id}`);
      counts[m]++;
      entries++;
      uniqueTexts.add(dedupeKey(r.quote));
      meridiemCounts[r.meridiem]++;
      for (const f of r.flags) flagCounts[f] = (flagCounts[f] ?? 0) + 1;
      const bits = FLAGS.reduce((acc, f, i) => (r.flags.includes(f) ? acc | (1 << i) : acc), 0);
      return [id, r.quote, r.phraseStart, r.phraseEnd, workOf(p), r.meridiem === 'am' ? 1 : r.meridiem === 'pm' ? 2 : 0, bits, r.approximate ? 1 : 0];
    });
  }
  const body = JSON.stringify({ hour: h, minutes });
  const hash = createHash('sha256').update(body).digest('hex').slice(0, 10);
  const name = `q/${String(h).padStart(2, '0')}.${hash}.json`;
  writeFileSync(join(outDir, name), body);
  shardFiles.push(name);
}

const versionHash = createHash('sha256').update(shardFiles.join()).digest('hex').slice(0, 8);
const meta = {
  schema: 1,
  version: `${new Date().toISOString().slice(0, 10)}.${versionHash}`,
  generatedAt: new Date().toISOString(),
  totalEntries: entries,
  uniqueQuotes: uniqueTexts.size,
  counts,
  works,
  sources: shippedSources.map((s) => ({ key: s.key, name: s.name, url: s.url, license: s.license, licenseUrl: s.licenseUrl, attribution: s.attribution })),
  flags: FLAGS,
  shardFiles,
};
writeFileSync(join(outDir, 'meta.json'), JSON.stringify(meta));

// ---------- Coverage report ----------
const missing = counts.map((c, i) => (c === 0 ? i : -1)).filter((i) => i >= 0);
const covered = 1440 - missing.length;
const ranges: string[] = [];
for (let i = 0; i < missing.length; i++) {
  let j = i;
  while (j + 1 < missing.length && missing[j + 1] === missing[j] + 1) j++;
  ranges.push(i === j ? formatHHMM(missing[i]) : `${formatHHMM(missing[i])}–${formatHHMM(missing[j])}`);
  i = j;
}
const single = counts.filter((c) => c === 1).length;
const hist = [0, 1, 2, 3, 5, 10, 20, 40].map((lo, i, a) => {
  const hi = a[i + 1] ?? Infinity;
  const n = counts.filter((c) => (lo === 0 ? c === 0 : c >= lo && c < hi)).length;
  return `| ${lo === 0 ? '0' : hi === Infinity ? `${lo}+` : hi - lo === 1 ? `${lo}` : `${lo}–${hi - 1}`} | ${n} |`;
});
const hourTable = Array.from({ length: 24 }, (_, h) => {
  const slice = counts.slice(h * 60, h * 60 + 60);
  return `| ${String(h).padStart(2, '0')}:00 | ${slice.filter((c) => c > 0).length}/60 | ${slice.reduce((a, b) => a + b, 0)} |`;
});
const excludedCovered = [...stats.excludedMinutes.keys()].filter((m) => counts[m] === 0).length;
const report = `# Quotation database coverage report

Generated ${meta.generatedAt} · edition \`${meta.version}\`

## Summary

| Measure | Value |
| --- | --- |
| Minutes with at least one quotation | **${covered} / 1440 (${((covered / 1440) * 100).toFixed(1)}%)** |
| Minutes with no quotation (fallback display) | ${missing.length} |
| Minutes with exactly one quotation | ${single} |
| Quote–minute entries shipped | ${entries.toLocaleString('en-US')} |
| Distinct quotation texts shipped | ${uniqueTexts.size.toLocaleString('en-US')} |
| Works represented | ${works.length.toLocaleString('en-US')} |
| Candidate records read (all sources) | ${stats.read.toLocaleString('en-US')} |
| Exact duplicates removed | ${stats.exactDuplicates.toLocaleString('en-US')} |
| Cross-edition duplicates removed | ${stats.editionDuplicates.toLocaleString('en-US')} |
| Dropped by per-minute cap (${MAX_PER_MINUTE}/minute, ${MAX_PER_WORK_PER_MINUTE}/work/minute) | ${stats.cappedOut.toLocaleString('en-US')} |
| Invalid records rejected | ${Object.values(stats.invalid).reduce((a, b) => a + b, 0)} ${Object.keys(stats.invalid).length ? `(${Object.entries(stats.invalid).map(([k, v]) => `${k}: ${v}`).join(', ')})` : ''} |

Explicit AM: ${meridiemCounts.am.toLocaleString('en-US')} · explicit PM: ${meridiemCounts.pm.toLocaleString('en-US')} · usable at either (ambiguous 12-hour): ${meridiemCounts.ambiguous.toLocaleString('en-US')} entries.

Content flags (entries): ${FLAGS.map((f) => `${f} ${flagCounts[f] ?? 0}`).join(' · ')}

## Sources

| Source | Policy | Licence | Records read |
| --- | --- | --- | --- |
${sources.map((s) => `| ${s.name} | ${s.policy === 'include' ? 'shipped' : '**excluded**'} | ${s.license} | ${(stats.perSourceRead[s.key] ?? 0).toLocaleString('en-US')} |`).join('\n')}

### Licensing exclusions

${
  Object.keys(stats.excludedBySource).length
    ? `${Object.entries(stats.excludedBySource)
        .map(([k, n]) => {
          const s = sources.find((x) => x.key === k)!;
          return `- **${s.name}** — ${n.toLocaleString('en-US')} records excluded. ${s.reason}`;
        })
        .join('\n')}\n\nExcluded records would have filled ${excludedCovered} of the ${missing.length} currently empty minutes.`
    : 'None.'
}

## Quotations per minute

| Quotations | Minutes |
| --- | --- |
${hist.join('\n')}

| Hour | Minutes covered | Entries |
| --- | --- | --- |
${hourTable.join('\n')}

## Missing minutes

${missing.length ? ranges.join(', ') : 'None — every minute of the day has a quotation.'}

When a minute has no eligible quotation the clock shows the time in words with a short note, rather than borrowing a quotation from another minute.
`;
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, report);
writeFileSync(reportPath.replace(/\.md$/, '.json'), JSON.stringify({ generatedAt: meta.generatedAt, version: meta.version, covered, missing, counts, stats: { ...stats, excludedMinutes: undefined }, entries, unique: uniqueTexts.size, works: works.length }, null, 1));
console.log(`built ${entries} entries (${uniqueTexts.size} unique) covering ${covered}/1440 minutes → ${outDir}; report → ${reportPath}`);
