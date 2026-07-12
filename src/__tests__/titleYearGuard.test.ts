import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyKeywordPrefixToTitle as applyContentKeywordPrefix } from '../contentKeywordPrefix';
import { collapseDuplicateLeadingYearTitle as collapseContentYear } from '../contentTitleYearGuard';
import {
  applyKeywordPrefixToTitle as applyRendererKeywordPrefix,
  collapseDuplicateLeadingYearTitle as collapseRendererYear,
} from '../renderer/utils/titleUtils';

const yearCases: Array<[string, string]> = [
  ['2026년 2026 꼼수장학금 신청 방법', '2026년 꼼수장학금 신청 방법'],
  ['2026 2026년 꼼수장학금 신청 방법', '2026년 꼼수장학금 신청 방법'],
  ['2026 2026 2026 꼼수장학금 신청 방법', '2026 꼼수장학금 신청 방법'],
  ['  2026년\n2026   장학금  신청  ', '2026년 장학금 신청'],
  ['2026 지원금과 2025 변경 일정', '2026 지원금과 2025 변경 일정'],
];

describe('duplicate leading year title guard', () => {
  it.each(yearCases)('keeps main and renderer normalization in parity: %s', (input, expected) => {
    expect(collapseContentYear(input)).toBe(expected);
    expect(collapseRendererYear(input)).toBe(expected);
  });

  it('normalizes even when every keyword token is already in the title', () => {
    const title = '2026년 2026 꼼수장학금 신청 방법';
    const keyword = '2026 꼼수장학금 신청 방법';

    expect(applyContentKeywordPrefix(title, keyword)).toBe('2026년 꼼수장학금 신청 방법');
    expect(applyRendererKeywordPrefix(title, keyword)).toBe('2026년 꼼수장학금 신청 방법');
  });

  it('covers renderer prefix construction and partial-token deduplication', () => {
    expect(applyRendererKeywordPrefix('2026년 2026 장학금', '')).toBe('2026년 장학금');
    expect(applyRendererKeywordPrefix('', '다이어트')).toBe('다이어트');
    expect(applyRendererKeywordPrefix('성공 비법 총정리', '다이어트')).toBe('다이어트 성공 비법 총정리');
    expect(applyRendererKeywordPrefix('서울 맛집 베스트', '서울 맛집 추천')).toBe('서울 맛집 추천 베스트');
    expect(applyRendererKeywordPrefix('서울시 여행', '서울 추천')).toBe('서울 추천 서울시 여행');
    expect(applyRendererKeywordPrefix('맛있는 한 끼', '맛')).toBe('맛 있는 한 끼');
  });

  it('uses real imports and never bypasses the renderer title normalizer', () => {
    const contentGeneration = readFileSync(
      join(process.cwd(), 'src', 'renderer', 'modules', 'contentGeneration.ts'),
      'utf8',
    );
    const continuousPublishing = readFileSync(
      join(process.cwd(), 'src', 'renderer', 'modules', 'continuousPublishing.ts'),
      'utf8',
    );

    expect(contentGeneration).toContain("from '../utils/titleUtils.js'");
    expect(continuousPublishing).toContain("from '../utils/titleUtils.js'");
    expect(contentGeneration).not.toContain('declare function applyKeywordPrefixToTitleContinuous');
    expect(continuousPublishing).not.toContain('declare function applyKeywordPrefixToTitle');
    expect(contentGeneration).not.toContain('allTokensPresent');
    expect(continuousPublishing).not.toContain('allTokensPresent');
    expect(contentGeneration).toContain(
      'structuredContent.selectedTitle = applyKeywordPrefixToTitle(currentTitle, coreKeyword);',
    );
    expect(contentGeneration).toContain(
      'const normalizedSeoTitle = applyKeywordPrefixToTitle(seoResult.title, coreKeyword);',
    );
    expect(contentGeneration).toContain('titleInput1.value = normalizedSeoTitle;');
    expect(contentGeneration).toContain('titleInput2.value = normalizedSeoTitle;');
    expect(continuousPublishing).toContain(
      'finalTitle = applyKeywordPrefixToTitle(finalTitle, keyword);',
    );
  });

  it('fails the renderer build when required title helpers disappear from the runtime bundle', () => {
    const buildScript = readFileSync(join(process.cwd(), 'scripts', 'copy-static.mjs'), 'utf8');

    expect(buildScript).toContain('REQUIRED_RENDERER_RUNTIME_SYMBOLS');
    expect(buildScript).toContain("'collapseDuplicateLeadingYearTitle'");
    expect(buildScript).toContain("'applyKeywordPrefixToTitle'");
    expect(buildScript).toContain('missingRuntimeSymbols');
  });
});
