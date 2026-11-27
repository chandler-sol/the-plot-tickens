import { cleanInvisible } from './text.ts';

const TITLE = /^(?:Sir|Dame|Lord|Lady|Baron|Baroness|Count|Countess|Earl|Viscount|Viscountess|Marquis|Marquess|Duke|Duchess)\b/;

/**
 * Catalogue name → display name.
 *   "Austen, Jane" → "Jane Austen"; "Caine, Hall, Sir" → "Hall Caine";
 *   "Orczy, Emmuska Orczy, Baroness" → "Emmuska Orczy"; "Dunsany, Lord" → "Lord Dunsany".
 */
export function displayName(agent: string): string {
  const clean = agent.replace(/\(.*?\)/g, '').replace(/,?\s*\d{3,4}\??-\d{0,4}\??/g, '').trim();
  const parts = clean.split(',').map((x) => x.trim()).filter(Boolean);
  if (parts.length < 2) return parts.join(' ');
  const [surname, ...rest] = parts;
  const given = rest.filter((x) => !TITLE.test(x)).join(' ');
  if (!given) return `${rest[0]} ${surname}`.replace(/\s+/g, ' ');
  if (given === surname || given.endsWith(` ${surname}`)) return given.replace(/\s+/g, ' ');
  return `${given} ${surname}`.replace(/\s+/g, ' ');
}

/** "Paul Clifford — Volume 07" → "Paul Clifford" (multi-volume eBooks share one work). */
export function workTitle(title: string): string {
  return title.replace(/\s*[,—–:-]\s*(?:Volume|Vol\.?|Part|Book)\s+(?:\d+|[IVXLC]+)\.?\s*$/i, '').trim() || title;
}

export function gutenbergBody(raw: string): string | null {
  const text = raw.replace(/\r\n?/g, '\n');
  const start = /^\*{3}\s*START OF (?:THE|THIS) PROJECT GUTENBERG[^\n]*$/im.exec(text);
  const end = /^\*{3}\s*END OF (?:THE|THIS) PROJECT GUTENBERG[^\n]*$/im.exec(text);
  if (!start || !end || end.index <= start.index) return null;
  const header = text.slice(0, start.index);
  if (/Copyrighted Project Gutenberg/i.test(header)) return null;
  let body = text.slice(start.index + start[0].length, end.index);
  // Skip editorial front matter (prefaces by others, transcriber notes) when a first chapter heading is near the start.
  const ch = /^\s*(?:CHAPTER|Chapter|BOOK|Book)\s+(?:I|1|ONE|One|THE FIRST)\b[^\n]*$/m.exec(body);
  if (ch && ch.index < body.length * 0.2) body = body.slice(ch.index);
  return body;
}

export function paragraphs(body: string): string[] {
  const out: string[] = [];
  for (const block of body.split(/\n\s*\n/)) {
    const lines = block.split('\n').map((l) => l.replace(/\s+$/, ''));
    if (!lines.some((l) => l.trim())) continue;
    const joined = lines.join(' ');
    if (/gutenberg|transcriber|produced by|proofread|e-?text|\[illustration|\[footnote/i.test(joined)) continue;
    if (joined.length < 40 || joined === joined.toUpperCase()) continue;
    const verse = lines.length > 1 && lines.every((l) => l.trim().length < 60) && lines.filter((l) => /^\s{2,}/.test(l)).length >= 1;
    let p = verse ? lines.map((l) => l.trim()).join('\n') : lines.map((l) => l.trim()).join(' ');
    p = p
      .replace(/_([^_\n]+)_/g, '$1') // _italics_ markup
      .replace(/\[\d+\]/g, '') // footnote markers
      .replace(/(?<!-)--(?!-)/g, '—') // ASCII em dash convention
      .replace(/ {2,}/g, ' ');
    out.push(cleanInvisible(p));
  }
  return out;
}

