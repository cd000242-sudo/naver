// @vitest-environment happy-dom
/**
 * [2026-11-17] Auto tracking keyword.
 *
 * Measured: 168 of 273 published posts could not be used as an exposure measurement because the keyword
 * field was empty, so only "is my own title indexed" was checked. In URL mode the generator already picks
 * a search keyword from the source text (model candidates, checked against Naver monthly search volume
 * when ad keys exist). That pick was dropped on the way to the tracker.
 * Contract:
 *   - a person- or job-supplied keyword always wins;
 *   - otherwise the generator's pick is tracked under its own label ("auto-volume" / "auto-model");
 *   - only a volume-checked pick counts as a ranking measurement — a model-only pick is index-only;
 *   - the title is still never a keyword.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  NO_TRACKING_KEYWORD,
  finalizeTrackingKeyword,
  parseTrackingKeywordFact,
  trackingFactFromKeywordPick,
} from '../analytics/trackingKeyword';
import { summarizeBaseline } from '../analytics/outcomeBaseline';
import { buildRendererContentPolicyContext } from '../renderer/utils/contentPolicyContext';

const TITLE = '제네시스 생산 중단, 11월 3일 재가동됐고 G80 하이브리드는 변수';
const src = (rel: string): string => readFileSync(join(process.cwd(), rel), 'utf8');
const storage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined } as unknown as Storage;
const embedded = (source: string, value = '제네시스 생산 중단') => ({ contentPolicyContext: { trackingKeyword: { value, source } } });
const build = (over: Record<string, unknown> = {}) => buildRendererContentPolicyContext({
  title: TITLE, content: '본문', keywords: [], ...over,
}, storage);

beforeEach(() => { document.body.innerHTML = '<input id="unified-keywords" />'; });

describe('trackingFactFromKeywordPick', () => {
  it('labels a volume-checked pick auto-volume and a model-only pick auto-model', () => {
    expect(trackingFactFromKeywordPick({ keyword: '제네시스 생산 중단', decidedBy: 'search-volume' }))
      .toEqual({ value: '제네시스 생산 중단', source: 'auto-volume' });
    expect(trackingFactFromKeywordPick({ keyword: '제네시스 생산 중단', decidedBy: 'llm-first' }))
      .toEqual({ value: '제네시스 생산 중단', source: 'auto-model' });
  });

  it('returns nothing when there is no pick', () => {
    for (const pick of [undefined, null, {}, { keyword: '', decidedBy: 'search-volume' }, { keyword: '키워드', decidedBy: 'none' }, { keyword: 42, decidedBy: 'llm-first' }, 'x']) {
      expect(trackingFactFromKeywordPick(pick)).toBeUndefined();
    }
  });
});

describe('what an auto keyword is allowed to count as', () => {
  it('parseTrackingKeywordFact accepts the two auto origins', () => {
    for (const source of ['auto-volume', 'auto-model'] as const) {
      expect(parseTrackingKeywordFact({ value: '전기요금 폭탄', source })).toEqual({ value: '전기요금 폭탄', source });
    }
  });

  it('a volume-checked pick is a ranking measurement', () => {
    expect(finalizeTrackingKeyword({ value: '제네시스 생산 중단', source: 'auto-volume' }, TITLE))
      .toEqual({ value: '제네시스 생산 중단', source: 'auto-volume', kind: 'exposure' });
  });

  it('a model-only pick is recorded but never counted as a ranking measurement', () => {
    expect(finalizeTrackingKeyword({ value: '제네시스 생산 중단', source: 'auto-model' }, TITLE))
      .toEqual({ value: '제네시스 생산 중단', source: 'auto-model', kind: 'index-only' });
  });

  it('an auto pick that is just the title is still not a keyword', () => {
    expect(finalizeTrackingKeyword({ value: TITLE, source: 'auto-volume' }, TITLE)).toEqual(NO_TRACKING_KEYWORD);
  });

  it('a sentence-like auto pick is index-only even when volume-checked', () => {
    const verdict = finalizeTrackingKeyword({ value: '제네시스 생산이 왜 중단됐고 언제 다시 시작하는지', source: 'auto-volume' }, TITLE);
    expect(verdict).toMatchObject({ source: 'auto-volume', kind: 'index-only' });
  });

  it('typed keywords behave exactly as before', () => {
    expect(finalizeTrackingKeyword({ value: '제네시스 생산 중단', source: 'user-input' }, TITLE))
      .toEqual({ value: '제네시스 생산 중단', source: 'user-input', kind: 'exposure' });
  });
});

describe('renderer claim at publish time — who wins', () => {
  it('an embedded auto claim is forwarded when the person typed nothing', () => {
    expect(build({ structuredContent: embedded('auto-volume') }).trackingKeyword)
      .toEqual({ value: '제네시스 생산 중단', source: 'auto-volume' });
    expect(build({ structuredContent: embedded('auto-model'), keywordsFromUserInput: false, keywords: [TITLE] }).trackingKeyword)
      .toEqual({ value: '제네시스 생산 중단', source: 'auto-model' });
  });

  it('a keyword the person typed after generation beats the auto claim', () => {
    expect(build({ structuredContent: embedded('auto-volume'), keywords: ['G80 하이브리드 출고'] }).trackingKeyword)
      .toEqual({ value: 'G80 하이브리드 출고', source: 'user-input' });
  });

  it('when the keyword list just carries the auto pick itself, it keeps the auto label', () => {
    expect(build({ structuredContent: embedded('auto-volume'), keywords: ['제네시스 생산 중단'] }).trackingKeyword)
      .toEqual({ value: '제네시스 생산 중단', source: 'auto-volume' });
  });

  it('a real embedded claim (typed / LEWORD / job) still wins over everything, as before', () => {
    expect(build({ structuredContent: embedded('leword', '가상자산 과세 유예'), keywords: ['다른 키워드'] }).trackingKeyword)
      .toEqual({ value: '가상자산 과세 유예', source: 'leword' });
  });

  it('no auto claim and no typed keyword — still nothing, and never the title', () => {
    expect(build().trackingKeyword).toBeUndefined();
    expect(build({ keywords: [TITLE] }).trackingKeyword).toBeUndefined();
  });
});

describe('wiring', () => {
  it('the generator returns its URL-mode pick on the result (source objects are copied on the way)', () => {
    const generator = src('src/contentGenerator.ts');
    expect(generator).toMatch(/urlKeywordPick:\s*\{\s*keyword:\s*pick\.keyword,\s*decidedBy:\s*pick\.decidedBy\s*\}/);
    expect(generator).toMatch(/Object\.assign\(finished,\s*\{\s*autoKeywordPick:\s*urlKeywordPick\s*\}\)/);
    expect(generator).not.toMatch(/metadata as any\)\.keywordPick\s*=/);
  });

  it('main reads the pick from what the generator returned, only as a fallback', () => {
    const main = src('src/main.ts');
    expect(main).toMatch(/contentPolicyContext\?\.trackingKeyword\s*\r?\n\s*\?\?\s*trackingFactFromKeywordPick\(manualAutoKeywordPick\)/);
    expect(main).toMatch(/manualAutoKeywordPick = \(generated as any\)\?\.autoKeywordPick \?\? manualAutoKeywordPick/);
    expect(main).toMatch(/generate:\s*generateOnceTracked/);
    expect(main).toMatch(/trackingFactFromContentSource\(contentSource\)\s*\?\?\s*trackingFactFromKeywordPick\(\(generated as any\)\?\.autoKeywordPick\)/);
    expect(main).not.toMatch(/metadata\?\.keywordPick/);
  });

  it('the renderer-side tracker sends the auto source too, so it is not mislabelled user-input', () => {
    const renderer = src('src/renderer/renderer.ts');
    expect(renderer).toMatch(/keywordSource:\s*resolveTrackingKeywordSource\(content,\s*_trackingKeyword\)/);
    expect(renderer).toMatch(/_last\.keywordSource \? \{ keywordSource: _last\.keywordSource \}/);
    expect(renderer).toMatch(/squashed\(fromInput\) !== squashed\(content\?\.selectedTitle\)/);
    expect(src('src/preload.ts')).toMatch(/trackPublishedPost: async \(req: \{[^}]*keywordSource\?: string;/);
  });
});

describe('baseline report counts the auto sources separately', () => {
  it('has its own buckets', () => {
    const post = (id: string, keywordSource: string) => ({
      id, title: `t${id}`, keyword: `키워드 ${id}`, keywordSource, publishedAt: '2026-11-17T00:00:00Z', exposureChecks: [],
    });
    const report = summarizeBaseline([post('1', 'auto-volume'), post('2', 'auto-model'), post('3', 'user-input')] as never);
    expect(report.keywordSource['auto-volume']).toBe(1);
    expect(report.keywordSource['auto-model']).toBe(1);
    expect(report.keywordSource['user-input']).toBe(1);
  });
});
