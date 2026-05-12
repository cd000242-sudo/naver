/**
 * [Phase 3-10/v2.10.148] contentGenerator god file decomposition — review-specific helpers.
 *
 * 도메인: shopping/it/product review article 전용 제목/소제목 정제.
 * 일반 텍스트 정제는 contentTextHelpers.ts, 제목 cleanup은 contentTitleHelpers.ts.
 *
 * 의존:
 *   - ArticleType (type-only, contentGenerator.ts)
 *   - normalizeTitleWhitespace, removeEmojis (contentTextHelpers)
 */

import type { ArticleType } from './contentGenerator';
import { normalizeTitleWhitespace, removeEmojis } from './contentTextHelpers';

/**
 * 리뷰형 글 타입인지 판정.
 *
 * 다음 4가지 타입에 대해 true 반환:
 *   - shopping_review
 *   - shopping_expert_review
 *   - it_review
 *   - product_review
 */
export function isReviewArticleType(articleType?: ArticleType): boolean {
  return articleType === 'shopping_review' || articleType === 'shopping_expert_review' || articleType === 'it_review' || articleType === 'product_review';
}

/**
 * 리뷰 글 소제목 정제 — 제품명 prefix 제거 + 길이/품질 검증 후 부적합 시 fallback 반환.
 *
 * 처리:
 *   - 제품명으로 시작하면 prefix 제거 (정규화 + 구두점 정리)
 *   - 4자 미만 또는 50자 초과 → fallback
 *   - 어색한 표현(진심/정말/이렇게/느낌/보고/소름) → fallback
 *   - 6단어 초과 → fallback
 *
 * @param title - 정제 대상 소제목
 * @param fallback - 조건 미충족 시 반환할 대체 문자열
 * @param productName - 선택적 제품명 (prefix 제거용)
 */
export function sanitizeReviewHeadingTitle(title: string, fallback: string, productName?: string): string {
  let t = String(title || '').trim();

  const prod = normalizeTitleWhitespace(removeEmojis(String(productName || ''))).trim();
  if (prod) {
    const normalized = normalizeTitleWhitespace(removeEmojis(t)).trim();
    if (normalized.startsWith(prod)) {
      t = normalized.slice(prod.length).trim();
      t = t.replace(/^[\s\-–—:|·•,]+/, '').trim();
    } else {
      t = normalized;
    }
  }

  t = normalizeTitleWhitespace(t);

  if (t.length < 4) return fallback;
  if (t.length > 50) return fallback;
  if (/(진심|정말|이렇게|느낌|보고|소름)/.test(t)) return fallback;
  if (t.split(/\s+/).filter(Boolean).length > 6) return fallback;
  return t;
}
