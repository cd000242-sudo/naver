import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

/**
 * [2026-08-05] 연속발행이 카테고리 미지정 항목을 '연예'로 확정하던 문제.
 *
 * UI 버튼은 "카테고리 선택하기"라고 표시되지만 hidden input의 초기값이
 * 'entertainment'였다. 사용자가 카테고리 선택 모달을 한 번도 열지 않으면
 * 요리·여행·재테크 항목까지 연예 프롬프트를 받는다.
 *
 * 실측 경로: item.category='entertainment'
 *   → generateContentFromKeywords(…, articleTypeOverride)
 *   → categoryHintMap['entertainment'] = '연예'
 *   → resolveCategory('연예') = 'entertainment'
 * 빈 문자열이면 resolveCategory('') = 'general' 이 되어 카테고리 보정 없이
 * base 골격만 적용된다 — 잘못된 보정보다 무보정이 낫다.
 *
 * 카테고리 선택을 강제하는 UI는 이 수정 범위가 아니다(기능 추가 금지).
 */

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/** 주석·JSDoc 라인을 걷어낸다 — 주석 속 옛 코드가 잡히면 오탐이다. */
function codeOnly(src: string): string {
  return src
    .split(/\r?\n/)
    .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
    .join('\n');
}

describe('연속발행 — 카테고리 기본값을 연예로 확정하지 않는다', () => {
  it('상세설정 모달의 hidden input이 연예로 미리 채워져 있지 않다', () => {
    const html = readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');
    const input = html.match(/<input[^>]*id="continuous-modal-category-select"[^>]*>/)?.[0];
    expect(input, 'hidden input을 찾지 못했습니다').toBeTruthy();
    expect(input).not.toMatch(/value="entertainment"/);
  });

  it('큐 항목 편집 시 기본값이 연예가 아니다', () => {
    const code = codeOnly(read('renderer/modules/continuousPublishing.ts'));
    expect(code).not.toMatch(/categorySelect\?\.value\s*\|\|\s*'entertainment'/);
  });

  it('발행 시작 시 카테고리 폴백이 연예가 아니다', () => {
    const code = codeOnly(read('renderer/modules/continuousPublishing.ts'));
    // hidden input → 구 select → 폴백 3단 체인의 마지막이 'entertainment'였다.
    expect(code).not.toMatch(/continuous-category-select[\s\S]{0,200}?\|\|\s*\n?\s*'entertainment'/);
  });

  it('연예 표시명 사전은 그대로 둔다 (사용자가 실제로 고른 경우)', () => {
    const code = codeOnly(read('renderer/modules/continuousPublishing.ts'));
    // 사용자가 연예를 선택하면 여전히 연예로 동작해야 한다.
    expect(code).toMatch(/'entertainment':\s*'연예/);
  });
});
