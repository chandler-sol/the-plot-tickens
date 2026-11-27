/**
 * Import time quotations from Project Gutenberg plain-text eBooks.
 *
 * Usage:
 *   npx tsx pipeline/import-gutenberg.ts <dir> <out.jsonl>
 *
 * <dir> must contain, per book, `<repo>.txt` (the eBook text) and
 * `<repo>.yaml` (GITenberg metadata.yaml) — see pipeline/fetch-gutenberg.sh.
 * Books flagged "Copyrighted Project Gutenberg eBook" are skipped, as is
 * everything outside the *** START / *** END markers (licence boilerplate).
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findTimes } from './lib/timeParse.ts';
import { contentFlags, excerptAround } from './lib/text.ts';
import { displayName, gutenbergBody, paragraphs, workTitle } from './lib/gutenberg.ts';
import type { CandidateRecord } from './lib/schema.ts';

const [, , dir, outFile, metaDirArg] = process.argv;
if (!dir || !outFile) {
  console.error('usage: import-gutenberg.ts <text-dir> <out.jsonl> [meta-dir]');
  process.exit(2);
}
const metaDir = metaDirArg ?? dir;

function decode(buf: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

/** Read a scalar from GITenberg's YAML, honouring single- and double-quoted forms. */
function yamlField(y: string, re: RegExp): string | undefined {
  const m = re.exec(y);
  if (!m) return undefined;
  let v = m[1].trim();
  // multi-line quoted scalars: keep the first line only
  if (/^"/.test(v) && !/"$/.test(v)) v = `${v.replace(/\\r\\n[\s\S]*$|\\$/, '').replace(/\\"/g, '"').slice(1)}`;
  else if (/^'/.test(v) && !/'$/.test(v)) v = v.slice(1).replace(/''/g, "'");
  if (v.startsWith('"') && v.endsWith('"')) {
    try {
      v = JSON.parse(v);
    } catch {
      v = v.slice(1, -1);
    }
  } else if (v.startsWith("'") && v.endsWith("'")) {
    v = v.slice(1, -1).replace(/''/g, "'");
  }
  return v.split(/\r?\n/)[0].trim();
}

const files = readdirSync(dir).filter((f) => f.endsWith('.txt')).sort();
const lines: string[] = [];
let books = 0;
let skipped = 0;
for (const f of files) {
  const repo = f.slice(0, -4);
  const metaPath = join(metaDir, `${repo}.yaml`);
  if (!existsSync(metaPath)) {
    skipped++;
    continue;
  }
  const y = readFileSync(metaPath, 'utf8');
  const rawTitle = yamlField(y, /^title: (.+)$/m)?.split(/;\s|:\s(?=[A-Z])/)[0].replace(/--/g, '—');
  const title = rawTitle ? workTitle(rawTitle) : undefined;
  const agent = yamlField(y, /author:\s*\n\s+agent_name: (.+)$/m) ?? yamlField(y, /agent_name: (.+)$/m);
  const id = yamlField(y, /^\s+gutenberg: '?(\d+)'?$/m);
  const death = Number(yamlField(y, /author:\s*\n(?:\s+\w+:.*\n)*?\s+deathdate: (\d+)/m) ?? NaN);
  const translator = yamlField(y, /translator:\s*\n\s+agent_name: (.+)$/m);
  if (!title || !agent || !id) {
    skipped++;
    continue;
  }
  const body = gutenbergBody(decode(readFileSync(join(dir, f))));
  if (!body) {
    skipped++;
    continue;
  }
  books++;
  const author = displayName(agent);
  const lateDeath = Number.isFinite(death) && death > 1955;
  for (const para of paragraphs(body)) {
    for (const t of findTimes(para)) {
      const ex = excerptAround(para, t.start, t.end);
      if (!ex) continue;
      const quote = para.slice(ex.start, ex.end);
      const rec: CandidateRecord = {
        source: 'project-gutenberg',
        workId: `pg${id}`,
        quote,
        phrase: t.phrase,
        phraseStart: t.start - ex.start,
        phraseEnd: t.end - ex.start,
        minutes: t.minutesOfDay,
        meridiem: t.meridiem,
        approximate: t.approximate,
        author,
        title,
        ...(translator ? { translator: displayName(translator) } : {}),
        sourceUrl: `https://www.gutenberg.org/ebooks/${id}`,
        license: lateDeath
          ? `Public domain in the USA (Project Gutenberg); author died ${death}, so the work may still be copyrighted elsewhere`
          : 'Public domain in the USA (Project Gutenberg)',
        provenance: { mirror: `https://github.com/GITenberg/${repo}`, gutenbergId: id },
        flags: contentFlags(quote),
      };
      lines.push(JSON.stringify(rec));
    }
  }
}
writeFileSync(outFile, lines.join('\n') + '\n');
console.log(`project-gutenberg: ${books} books (${skipped} skipped), ${lines.length} candidates → ${outFile}`);
