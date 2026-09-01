import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { narrowSearchQueries } from '../content/searchQueryNarrowing.js';

/**
 * [2026-09-02] 라이브에서 잡힌 것 — 카테고리 문을 열어도 재료가 0이었다.
 *
 *   keywords=["9월 가을 환절기 침구 교체: 구스 이불 vs 차렵이불 세탁"]
 *   → [Main] 겪은 사람 말투 재료 없음 (지식iN 답변 0건, reason=no-results)
 *
 * 같은 실행에서 크롤러는 28,934자를 가져왔다. 차이는 하나였다 —
 * sourceAssembler 는 narrowSearchQueries 로 검색어를 좁히는데
 * 지식iN 수집기는 사용자가 넣은 문장을 그대로 검색어로 썼다.
 *
 * 문을 여는 것과 문으로 들어오는 것은 다른 일이다.
 */

const ROOT = resolve(__dirname, '..');
const read = (rel: string) => readFileSync(resolve(ROOT, ...rel.split('/')), 'utf-8').replace(/\r/g, '');

describe('지식iN 수집기가 문장형 키워드를 좁힌다', () => {
  it('실측 키워드에서 검색 가능한 후보가 나온다', () => {
    const narrowed = narrowSearchQueries('9월 가을 환절기 침구 교체: 구스 이불 vs 차렵이불 세탁');
    expect(narrowed.length).toBeGreaterThan(1);
    const chosen = narrowed[1] || narrowed[0];
    expect(chosen).not.toBe('9월 가을 환절기 침구 교체: 구스 이불 vs 차렵이불 세탁');
    expect(chosen.length).toBeLessThan(30);
  });

  it('짧은 키워드는 그대로 둔다 — 기존 동작 보존', () => {
    const narrowed = narrowSearchQueries('제습기');
    expect(narrowed[1] || narrowed[0]).toBe('제습기');
  });

  it('수집기가 좁힌 검색어로 searchKin 을 호출한다', () => {
    const code = read('content/kinExperienceMaterial.ts');
    expect(code).toMatch(/narrowSearchQueries/u);
    expect(code).toMatch(/const searchQuery = narrowed\[1\] \|\| narrowed\[0\] \|\| query/u);
    expect(code).toMatch(/searchKin\(\{ query: searchQuery/u);
  });

  it('원문을 그대로 넘기지 않는다 — 회귀 잠금', () => {
    const code = read('content/kinExperienceMaterial.ts');
    expect(code).not.toMatch(/searchKin\(\{ query,/u);
  });

  it('좁힌 사실을 로그로 남긴다 — 0건 추적이 가능해야 한다', () => {
    const code = read('content/kinExperienceMaterial.ts');
    expect(code).toMatch(/검색어를 좁힙니다/u);
  });
});
