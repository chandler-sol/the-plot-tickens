import { describe, expect, it } from 'vitest';
import { contentFlags, dedupeKey, excerptAround, sentenceSpans } from '../pipeline/lib/text';
import { validate } from '../pipeline/lib/validate';
import { displayName, gutenbergBody, paragraphs, workTitle } from '../pipeline/lib/gutenberg';
import type { CandidateRecord } from '../pipeline/lib/schema';

const rec = (over: Partial<CandidateRecord> = {}): CandidateRecord => ({
  source: 't', workId: 'w', quote: 'It was half past ten when the carriage came round.', phrase: 'half past ten', phraseStart: 7, phraseEnd: 20,
  minutes: [630, 1350], meridiem: 'ambiguous', approximate: false, author: 'A', title: 'T', license: 'PD', flags: [], ...over,
});

describe('duplicate detection', () => {
  it('normalises case, punctuation, quotes and accents', () => {
    expect(dedupeKey('“Half past TEN,” she said—quietly.')).toBe(dedupeKey('"half past ten" she said... quietly'));
    expect(dedupeKey('café')).toBe(dedupeKey('Cafe'));
  });
});

describe('excerpting', () => {
  it('does not split on abbreviations', () => {
    const t = 'Mr. Holmes rose at seven. Dr. Watson followed.';
    expect(sentenceSpans(t).map((s) => t.slice(s.start, s.end))).toEqual(['Mr. Holmes rose at seven.', 'Dr. Watson followed.']);
  });

  it('returns whole sentences containing the phrase without altering text', () => {
    const t = 'The rain had stopped. It was nearly midnight when he came. Nobody spoke.';
    const i = t.indexOf('midnight');
    const ex = excerptAround(t, i, i + 8, { target: 10, max: 400 })!;
    expect(t.slice(ex.start, ex.end)).toBe('It was nearly midnight when he came.');
  });

  it('rejects passages that are too long to display', () => {
    const t = `${'word '.repeat(200)}at noon.`;
    expect(excerptAround(t, t.length - 8, t.length - 1, { target: 100, max: 300 })).toBeNull();
  });
});

describe('validation', () => {
  it('accepts a well-formed record', () => expect(validate(rec())).toBeNull());
  it('catches phrase offsets that do not match', () => expect(validate(rec({ phraseStart: 6 }))).toBe('phrase-mismatch'));
  it('catches missing attribution and licence', () => {
    expect(validate(rec({ author: '' }))).toBe('missing-attribution');
    expect(validate(rec({ license: '' }))).toBe('missing-license');
  });
  it('catches impossible minutes', () => expect(validate(rec({ minutes: [1440] }))).toBe('bad-minutes'));
});

describe('content flags', () => {
  it('flags categories by word list', () => {
    expect(contentFlags('He drew the knife and murdered him at midnight.')).toContain('violence');
    expect(contentFlags('A quiet afternoon with tea at four.')).toEqual([]);
    expect(contentFlags('a chink in the armour')).toEqual([]);
  });
});

describe('Project Gutenberg text handling', () => {
  it('drops volume numbers from work titles', () => {
    expect(workTitle('Paul Clifford — Volume 07')).toBe('Paul Clifford');
    expect(workTitle('A Charming Fellow, Volume III')).toBe('A Charming Fellow');
    expect(workTitle('The Volume of Light')).toBe('The Volume of Light');
  });

  const book = [
    'The Project Gutenberg EBook of Test', '', '*** START OF THIS PROJECT GUTENBERG EBOOK TEST ***', '', 'Produced by Someone', '',
    'CHAPTER I', '', 'It was _exactly_ ten o\'clock--no', 'more, no less.', '', '*** END OF THIS PROJECT GUTENBERG EBOOK TEST ***', 'licence text',
  ].join('\n');
  it('strips boilerplate and unwraps paragraphs', () => {
    const body = gutenbergBody(book)!;
    expect(body).not.toMatch(/licence text/);
    expect(paragraphs(body)).toEqual(["It was exactly ten o'clock—no more, no less."]);
  });
  it('refuses copyrighted eBooks', () => {
    expect(gutenbergBody(`Copyrighted Project Gutenberg eBook\n${book}`)).toBeNull();
  });
  it('formats catalogue names', () => {
    expect(displayName('Austen, Jane')).toBe('Jane Austen');
    expect(displayName('Twain, Mark, 1835-1910')).toBe('Mark Twain');
    expect(displayName('Lytton, Edward Bulwer Lytton, Baron')).toBe('Edward Bulwer Lytton');
    expect(displayName('Caine, Hall, Sir')).toBe('Hall Caine');
    expect(displayName('Disraeli, Benjamin, Earl of Beaconsfield')).toBe('Benjamin Disraeli');
    expect(displayName('Dunsany, Lord')).toBe('Lord Dunsany');
    expect(displayName('Marquis, Don')).toBe('Don Marquis');
    expect(displayName('Biggers, Earl Derr')).toBe('Earl Derr Biggers');
  });
});
