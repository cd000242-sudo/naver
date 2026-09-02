import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * [2026-09-02 사장님 승인 ②③]
 *  ② 쇼핑 경로도 검색량으로 메인 키워드를 고른다 — 검색량이 확실히 더 클 때만 교체, 못 구하면 유지.
 *  ③ 최종 제목 게이트(동기)는 생성 단계에서 미리 받아 둔 상위 글 제목(source.serpTitles)과 후보를 대조해
 *     상위 다수와 어긋나면 -8. 가산은 없다.
 */
const ROOT = resolve(__dirname, '..');
const read = (rel: string) => readFileSync(resolve(ROOT, ...rel.split('/')), 'utf-8').replace(/\r/g, '');

describe('② 쇼핑 경로 검색량 키워드', () => {
  const gen = read('contentGenerator.ts');
  const fn = gen.slice(gen.indexOf('async function ensureUrlModePrimaryKeyword'), gen.indexOf('async function generateStructuredContentInternal'));

  it('affiliate 는 기존 키워드가 있어도 검색량으로 재검토하고, 다른 모드는 그대로 조기 반환한다', () => {
    // 사용자가 넣은 키워드는 그대로(if (existing) return;) — 분석(upgrade-analysis)이 정한 키워드일 때만 재검토
    expect(fn).toMatch(/if \(existing && source\.contentMode === 'affiliate' && derivedByUpgrade\)/u);
    expect(fn).toContain('if (existing) return;');
    expect(fn).toMatch(/resolveShoppingSearchKeyword\(rawText, productName, existing/u);
    expect(fn).toMatch(/if \(pick\.replaced\)/u);
    expect(fn).toContain('[ShoppingKeyword] 메인 키워드 교체');
    expect(fn).toContain('[ShoppingKeyword] 메인 키워드 유지');
  });

  it('IO 층: 검색량 조회기가 없으면 후보 추론조차 하지 않는다', () => {
    const io = read('content/urlModeKeywordResolve.ts');
    expect(io).toMatch(/if \(!deps\.lookupVolume\) return keep\(/u);
  });
});

describe('③ 상위 글 제목 → 게이트 후보 선택', () => {
  const gen = read('contentGenerator.ts');

  it('생성 단계가 affiliate 에서 상위 글 제목을 미리 받아 source 에 싣는다', () => {
    const at = gen.indexOf('await ensureUrlModePrimaryKeyword(source);');
    const after = gen.slice(at, at + 1400);
    expect(after).toMatch(/fetchSerpTitles\(serpKeyword, 10\)/u);
    expect(after).toMatch(/\(source as any\)\.serpTitles = serpTitles;/u);
  });

  it('게이트가 후보 점수에 상위 글 대조 감점을 더한다 — 가산 없음', () => {
    const gateAt = gen.indexOf('[FinalQualityGate] ⚠️ 최종 제목 품질 미달');
    const gate = gen.slice(gateAt, gateAt + 4000);
    expect(gate).toMatch(/const serpLagPenalty = \(text: string\): number =>/u);
    expect(gate).toMatch(/bench\.verdict === 'lagging' \? -8 : 0/u);
    expect(gate).toMatch(/\.score \+ serpLagPenalty\(text\)/u);
    expect(gate).not.toMatch(/'aligned' \? \+?\d/u);
  });

  it('제목만 가져오는 함수가 있고 실패하면 빈 배열이다', () => {
    const probe = read('analytics/serpProbe.ts');
    expect(probe).toMatch(/export async function fetchSerpTitles\(keyword: string, display: number = 10\): Promise<string\[\]>/u);
    expect(probe).toContain("return [];");
  });
});
