import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * [2026-09-02 사장님 승인] "앞 3자 강제" 는 SPEC-KEYWORD-ENDGAME Phase 1 로 만들어졌지만 production 에서
 * 한 번도 불린 적이 없었다(ensureFront3 를 넘기는 호출처 0). 검색으로 들어오는 모드에만 건다.
 */
describe('앞 3자 강제는 실제로 배선돼 있다', () => {
  const src = readFileSync(resolve(__dirname, '..', 'contentGenerator.ts'), 'utf-8').replace(/\r/g, '');

  it('마지막 키워드 접두 단계가 검색 모드에서 ensureFront3 를 켠다', () => {
    const at = src.indexOf('applyKeywordPrefixToStructuredContent(finalContent, primaryKeyword, {');
    expect(at).toBeGreaterThan(0);
    expect(src.slice(at, at + 900)).toMatch(/ensureFront3: isSearchDrivenTitleMode\(source\.contentMode\)/u);
  });

  it('홈판은 손대지 않는다 — isSearchDrivenTitleMode 가 판단한다', () => {
    expect(src).toMatch(/import \{ isSearchDrivenTitleMode \} from '\.\/content\/titleModeObjective\.js';/u);
  });
});
