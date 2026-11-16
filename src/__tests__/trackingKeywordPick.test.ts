/**
 * [2026-11-17] Tracking-only keyword pick for posts made without a URL and without a typed keyword
 * (title-only posts, scheduled posts). The generator never picked a search keyword for these, so they could
 * only be index-checked by title. This pick is used for exposure tracking ONLY — it must not change what is
 * generated — and only a keyword with measured monthly search volume is accepted.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { pickTrackingOnlyKeyword, trackingPickText } from '../content/trackingKeywordPick';
import { trackingFactFromKeywordPick } from '../analytics/trackingKeyword';

const LONG = '전기요금 누진제 구간이 여름철에 완화된다. '.repeat(20).trim();
const answer = '1. 전기요금 누진제\n2. 여름 전기요금\n3. 누진제 완화';
const src = (rel: string): string => readFileSync(join(process.cwd(), rel), 'utf8');

describe('pickTrackingOnlyKeyword', () => {
  it('returns the candidate with the largest measured search volume', async () => {
    const inferCandidates = vi.fn(async () => answer);
    const lookupVolume = vi.fn(async (keyword: string) => (keyword.includes('여름') ? 9000 : 1200));
    const pick = await pickTrackingOnlyKeyword(LONG, '제목', { inferCandidates, lookupVolume });
    expect(pick).toEqual({ keyword: '여름 전기요금', decidedBy: 'search-volume' });
    expect(inferCandidates).toHaveBeenCalledTimes(1);
  });

  it('spends no model call when search volume cannot be looked up', async () => {
    const inferCandidates = vi.fn(async () => answer);
    expect(await pickTrackingOnlyKeyword(LONG, '제목', { inferCandidates, lookupVolume: undefined })).toBeNull();
    expect(inferCandidates).not.toHaveBeenCalled();
  });

  it('spends no model call when there is too little text to judge', async () => {
    const inferCandidates = vi.fn(async () => answer);
    expect(await pickTrackingOnlyKeyword('짧은 글', '제목', { inferCandidates, lookupVolume: async () => 100 })).toBeNull();
    expect(inferCandidates).not.toHaveBeenCalled();
  });

  it('rejects a pick nobody is shown to search (no volume for any candidate)', async () => {
    const pick = await pickTrackingOnlyKeyword(LONG, '제목', { inferCandidates: async () => answer, lookupVolume: async () => null });
    expect(pick).toBeNull();
  });

  it('never throws: a failing or hanging model call means "no keyword"', async () => {
    const boom = { inferCandidates: async () => { throw new Error('model down'); }, lookupVolume: async () => 100 };
    expect(await pickTrackingOnlyKeyword(LONG, '제목', boom)).toBeNull();
    const hang = { inferCandidates: () => new Promise<string>(() => undefined), lookupVolume: async () => 100 };
    expect(await pickTrackingOnlyKeyword(LONG, '제목', hang, { timeoutMs: 30 })).toBeNull();
  });
});

describe('trackingPickText', () => {
  it('prefers the collected source text, and falls back to the generated body', () => {
    expect(trackingPickText({ rawText: LONG }, { bodyPlain: '생성 본문' })).toBe(LONG);
    expect(trackingPickText({ rawText: '짧음' }, { bodyPlain: LONG })).toBe(LONG);
    expect(trackingPickText({}, {})).toBe('');
  });
});

describe('a model-only pick is not a tracking keyword', () => {
  it('only a volume-checked pick becomes a claim', () => {
    expect(trackingFactFromKeywordPick({ keyword: '전기요금 누진제', decidedBy: 'search-volume' }))
      .toEqual({ value: '전기요금 누진제', source: 'auto-volume' });
    // Unverified keyword: leave the post as "none" so the tracker still index-checks it by its title.
    expect(trackingFactFromKeywordPick({ keyword: '전기요금 누진제', decidedBy: 'llm-first' })).toBeUndefined();
  });
});

describe('wiring', () => {
  const main = src('src/main.ts');

  it('the person-run handler picks only when nothing else supplied a keyword', () => {
    expect(main).toMatch(/if \(!\(payload\.assembly as any\)\.contentPolicyContext\?\.trackingKeyword && manualAutoKeywordPick === undefined\)/);
    expect(main).toMatch(/manualAutoKeywordPick = await resolveTrackingKeywordPick\(source as any, content\)/);
  });

  it('scheduled and multi-account posts do the same', () => {
    expect(main).toMatch(/smartKeyword\s*\?\s*\{ value: smartKeyword, source: 'schedule-job' \}\s*:\s*trackingFactFromKeywordPick\(await resolveTrackingKeywordPick\(source, generated\)\)/);
    expect(main).toMatch(/dailyAutoKeywordPick = \(generated as any\)\?\.autoKeywordPick !== undefined[\s\S]{0,120}resolveTrackingKeywordPick\(source as any, generated\)/);
  });

  it('the pick never feeds generation: the generator wrapper does not touch source keywords', () => {
    const generator = src('src/contentGenerator.ts');
    const at = generator.indexOf('export async function resolveTrackingKeywordPick');
    expect(at).toBeGreaterThan(0);
    const end = generator.slice(at).search(/\r?\n\}\r?\n/); // this file is CRLF
    const body = generator.slice(at, at + end);
    expect(body).not.toMatch(/metadata/);
    expect(body).toMatch(/resolveSideTaskRoute\(source, 'url-keyword', 'utility'\)/);
  });
});
