/** Sentence segmentation, excerpting and content flagging for literary prose. */

const ABBREVIATIONS = new Set(
  [
    'mr', 'mrs', 'messrs', 'dr', 'st', 'mme', 'mlle', 'm', 'capt', 'col', 'gen', 'rev', 'prof', 'sr', 'jr', 'lt',
    'sgt', 'gov', 'hon', 'esq', 'no', 'vs', 'viz', 'cf', 'ft', 'mt', 'co', 'bros', 'inc', 'vol', 'ch', 'p', 'pp',
    'a.m', 'p.m', 'i.e', 'e.g', 'u.s', 'ld', 'bart', 'sq', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep',
    'sept', 'oct', 'nov', 'dec', 'mon', 'tues', 'wed', 'thurs', 'fri', 'sat', 'sun', 'fig', 'op', 'ms', 'mss',
  ],
);

export interface Span {
  start: number;
  end: number;
}

/** Split a paragraph into sentence spans, conservatively. */
export function sentenceSpans(text: string): Span[] {
  const spans: Span[] = [];
  const re = /[.!?…]+[”’"')\]]*(?=\s+[“‘"'([]?[\p{Lu}\p{N}—])/gu;
  let start = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const endPunct = m.index + m[0].length;
    if (m[0].startsWith('.')) {
      const head = text.slice(Math.max(0, m.index - 12), m.index);
      const word = /([\p{L}.]+)$/u.exec(head)?.[1]?.toLowerCase() ?? '';
      if (ABBREVIATIONS.has(word) || /^\p{L}$/u.test(word)) continue;
    }
    spans.push({ start, end: endPunct });
    start = endPunct;
    while (start < text.length && /\s/.test(text[start])) start++;
  }
  if (start < text.length) spans.push({ start, end: text.length });
  return spans;
}

export interface ExcerptOptions {
  target: number;
  max: number;
}

/**
 * Choose a run of whole sentences around [phraseStart, phraseEnd).
 * Never alters the text; returns null if the minimal excerpt is too long.
 */
export function excerptAround(
  text: string,
  phraseStart: number,
  phraseEnd: number,
  opts: ExcerptOptions = { target: 160, max: 520 },
): { start: number; end: number } | null {
  const spans = sentenceSpans(text);
  let first = spans.findIndex((s) => s.end > phraseStart);
  let last = spans.findIndex((s) => s.end >= phraseEnd);
  if (first < 0 || last < 0) return null;
  const len = () => spans[last].end - spans[first].start;
  if (len() > opts.max) return null;
  while (len() < opts.target) {
    const nextLen = last + 1 < spans.length ? spans[last + 1].end - spans[first].start : Infinity;
    const prevLen = first > 0 ? spans[last].end - spans[first - 1].start : Infinity;
    if (nextLen <= opts.max * 0.7 && nextLen <= prevLen + 40) last++;
    else if (prevLen <= opts.max * 0.7) first--;
    else break;
  }
  let s = spans[first].start;
  let e = spans[last].end;
  while (s < e && /\s/.test(text[s])) s++;
  while (e > s && /\s/.test(text[e - 1])) e--;
  return { start: s, end: e };
}

export type ContentFlag = 'slur' | 'profanity' | 'sexual' | 'violence' | 'drugs';

const FLAG_PATTERNS: Record<ContentFlag, RegExp> = {
  slur: /\b(?:nigg(?:er|ers|ah|a|uh)s?|darke?y|darkies|pickaninn(?:y|ies)|kikes?|dagoe?s?|wops?|squaws?|redskins?|half-breeds?|sambo|wogs?|gooks?|chinam[ae]n|coolies?)\b/iu,
  profanity: /\b(?:fuck\w*|shit\w*|bitch\w*|bastards?|damn\w*|god-?damn?\w*|piss\w*|cunt\w*|arse\w*|bugger\w*)\b/iu,
  sexual: /\b(?:naked|nude|nudity|lust\w*|seduc\w*|whores?|harlots?|prostitut\w*|brothels?|sexual\w*|orgasm\w*|erotic\w*|copulat\w*|fornicat\w*|adulter\w*|rap(?:e|ed|ist|ing)|ravish\w*|bed\s+with|breasts?|nipples?|thighs?)\b/iu,
  violence: /\b(?:murder\w*|kill(?:ed|ing|er|s)?|corpses?|blood\w*|bleed\w*|stabb?\w*|strangl\w*|suicide\w*|throat\s+cut|hang(?:ed|ing)\s+(?:him|her|himself|herself)|tortur\w*|slaughter\w*|massacre\w*|executed|execution|gallows|dead\s+body|shot\s+(?:dead|him|her))\b/iu,
  drugs: /\b(?:opium|cocaine|morphia|morphine|laudanum|heroin|hashish|hasheesh|chloral|absinthe)\b/iu,
};

export function contentFlags(text: string): ContentFlag[] {
  return (Object.keys(FLAG_PATTERNS) as ContentFlag[]).filter((k) => FLAG_PATTERNS[k].test(text));
}

/** Normalised key for duplicate detection: case/punctuation/whitespace-insensitive. */
export function dedupeKey(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Strip invisible typographic controls without changing spelling or punctuation. */
export function cleanInvisible(text: string): string {
  return text
    .replace(/[\u2060\u00ad\u200b\ufeff]/g, '')
    .replace(/[\u200a\u2009\u202f]/g, ' ')
    .replace(/[ \t\u00a0]+/g, (m) => (m.includes('\u00a0') ? '\u00a0' : ' '))
    .replace(/ *\n */g, '\n')
    .trim();
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, '\u00a0')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}
