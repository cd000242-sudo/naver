import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { normalizeAdKeyword } from '../content/urlModeKeywordPicker';

/**
 * [2026-09-03 라이브 — 헬스헬퍼 맥스컷] 검색량 조회 5건 전부 11001 "hintKeywords 파라미터가 유효하지 않습니다".
 * 띄어쓰기 있는 키워드를 그대로 보냈다. 기존 지표 수집은 공백을 지우고 부른다 — 같은 규칙으로.
 */
describe('광고 API 키워드 정규화', () => {
  it('공백을 지운다 — 실측 키워드', () => {
    expect(normalizeAdKeyword('헬스헬퍼 맥스컷 프로 크롬')).toBe('헬스헬퍼맥스컷프로크롬');
    expect(normalizeAdKeyword('종아리 마사지기 추천')).toBe('종아리마사지기추천');
  });

  it('2자 미만이면 빈 값 — 조회하지 않는다', () => {
    expect(normalizeAdKeyword(' 가 ')).toBe('');
    expect(normalizeAdKeyword('')).toBe('');
  });

  it('배선: 조회기가 정규화한 값으로 analyzeKeyword 를 부른다', () => {
    const src = readFileSync(resolve(__dirname, '..', 'content', 'urlModeKeywordResolve.ts'), 'utf-8').replace(/\r/g, '');
    expect(src).toMatch(/const adKeyword = normalizeAdKeyword\(keyword\);/u);
    expect(src).toMatch(/analyzer\.analyzeKeyword\(adKeyword\)/u);
    expect(src).not.toMatch(/analyzer\.analyzeKeyword\(keyword\)/u);
  });
});
