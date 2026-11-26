import { BRAND } from '../config/brand';
import type { Quote } from './types';
import { formatMinute } from './time';

export function quoteAsText(q: Quote, hour12 = true): string {
  const title = q.part ? `“${q.part}”, ${q.title}` : q.title;
  const meta = [q.year, q.translator ? `trans. ${q.translator}` : null].filter(Boolean).join(', ');
  return `${q.text}\n\n— ${q.author}, ${title}${meta ? ` (${meta})` : ''}\n\n${formatMinute(q.minute, hour12)} · ${BRAND.name}`;
}

export function quoteAsMarkdown(q: Quote): string {
  const t = q.text;
  const body = `${t.slice(0, q.phraseStart)}**${t.slice(q.phraseStart, q.phraseEnd)}**${t.slice(q.phraseEnd)}`;
  const quoted = body
    .split('\n')
    .map((l) => `> ${l}`)
    .join('\n');
  const title = q.part ? `“${q.part}”, *${q.title}*` : `*${q.title}*`;
  return `${quoted}\n>\n> — ${q.author}, ${title}${q.year ? ` (${q.year})` : ''}${q.translator ? `, trans. ${q.translator}` : ''}\n`;
}

export interface ImageStyle {
  bg: string;
  fg: string;
  muted: string;
  hl: string;
  fontFamily: string;
  width?: number;
  height?: number;
}

interface Token {
  text: string;
  bold: boolean;
  space: boolean;
  newline?: boolean;
}

function tokenize(q: Quote): Token[] {
  const out: Token[] = [];
  const push = (s: string, bold: boolean) => {
    for (const part of s.split(/(\n|\s+)/)) {
      if (!part) continue;
      if (part === '\n') out.push({ text: '', bold, space: false, newline: true });
      else if (/^\s+$/.test(part)) out.push({ text: ' ', bold, space: true });
      else out.push({ text: part, bold, space: false });
    }
  };
  push(q.text.slice(0, q.phraseStart), false);
  push(q.text.slice(q.phraseStart, q.phraseEnd), true);
  push(q.text.slice(q.phraseEnd), false);
  return out;
}

/** Lay out quote text into lines that fit `maxWidth` at `size`. */
function layout(ctx: CanvasRenderingContext2D, tokens: Token[], size: number, family: string, maxWidth: number) {
  const fontFor = (b: boolean) => `${b ? 700 : 400} ${size}px ${family}`;
  const lines: { tokens: Token[]; width: number }[] = [];
  let line: Token[] = [];
  let w = 0;
  const measure = (t: Token) => {
    ctx.font = fontFor(t.bold);
    return ctx.measureText(t.text).width;
  };
  for (const t of tokens) {
    if (t.newline) {
      lines.push({ tokens: line, width: w });
      line = [];
      w = 0;
      continue;
    }
    if (t.space && line.length === 0) continue;
    const tw = measure(t);
    if (!t.space && w + tw > maxWidth && line.length) {
      while (line.length && line[line.length - 1].space) {
        w -= measure(line.pop()!);
      }
      lines.push({ tokens: line, width: w });
      line = [];
      w = 0;
    }
    line.push(t);
    w += tw;
  }
  if (line.length) lines.push({ tokens: line, width: w });
  return { lines, fontFor, measure };
}

export async function renderQuoteImage(q: Quote, style: ImageStyle): Promise<Blob> {
  const W = style.width ?? 1080;
  const H = style.height ?? 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  const family = style.fontFamily;
  try {
    await Promise.all([
      document.fonts?.load(`400 40px ${family}`),
      document.fonts?.load(`700 40px ${family}`),
      document.fonts?.load(`italic 400 40px ${family}`),
    ]);
  } catch {
    /* fall back to whatever is available */
  }
  ctx.fillStyle = style.bg;
  ctx.fillRect(0, 0, W, H);
  const margin = Math.round(W * 0.1);
  const maxWidth = W - margin * 2;
  const top = Math.round(H * 0.16);
  const bottomReserve = Math.round(H * 0.24);
  const avail = H - top - bottomReserve;
  const tokens = tokenize(q);

  let size = 64;
  let result = layout(ctx, tokens, size, family, maxWidth);
  while (size > 22 && result.lines.length * size * 1.36 > avail) {
    size -= 2;
    result = layout(ctx, tokens, size, family, maxWidth);
  }
  const lh = size * 1.36;
  const blockH = result.lines.length * lh;
  let y = top + Math.max(0, (avail - blockH) / 2) + size;

  // small time at top
  ctx.fillStyle = style.muted;
  ctx.font = `400 ${Math.round(W * 0.028)}px ${family}`;
  ctx.textAlign = 'center';
  ctx.fillText(formatMinute(q.minute, true), W / 2, Math.round(H * 0.08));
  ctx.textAlign = 'left';

  for (const line of result.lines) {
    let x = margin;
    for (const t of line.tokens) {
      ctx.font = result.fontFor(t.bold);
      ctx.fillStyle = t.bold ? style.hl : style.fg;
      ctx.fillText(t.text, x, y);
      x += ctx.measureText(t.text).width;
    }
    y += lh;
  }

  // attribution, right-aligned
  ctx.textAlign = 'right';
  const asize = Math.max(26, Math.round(size * 0.58));
  let ay = Math.min(H - bottomReserve + asize * 1.6, y + asize * 1.2);
  ctx.fillStyle = style.muted;
  ctx.font = `400 ${asize}px ${family}`;
  ctx.fillText(`— ${q.author}`, W - margin, ay);
  ay += asize * 1.35;
  ctx.font = `italic 400 ${asize}px ${family}`;
  const title = q.part ? `${q.part}, ${q.title}` : q.title;
  ctx.fillText(title.length > 60 ? `${title.slice(0, 58)}…` : title, W - margin, ay);

  ctx.textAlign = 'center';
  ctx.font = `400 ${Math.round(W * 0.022)}px ${family}`;
  ctx.globalAlpha = 0.7;
  ctx.fillText(BRAND.shareFooter, W / 2, H - Math.round(H * 0.045));
  ctx.globalAlpha = 1;

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'));
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}
