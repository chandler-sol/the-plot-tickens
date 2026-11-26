/**
 * Import time quotations from Standard Ebooks source repositories.
 *
 * Usage:
 *   npx tsx pipeline/import-standard-ebooks.ts <dir-of-cloned-repos> <out.jsonl>
 *
 * Each sub-directory must be a (sparse) clone of a github.com/standardebooks/<slug>
 * repository containing src/epub/content.opf, src/epub/text/*.xhtml and LICENSE.md.
 * See pipeline/fetch-standard-ebooks.sh.
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findTimes } from './lib/timeParse.ts';
import { cleanInvisible, contentFlags, decodeEntities, excerptAround } from './lib/text.ts';
import type { CandidateRecord } from './lib/schema.ts';

const [, , inDir, outFile] = process.argv;
if (!inDir || !outFile) {
  console.error('usage: import-standard-ebooks.ts <repos-dir> <out.jsonl>');
  process.exit(2);
}

const SKIP_FILES =
  /^(?:colophon|imprint|uncopyright|titlepage|halftitlepage|toc|loi|endnotes|dedication|epigraph|preface|introduction|foreword|afterword|appendix|glossary|acknowledgments|bibliography|translators-note|editors-note|notes|frontispiece|dramatis-personae|index|footnotes|biographical-note|chronology|errata|copyright)/;
const COLLECTION = /(?:^|_)(?:short-fiction|short-science-fiction|poetry|short-plays|stories|essays|short-works|ghost-stories)(?:_|$)|-stories(?:_|$)/;
/** Works whose overall content is adult; every quote is flagged regardless of wording. */
const MATURE_WORKS = new Set(['d-h-lawrence_lady-chatterleys-lover', 'm-g-lewis_the-monk']);

function tag(opf: string, re: RegExp): string | undefined {
  const m = re.exec(opf);
  return m ? decodeEntities(m[1].trim()) : undefined;
}

function contributorsWithRole(opf: string, role: string): string[] {
  const out: string[] = [];
  const re = /<dc:(?:contributor|creator) id="([^"]+)">([^<]+)<\/dc:(?:contributor|creator)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(opf))) {
    const id = m[1];
    if (new RegExp(`<meta property="role" refines="#${id}"[^>]*>${role}</meta>`).test(opf)) out.push(decodeEntities(m[2]));
  }
  return out;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function xhtmlToParagraphs(xhtml: string): string[] {
  let body = xhtml.replace(/^[\s\S]*?<body[^>]*>/, '').replace(/<\/body>[\s\S]*$/, '');
  body = body
    .replace(/<(header|hgroup|figure|aside|table)\b[\s\S]*?<\/\1>/g, ' ')
    .replace(/<blockquote[^>]*epub:type="[^"]*epigraph[^"]*"[\s\S]*?<\/blockquote>/g, ' ')
    .replace(/<a[^>]*noteref[^>]*>[\s\S]*?<\/a>/g, '')
    .replace(/<h[1-6][\s\S]*?<\/h[1-6]>/g, ' ');
  const paras: string[] = [];
  const re = /<p\b[^>]*>([\s\S]*?)<\/p>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const inner = m[1]
      .replace(/<br\s*\/?>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/[\t\r]+/g, '')
      .replace(/\n\s*\n/g, '\n');
    const text = cleanInvisible(decodeEntities(inner).replace(/[ ]*\n[ ]*/g, '\n'));
    if (text.length > 20) paras.push(text);
  }
  return paras;
}

function readCommit(repoDir: string): string | undefined {
  const shallow = join(repoDir, '.git', 'shallow');
  if (existsSync(shallow)) return readFileSync(shallow, 'utf8').trim().split('\n')[0];
  return undefined;
}

const repos = readdirSync(inDir).filter((d) => existsSync(join(inDir, d, 'src/epub/content.opf')));
const lines: string[] = [];
let books = 0;
for (const slug of repos.sort()) {
  const dir = join(inDir, slug);
  const opf = readFileSync(join(dir, 'src/epub/content.opf'), 'utf8');
  const license = existsSync(join(dir, 'LICENSE.md')) ? readFileSync(join(dir, 'LICENSE.md'), 'utf8') : '';
  if (!/believed to be in the United States public domain/.test(license)) {
    console.warn(`skip ${slug}: LICENSE.md lacks the public-domain statement`);
    continue;
  }
  const title = tag(opf, /<dc:title id="title">([^<]+)<\/dc:title>/);
  const authors = contributorsWithRole(opf, 'aut');
  const translators = contributorsWithRole(opf, 'trl');
  const language = tag(opf, /<dc:language>([^<]+)<\/dc:language>/) ?? 'en';
  if (!title || authors.length === 0 || !language.startsWith('en')) continue;
  const textDir = join(dir, 'src/epub/text');
  let year: number | undefined;
  const colophonPath = join(textDir, 'colophon.xhtml');
  if (existsSync(colophonPath)) {
    const col = readFileSync(colophonPath, 'utf8').replace(/\s+/g, ' ');
    const y = /(?:published|written|composed|performed|first produced) in\s*(?:<[^>]+>\s*)*(\d{3,4})/.exec(col);
    if (y) year = Number(y[1]);
  }
  const commit = readCommit(dir);
  const isCollection = COLLECTION.test(slug);
  const mature = MATURE_WORKS.has(slug);
  const url = `https://standardebooks.org/ebooks/${slug.replace(/_/g, '/')}`;
  books++;
  for (const file of readdirSync(textDir).filter((f) => f.endsWith('.xhtml')).sort()) {
    if (SKIP_FILES.test(file)) continue;
    const xhtml = readFileSync(join(textDir, file), 'utf8');
    const part = isCollection ? tag(xhtml, /<title>([^<]+)<\/title>/) : undefined;
    for (const para of xhtmlToParagraphs(xhtml)) {
      for (const t of findTimes(para)) {
        const ex = excerptAround(para, t.start, t.end);
        if (!ex) continue;
        const quote = para.slice(ex.start, ex.end);
        const rec: CandidateRecord = {
          source: 'standard-ebooks',
          workId: slug,
          quote,
          phrase: t.phrase,
          phraseStart: t.start - ex.start,
          phraseEnd: t.end - ex.start,
          minutes: t.minutesOfDay,
          meridiem: t.meridiem,
          approximate: t.approximate,
          author: joinNames(authors),
          title,
          ...(part && part !== title ? { part } : {}),
          ...(translators.length ? { translator: joinNames(translators) } : {}),
          ...(year ? { year } : {}),
          sourceUrl: url,
          license: 'Public domain in the USA; Standard Ebooks edition dedicated to the public domain (CC0 1.0)',
          provenance: {
            repository: `https://github.com/standardebooks/${slug}`,
            ...(commit ? { commit } : {}),
            file: `src/epub/text/${file}`,
          },
          flags: mature ? [...new Set([...contentFlags(quote), 'sexual' as const])] : contentFlags(quote),
        };
        lines.push(JSON.stringify(rec));
      }
    }
  }
}
writeFileSync(outFile, lines.join('\n') + '\n');
console.log(`standard-ebooks: ${books} books, ${lines.length} candidates → ${outFile}`);
