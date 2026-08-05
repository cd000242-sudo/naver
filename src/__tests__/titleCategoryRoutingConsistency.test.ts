import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

/**
 * [2026-08-06] 제목-본문 카테고리 라우팅 정합 (배치 4a 이관 판단 종결).
 *
 * 본문 라우팅(promptLoader CATEGORY_MAP)은 '쇼핑' → 'life'인데, 제목 라우팅
 * (contentGenerator categoryToFile)은 'shopping_review' → 'living'이었다.
 * 상품 리뷰 글이 본문은 라이프(쇼핑 축 강화판) 규격, 제목은 리빙(인테리어) 규격을
 * 받아 어긋났다. 제목도 'life'로 맞춘다.
 */
describe('title-body category routing consistency', () => {
  const generator = readFileSync(new URL('../contentGenerator.ts', import.meta.url), 'utf8');
  const loader = readFileSync(new URL('../promptLoader.ts', import.meta.url), 'utf8');

  it("제목 라우팅: shopping_review → 'life' (본문과 동일)", () => {
    expect(generator).toMatch(/'shopping_review':\s*'life'/);
    expect(generator).not.toMatch(/'shopping_review':\s*'living'/);
  });

  it("본문 라우팅 기준점: '쇼핑' → 'life' (변경 감지용 앵커)", () => {
    expect(loader).toMatch(/'쇼핑':\s*'life'/);
  });
});
