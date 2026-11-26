import { describe, expect, it } from 'vitest';
import { findTimes, formatHHMM } from '../pipeline/lib/timeParse';

const read = (s: string) => findTimes(s).map((m) => ({ phrase: m.phrase, at: m.minutesOfDay.map(formatHHMM), meridiem: m.meridiem }));

describe('time phrase recognition', () => {
  it('reads the canonical example at both 3:02s', () => {
    expect(read('It was only two minutes past three, but I seemed to have lived hours in that two minutes.')).toEqual([
      { phrase: 'two minutes past three', at: ['03:02', '15:02'], meridiem: 'ambiguous' },
    ]);
  });

  it.each([
    ['at a quarter to midnight the bell rang', 'a quarter to midnight', ['23:45']],
    ['the clock struck midnight', 'midnight', ['00:00']],
    ['we lunched at noon', 'noon', ['12:00']],
    ['ten minutes past midnight', 'ten minutes past midnight', ['00:10']],
    ['ten minutes to noon', 'ten minutes to noon', ['11:50']],
    ['the clock struck twelve noon', 'twelve noon', ['12:00']],
    ['twenty minutes past twelve', 'twenty minutes past twelve', ['00:20', '12:20']],
    ['a quarter to one', 'a quarter to one', ['00:45', '12:45']],
  ])('midnight and noon: %s', (text, phrase, at) => {
    expect(read(text)[0]).toMatchObject({ phrase, at });
  });

  it.each([
    ['It was half-past eleven o’clock in the morning.', ['11:30'], 'am'],
    ['at three in the afternoon', ['15:00'], 'pm'],
    ['Two o’clock at night.', ['02:00'], 'am'],
    ['eleven o’clock at night', ['23:00'], 'pm'],
    ['at nine o’clock in the evening', ['21:00'], 'pm'],
    ['He came at 7 p.m. sharp.', ['19:00'], 'pm'],
    ['at 3:15 a.m.', ['03:15'], 'am'],
    ['at 15:40 precisely', ['15:40'], 'pm'],
    ['at six thirty in the morning', ['06:30'], 'am'],
  ])('explicit AM/PM: %s', (text, at, meridiem) => {
    expect(read(text)[0]).toMatchObject({ at, meridiem });
  });

  it('keeps 12-hour readings ambiguous without context', () => {
    expect(read('Three o’clock struck.')[0]).toMatchObject({ at: ['03:00', '15:00'], meridiem: 'ambiguous' });
  });

  it.each([
    ['five-and-twenty minutes to four', ['03:35', '15:35']],
    ['It was ten to six.', ['05:50', '17:50']],
    ['at twenty past four, he left', ['04:20', '16:20']],
    ['We caught the 4.37 train.', ['04:37', '16:37']],
    ['I am here at eleven-fifteen.', ['11:15', '23:15']],
    ['half after seven', ['07:30', '19:30']],
    ['a minute to twelve', ['11:59', '23:59']],
  ])('minute arithmetic: %s', (text, at) => {
    expect(read(text)[0].at).toEqual(at);
  });

  it.each([
    'Ten to one he will come.',
    'averaged from four to six dollars a day',
    'varying from one to eleven—a limit which was never exceeded',
    'It cost 3.15 dollars.',
    'John 3:16 says',
    'a midnight feast',
    'half of one',
    'a quarter of an hour',
    'she was three twenty years ago',
    'see page 4.30 of the report',
  ])('rejects non-times: %s', (text) => {
    expect(read(text)).toEqual([]);
  });

  it('marks approximate readings', () => {
    expect(findTimes('It was nearly nine o’clock.')[0].approximate).toBe(true);
    expect(findTimes('It was nine o’clock.')[0].approximate).toBe(false);
  });

  it('returns exact offsets for highlighting', () => {
    const t = 'He left at half past ten, as usual.';
    const [m] = findTimes(t);
    expect(t.slice(m.start, m.end)).toBe('half past ten');
  });
});

describe('idioms and weak context', () => {
  it.each([
    'occasionally getting in a hard body-blow, it was four to one against him',
    'we have their description, it’s ten to one we have them by night',
    'the meeting of canoes, the half of one-ten, laden with goods',
  ])('rejects: %s', (text) => {
    expect(findTimes(text)).toEqual([]);
  });

  it('still accepts "ten to one" with an explicit time of day', () => {
    expect(findTimes('at ten to one in the morning')[0].minutesOfDay).toEqual([50]);
  });
});
