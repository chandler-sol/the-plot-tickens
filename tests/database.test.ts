import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DatasetMeta, Shard } from '../src/core/types';

const DIR = 'public/data';
const meta = JSON.parse(readFileSync(join(DIR, 'meta.json'), 'utf8')) as DatasetMeta;
const shards: Shard[] = meta.shardFiles!.map((f) => JSON.parse(readFileSync(join(DIR, f), 'utf8')));

describe('shipped quotation database', () => {
  it('has 24 hourly shards that exist', () => {
    expect(meta.shardFiles).toHaveLength(24);
    for (const f of meta.shardFiles!) expect(existsSync(join(DIR, f))).toBe(true);
  });

  it('keys every quotation to a minute inside its shard’s hour, with matching counts', () => {
    const counts = new Array(1440).fill(0);
    shards.forEach((s, h) => {
      expect(s.hour).toBe(h);
      for (const [k, rows] of Object.entries(s.minutes)) {
        const m = Number(k);
        expect(Math.floor(m / 60)).toBe(h);
        counts[m] += rows.length;
      }
    });
    expect(counts).toEqual(meta.counts);
  });

  it('highlights a real time phrase in every row and references valid works', () => {
    const timeish = /o[’'‘]\s?clock|past|to|after|before|of|till|half|quarter|noon|midnight|midday|\d|a\.\s?m|p\.\s?m|morning|afternoon|evening|night|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve/i;
    for (const s of shards)
      for (const [k, rows] of Object.entries(s.minutes)) {
        const ids = new Set<string>();
        for (const [id, text, ps, pe, wi, mer, , ax] of rows) {
          expect(ids.has(id), `duplicate id ${id} at ${k}`).toBe(false);
          ids.add(id);
          expect(ps).toBeGreaterThanOrEqual(0);
          expect(pe).toBeGreaterThan(ps);
          expect(pe).toBeLessThanOrEqual(text.length);
          expect(text.slice(ps, pe)).toMatch(timeish);
          expect(meta.works[wi], `work ${wi}`).toBeDefined();
          if (mer === 1) expect(Number(k)).toBeLessThan(720);
          if (mer === 2) expect(Number(k)).toBeGreaterThanOrEqual(720);
          expect([0, 1]).toContain(ax);
        }
      }
  });

  it('attributes every work with a known source and licence', () => {
    for (const w of meta.works) {
      expect(w[0].length).toBeGreaterThan(0);
      expect(w[1].length).toBeGreaterThan(0);
      expect(meta.sources[w[5]]?.license).toBeTruthy();
    }
    expect(meta.sources.map((s) => s.key)).not.toContain('litclock-kapoorankush');
  });

  it('does not repeat the same text twice within a minute', () => {
    for (const s of shards)
      for (const rows of Object.values(s.minutes)) {
        const texts = rows.map((r) => r[1].toLowerCase().replace(/[^a-z]/g, ''));
        expect(new Set(texts).size).toBe(texts.length);
      }
  });
});
