/**
 * Time-expression recognizer for English literary prose.
 *
 * Finds phrases such as "two minutes past three", "a quarter to midnight",
 * "half-past eleven o'clock in the morning", "at 4.37", "the 9:15 train"
 * and returns the minute(s) of the day they refer to.
 *
 * Precision is favoured over recall: bare numbers ("at three") and idioms
 * ("ten to one he'll come") are rejected unless the surrounding words make
 * the clock reading unmistakable.
 */

export type Meridiem = 'am' | 'pm' | 'ambiguous';

export interface TimeMatch {
  /** Character offset of the highlighted phrase within the text. */
  start: number;
  end: number;
  phrase: string;
  /** Hour as written on a 12-hour dial (1–12), or 0–23 when explicit. */
  hour24: number | null;
  hour12: number;
  minute: number;
  meridiem: Meridiem;
  /** Every minute of the day (0–1439) at which this phrase is a correct reading. */
  minutesOfDay: number[];
  /** True when qualified by "nearly", "about", "just after", etc. */
  approximate: boolean;
}

const UNITS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const TEENS = [
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
  'sixteen', 'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['twenty', 'thirty', 'forty', 'fifty'];

/** word → value for 1..59, including "twenty-five", "five-and-twenty". */
const NUMBER_WORDS = new Map<string, number>();
UNITS.forEach((w, i) => NUMBER_WORDS.set(w, i + 1));
TEENS.forEach((w, i) => NUMBER_WORDS.set(w, i + 10));
TENS.forEach((t, ti) => {
  const tv = (ti + 2) * 10;
  NUMBER_WORDS.set(t, tv);
  UNITS.forEach((u, ui) => {
    const v = tv + ui + 1;
    NUMBER_WORDS.set(`${t}-${u}`, v);
    NUMBER_WORDS.set(`${t} ${u}`, v);
    NUMBER_WORDS.set(`${u}-and-${t}`, v);
    NUMBER_WORDS.set(`${u} and ${t}`, v);
  });
});
NUMBER_WORDS.set('forty', 40);

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const alt = (words: string[]) =>
  [...words].sort((a, b) => b.length - a.length).map((w) => esc(w).replace(/ /g, '\\s+')).join('|');

const HOUR_WORDS = [...UNITS, 'ten', 'eleven', 'twelve'];
const HOUR = `(?:${alt(HOUR_WORDS)}|1[0-2]|0?[1-9])`;
const MIN_WORD = `(?:${alt([...NUMBER_WORDS.keys()])})`;
const MIN = `(?:${MIN_WORD}|[1-5]?[0-9])`;
const OCLOCK = `o[’'‘]\\s?clock`;
const B = '(?<![\\p{L}\\p{N}])'; // left boundary
const E = '(?![\\p{L}\\p{N}])'; // right boundary
const SP = '[\\s\\u00a0-]+';
const ANCHOR = '(?:noon|midnight|midday|mid-day)';

/** Words that, immediately before a bare clock reading, make it unmistakably a time. */
const CONTEXT_BEFORE = new RegExp(
  '(?:^|[\\s(“"‘\'—–-])(?:at|by|about|around|till|until|til|’til|before|after|since|from|nearly|almost|just|towards?|' +
    'is|was|were|it[’\']s|’s|\'s|struck|strikes|striking|struck|chimed|chiming|rang|being|be|of|to|and|or|past|gone|' +
    'exactly|precisely|punctually|sharp|nigh|upon|on|between|the)' +
    '(?:\\s+(?:exactly|precisely|about|nearly|almost|just|only|already|now|after|before|past|gone|turned|quite|long|well|' +
    'some|close|on|upon|a\\s+little|shortly|soon|half|at))*\\s+$',
  'iu',
);

/** Stronger context for readings that are otherwise just numbers ("one-ten", "4.30"). */
const STRONG_CONTEXT_BEFORE = new RegExp(
  '(?:^|[\\s(“"‘\'—–-])(?:at|by|about|around|till|until|til|’til|before|after|since|nearly|almost|just|towards?|' +
    'is|was|were|it[’\']s|’s|\'s|struck|strikes|striking|chimed|rang|exactly|precisely|punctually|past|gone|the)' +
    '(?:\\s+(?:exactly|precisely|about|nearly|almost|just|only|already|now|after|before|past|gone|quite|close|on|upon|a\\s+little|shortly|soon|at))*\\s+$',
  'iu',
);

const APPROX_BEFORE =
  /(?:nearly|almost|about|around|close\s+(?:up)?on|towards?|getting\s+on\s+for|just\s+(?:after|before|past|gone)|shortly\s+(?:after|before)|a\s+little\s+(?:after|before|past)|soon\s+after|past|gone|turned|after|before|some\s+time\s+after)\s+$/iu;

const MERIDIEM_SUFFIX = new RegExp(
  '^(?:\\s*(?:(?<amd>a\\.\\s?m\\.?|A\\.\\s?M\\.?)|(?<pmd>p\\.\\s?m\\.?|P\\.\\s?M\\.?))|' +
    '\\s+(?<rel>(?:in|of)\\s+the\\s+(?:morning|forenoon|afternoon|evening|night)|at\\s+night|' +
    '(?:that|this|next|in\\s+the)\\s+(?:morning|afternoon|evening|night)|to-?night|at\\s+noon))' +
    E,
  'u',
);

function wordValue(raw: string): number | null {
  const w = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  if (/^\d+$/.test(w)) return Number(w);
  if (w === 'a' || w === 'one') return 1;
  return NUMBER_WORDS.get(w) ?? null;
}

interface Raw {
  start: number;
  end: number;
  hour: number; // 0–23 if explicit, 1–12 dial otherwise
  minute: number;
  meridiem: Meridiem;
  /** hour field already explicit 24h (e.g. "15:40", noon, midnight) */
  explicit24?: boolean;
  needsContext?: boolean;
  /** must be followed by punctuation or a clock-ish word ("three twenty years ago" is not a time) */
  needsTerminal?: boolean;
  /** reject when preceded by "from"/"between" ("from four to six dollars") */
  rangeSensitive?: boolean;
  strongContext?: boolean;
  /** only valid with an explicit meridiem suffix ("ten to one in the morning") */
  needsSuffix?: boolean;
}

const TERMINAL_AFTER =
  /^(?:\s*[,.;:!?—–)\]”"’'…]|\s*$|\s+(?:a\.\s?m|p\.\s?m|in|at|that|this|when|and|or|sharp|precisely|exactly|train|express|from|to|for|on|the|by|before|after|tonight|to-night|tomorrow|to-morrow|o[’']clock|he|she|they|we|I|you|it)\b)/u;

interface Pattern {
  re: RegExp;
  build: (m: RegExpExecArray) => Omit<Raw, 'start' | 'end'> | null;
}

function anchorHour(a: string): { hour: number; meridiem: Meridiem } {
  const s = a.toLowerCase();
  return s === 'midnight' ? { hour: 0, meridiem: 'am' } : { hour: 12, meridiem: 'pm' };
}

const PATTERNS: Pattern[] = [
  // "twenty-five minutes past three", "a quarter to midnight", "half past eleven o'clock"
  {
    re: new RegExp(
      `${B}(?<amt>(?:a${SP})?quarter|half|(?:a|one)${SP}minute|${MIN}(?<mins>${SP}minutes?)?)${SP}` +
        `(?<dir>past|after|to|before|of|till|til)${SP}(?<h>${HOUR}|${ANCHOR})(?<oc>${SP.replace('-', '')}?${OCLOCK})?${E}`,
      'giu',
    ),
    build: (m) => {
      const g = m.groups!;
      const amt = g.amt.toLowerCase().replace(/\s+/g, ' ');
      const dir = g.dir.toLowerCase();
      let minutes: number | null;
      if (amt.endsWith('quarter')) minutes = 15;
      else if (amt === 'half') minutes = 30;
      else if (/^(?:a|one) minute$/.test(amt)) minutes = 1;
      else minutes = wordValue(amt.replace(/[\s-]+minutes?$/, ''));
      if (minutes == null || minutes < 1 || minutes > 59) return null;
      const toward = dir === 'to' || dir === 'before' || dir === 'of' || dir === 'till' || dir === 'til';
      if (toward && minutes === 30) return null; // "half to" is not English clock usage
      const bareNumber = !g.mins && !/quarter|half|minute/.test(amt);
      if ((dir === 'of' || dir === 'till' || dir === 'til') && bareNumber && !g.oc) return null;
      if (/^\d/.test(g.h) && !g.oc && bareNumber) return null; // "5 past 3" → too noisy
      // "ten to one", "four to one": almost always betting odds, not 12:50 / 12:56
      const oddsRisk = toward && bareNumber && !g.oc && /^one$/i.test(g.h);
      let hour: number;
      let meridiem: Meridiem = 'ambiguous';
      let explicit24 = false;
      if (/^(noon|midnight|midday|mid-day)$/i.test(g.h)) {
        if (g.oc) return null;
        const a = anchorHour(g.h);
        hour = a.hour;
        meridiem = a.meridiem;
        explicit24 = true;
      } else {
        const hv = wordValue(g.h);
        if (hv == null || hv < 1 || hv > 12) return null;
        hour = hv;
      }
      let minute = minutes;
      if (toward) {
        minute = 60 - minutes;
        hour = explicit24 ? (hour + 23) % 24 : hour === 1 ? 12 : hour - 1;
        if (explicit24) meridiem = hour < 12 ? 'am' : 'pm';
      }
      return {
        hour,
        minute,
        meridiem,
        explicit24,
        // "ten to one", "two to three" are odds or ranges as often as times
        needsContext: bareNumber && !g.oc,
        needsTerminal: bareNumber && !g.oc,
        rangeSensitive: bareNumber && !g.oc,
        needsSuffix: oddsRisk,
      };
    },
  },
  // "half-past three" written as one hyphenated word is covered above; "three o'clock"
  {
    re: new RegExp(`${B}(?<h>${HOUR})${SP.replace('-', '')}?(?<oc>${OCLOCK})${E}`, 'giu'),
    build: (m) => {
      const hv = wordValue(m.groups!.h);
      if (hv == null || hv < 1 || hv > 12) return null;
      return { hour: hv, minute: 0, meridiem: 'ambiguous' };
    },
  },
  // "twelve noon", "twelve midnight"
  {
    re: new RegExp(`${B}twelve${SP}(?<a>noon|midnight)${E}`, 'giu'),
    build: (m) => ({ ...anchorHour(m.groups!.a), minute: 0, explicit24: true }),
  },
  // "at noon", "struck midnight"
  {
    re: new RegExp(`${B}(?<a>noon|midnight|midday|mid-day)${E}`, 'giu'),
    build: (m) => ({ ...anchorHour(m.groups!.a.replace('mid-day', 'midday')), minute: 0, explicit24: true, needsContext: true }),
  },
  // "3:15", "15:40", "4.37 a.m.", "the 9.15 train"
  {
    re: /(?<![\p{L}\p{N}.:£$€,])(?<h>[01]?\d|2[0-3])(?<sep>[:.])(?<m>[0-5]\d)(?![\p{N}:]|\.\d|\s?(?:per|%|percent|inches|feet|miles|metres|meters|pounds|lbs?|kg|guineas|shillings|francs|dollars|cents|acres))/gu,
    build: (m) => {
      const h = Number(m.groups!.h);
      const min = Number(m.groups!.m);
      if (h > 23 || min > 59) return null;
      const explicit24 = h === 0 || h > 12;
      return {
        hour: explicit24 ? h : h === 0 ? 12 : h,
        minute: min,
        meridiem: explicit24 ? (h < 12 ? 'am' : 'pm') : 'ambiguous',
        explicit24,
        needsContext: true,
        strongContext: true,
      };
    },
  },
  // "three-fifteen", "eleven forty-five", "six thirty", "four-oh-five"
  {
    re: new RegExp(
      `${B}(?<h>${alt(HOUR_WORDS)})${SP}(?<m>(?:o|oh)${SP}(?:${alt(UNITS)})|${alt(
        [...NUMBER_WORDS.keys()].filter((k) => (NUMBER_WORDS.get(k) ?? 0) >= 10 && !/and/.test(k)),
      )})${E}`,
      'giu',
    ),
    build: (m) => {
      const hv = wordValue(m.groups!.h);
      const raw = m.groups!.m.toLowerCase().replace(/^(?:o|oh)[\s-]+/, '');
      const mv = wordValue(raw);
      if (hv == null || mv == null || hv > 12 || mv > 59) return null;
      if (hv === 12 && mv === 12) return null;
      return { hour: hv, minute: mv, meridiem: 'ambiguous', needsContext: true, needsTerminal: true, strongContext: true };
    },
  },
  // "3 a.m.", "three p.m.", "11pm"
  {
    re: new RegExp(
      `${B}(?<h>${HOUR})(?:\\s?(?<amd>a\\.\\s?m\\.?|A\\.\\s?M\\.?)|\\s?(?<pmd>p\\.\\s?m\\.?|P\\.\\s?M\\.?)|(?<=\\d)\\s?(?<ams>am|AM)|(?<=\\d)\\s?(?<pms>pm|PM))(?![\\p{L}\\p{N}])`,
      'gu',
    ),
    build: (m) => {
      const hv = wordValue(m.groups!.h);
      if (hv == null || hv < 1 || hv > 12) return null;
      const am = !!(m.groups!.amd || m.groups!.ams);
      return { hour: hv, minute: 0, meridiem: am ? 'am' : 'pm' };
    },
  },
  // "three in the afternoon", "eleven at night" (requires preceding context: "at", "was"...)
  {
    re: new RegExp(`${B}(?<h>${alt(HOUR_WORDS)})(?=\\s+(?:in|of)\\s+the\\s+(?:morning|forenoon|afternoon|evening|night)${E}|\\s+at\\s+night${E})`, 'giu'),
    build: (m) => {
      const hv = wordValue(m.groups!.h);
      if (hv == null) return null;
      return { hour: hv, minute: 0, meridiem: 'ambiguous', needsContext: true };
    },
  },
];

function resolveRelative(hour12: number, rel: string): Meridiem {
  const r = rel.toLowerCase();
  if (/morning|forenoon/.test(r)) return 'am';
  if (/afternoon|noon/.test(r)) return hour12 === 12 || hour12 <= 7 ? 'pm' : 'ambiguous';
  if (/evening/.test(r)) return hour12 >= 4 && hour12 <= 11 ? 'pm' : 'ambiguous';
  if (/night/.test(r)) {
    if (hour12 === 12 || hour12 <= 4) return 'am';
    if (hour12 >= 6) return 'pm';
    return 'ambiguous';
  }
  return 'ambiguous';
}

export function minutesFor(hour: number, minute: number, meridiem: Meridiem, explicit24 = false): number[] {
  if (explicit24) return [hour * 60 + minute];
  const h = hour % 12;
  if (meridiem === 'am') return [h * 60 + minute];
  if (meridiem === 'pm') return [(h + 12) * 60 + minute];
  return [h * 60 + minute, (h + 12) * 60 + minute];
}

export function findTimes(text: string): TimeMatch[] {
  const raws: Raw[] = [];
  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = p.re.exec(text))) {
      const built = p.build(m);
      if (!built) continue;
      raws.push({ ...built, start: m.index, end: m.index + m[0].length });
    }
  }
  // Longest-first, non-overlapping
  raws.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const taken: Raw[] = [];
  for (const r of raws) {
    if (taken.some((t) => r.start < t.end && t.start < r.end)) continue;
    taken.push(r);
  }
  taken.sort((a, b) => a.start - b.start);

  const out: TimeMatch[] = [];
  for (const r of taken) {
    const before = text.slice(Math.max(0, r.start - 60), r.start);
    let { meridiem } = r;
    let end = r.end;
    const after = text.slice(end, end + 40);
    const suf = MERIDIEM_SUFFIX.exec(after);
    let hasSuffix = false;
    if (suf && !r.explicit24) {
      hasSuffix = true;
      const g = suf.groups!;
      if (g.amd) meridiem = 'am';
      else if (g.pmd) meridiem = 'pm';
      else if (g.rel) meridiem = resolveRelative(r.hour, g.rel);
      end += suf[0].length;
    }
    if (r.needsSuffix && !hasSuffix) continue;
    if (r.rangeSensitive && /\b(?:from|between|or|and|than|of|odds|bet|lay|wager|by)\s+$/i.test(before)) continue;
    if (r.needsTerminal && !hasSuffix && !TERMINAL_AFTER.test(after)) continue;
    if (r.needsContext && !hasSuffix && !(r.strongContext ? STRONG_CONTEXT_BEFORE : CONTEXT_BEFORE).test(before)) {
      // Allow "4.37 train", "the 9:15 from Paddington"
      const trainish = /^\s+(?:train|express|boat|mail|tube|bus|coach|up|down|from|to|for)\b/i.test(after);
      if (!trainish) continue;
    }
    // Reject dotted decimals followed by money/measure words handled in regex; reject "1.30" in "page 1.30"
    if (/\b(?:page|p\.|vol\.?|chapter|chap\.|verse|psalm|section|§|no\.|number|ch\.)\s*$/i.test(before)) continue;
    const phrase = text.slice(r.start, end);
    const minutesOfDay = minutesFor(r.hour, r.minute, meridiem, r.explicit24);
    const hour12 = r.explicit24 ? (r.hour % 12 === 0 ? 12 : r.hour % 12) : r.hour;
    out.push({
      start: r.start,
      end,
      phrase,
      hour24: minutesOfDay.length === 1 ? Math.floor(minutesOfDay[0] / 60) : null,
      hour12,
      minute: r.minute,
      meridiem: r.explicit24 ? (r.hour < 12 ? 'am' : 'pm') : meridiem,
      minutesOfDay,
      approximate: APPROX_BEFORE.test(before),
    });
  }
  return out;
}

export function formatHHMM(minuteOfDay: number): string {
  const h = Math.floor(minuteOfDay / 60);
  const m = minuteOfDay % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
