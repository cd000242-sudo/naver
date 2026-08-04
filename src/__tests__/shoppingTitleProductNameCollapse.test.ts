import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

import { applyKeywordPrefixToTitle } from '../contentKeywordPrefix';
import { getReviewProductName } from '../contentReviewHelpers';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * [2026-08-05] 쇼핑 제목이 상품 등록명으로 압사하던 문제.
 *
 * 사용자 신고: "쇼핑커넥트 제목이 그냥 제품 이름을 제목으로 작성했어."
 * 실제 발행 제목: "KRUPS 크룹스 초슬림 전자동 커피머신 커피크러쉬 라이어니스
 * SA403BK0 가정용 에스프레소 머신 홈카페"
 *
 * 원인 체인 (실행 재현으로 확정):
 *   1) 상품 등록명 60자가 제목 앞에 그대로 접두된다
 *   2) 70자 클램프가 뒤를 자른다
 *   → 판단 문구 "원룸이면 물통 위치에서 갈립니다"(17자)가 "원룸이면 물통"(6자)만 생존
 *
 * 수정: 상품명을 4어절로 축약 + 쇼핑 경로만 45자 상한.
 * 클램프 상한을 전역으로 낮추지 않는다 — SEO·연속발행이 같은 함수를 공유한다.
 */
const LONG_PRODUCT_NAME =
  'KRUPS 크룹스 초슬림 전자동 커피머신 커피크러쉬 라이어니스 SA403BK0 가정용 에스프레소 머신 홈카페';
const JUDGMENT = '원룸이면 물통 위치에서 갈립니다';

describe('쇼핑 제목 — 상품명 압사 차단', () => {
  it('긴 상품 등록명은 4어절로 축약된다', () => {
    const short = getReviewProductName({ productInfo: { name: LONG_PRODUCT_NAME } } as any);
    expect(LONG_PRODUCT_NAME.length).toBeGreaterThan(50);
    expect(short.length).toBeLessThanOrEqual(25);
    // 축약본은 원문의 접두사여야 한다 — 그래야 "이미 제목에 있으면 건너뛴다"
    // 판정이 성립하고 원문 60자가 다시 붙지 않는다.
    expect(LONG_PRODUCT_NAME.startsWith(short)).toBe(true);
  });

  it('짧은 상품명은 그대로 둔다', () => {
    const short = getReviewProductName({ productInfo: { name: '다이슨 V15' } } as any);
    expect(short).toBe('다이슨 V15');
  });

  it('쇼핑 제목에서 판단 문구가 잘리지 않는다 (핵심 회귀)', () => {
    const short = getReviewProductName({ productInfo: { name: LONG_PRODUCT_NAME } } as any);
    const title = applyKeywordPrefixToTitle(JUDGMENT, short, { maxLength: 45 });

    expect(title).toContain(JUDGMENT);
    expect(title.startsWith(short)).toBe(true);
    expect(title.length).toBeLessThanOrEqual(45);
  });

  it('수정 전 동작(원문 60자 + 70자 클램프)이면 판단 문구가 잘린다 — 회귀 재현', () => {
    // 축약·스코프를 되돌렸을 때의 결과를 재현해 이 테스트가 무엇을 지키는지 고정
    const collapsed = applyKeywordPrefixToTitle(JUDGMENT, LONG_PRODUCT_NAME);
    expect(collapsed).not.toContain(JUDGMENT);
    expect(collapsed.length).toBeLessThanOrEqual(70);
  });

  it('옵션 미전달 시 상한은 70자 그대로 (SEO·연속발행 불변)', () => {
    const src = read('contentKeywordPrefix.ts');
    expect(src).toContain('const DEFAULT_TITLE_MAX_LENGTH = 70;');
    expect(src).toContain('options?.maxLength ?? DEFAULT_TITLE_MAX_LENGTH');
    // 리터럴 70 클램프가 남아 있으면 옵션이 무시되는 경로가 생긴다
    expect(src).not.toMatch(/clampTitleLength\([^)]*,\s*70\)/);
  });

  it('45자 상한은 쇼핑 상품명 경로에서만 전달된다', () => {
    const gen = read('contentGenerator.ts');
    expect(gen).toMatch(
      /applyKeywordPrefixToStructuredContent\(finalContent, productName, \{ maxLength: 45 \}\)/,
    );
    // 메인 키워드(SEO) 경로에는 옵션을 붙이지 않는다
    expect(gen).toContain('applyKeywordPrefixToStructuredContent(finalContent, primaryKeyword);');
  });
});
