/**
 * [Phase 3-10~11/v2.10.148~149] contentGenerator god file decomposition — review-specific helpers.
 *
 * 도메인: shopping/it/product review article 전용 제품명/제목/소제목 정제.
 * 일반 텍스트 정제는 contentTextHelpers.ts, 제목 cleanup은 contentTitleHelpers.ts.
 *
 * 의존:
 *   - ArticleType, ContentSource (type-only, contentGenerator.ts)
 *   - normalizeTitleWhitespace, removeEmojis (contentTextHelpers)
 */

import type { ArticleType, ContentSource } from './contentGenerator';
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
 * ContentSource에서 리뷰 글 제품명 추출 — productInfo.name → title → metadata.keywords 순.
 *
 * productInfo.name이 긴 제목형 문구로 들어올 수 있어 두 가지 전략 비교:
 *   - extractLikelyProductNameFromTitle (훅 패턴 전 단어 추출)
 *   - normalizeReviewProductName (제품 명사 + 용량 정규화)
 * 더 짧은 쪽 선택 (제목 잡음 최소화).
 */
export function getReviewProductName(source?: ContentSource): string {
  const fromInfo = String((source as any)?.productInfo?.name || '').trim();
  if (fromInfo) {
    const extracted = extractLikelyProductNameFromTitle(fromInfo);
    const normalized = normalizeReviewProductName(fromInfo);
    return extracted && extracted.length <= normalized.length ? extracted : normalized;
  }
  const fromTitle = String(source?.title || '').trim();
  if (fromTitle) return extractLikelyProductNameFromTitle(fromTitle);
  const fromMeta = String((source as any)?.metadata?.keywords?.[0] || '').trim();
  return fromMeta;
}

/**
 * 제목 문자열에서 제품명 추정 — 훅 패턴(직접 써보고/실사용/리뷰 등) *앞* 부분 추출.
 *
 * 1) | 또는 , 로 분리한 첫 부분 사용
 * 2) 훅 패턴 매칭되면 그 *앞* 부분만 normalizeReviewProductName 처리
 * 3) 훅 없으면 전체 normalizeReviewProductName 처리
 */
export function extractLikelyProductNameFromTitle(title: string): string {
  const t0 = normalizeTitleWhitespace(removeEmojis(String(title || '').trim()));
  if (!t0) return '';

  const cutDelim = t0.split(/[|]/)[0];
  const cutComma = cutDelim.split(',')[0];
  const t = String(cutComma || '').trim();
  if (!t) return '';

  const hookPattern = /(직접\s*써보[고니]|써보[고니]|써본|사용\s*후기|실사용|리뷰|후기|소름|난리|충격|경악|반전|실화|폭발|알고보니|비밀|진짜\s*이유|삶의\s*질\s*상승)/;
  const m = t.match(hookPattern);
  if (m && typeof m.index === 'number' && m.index > 0) {
    const before = t.slice(0, m.index).trim();
    return normalizeReviewProductName(before || t);
  }

  return normalizeReviewProductName(t);
}

/**
 * 제품명 정규화 — 훅 표현 제거 + 카테고리 명사 추출 + 용량 토큰 재배치 + 흔한 수식어 제거.
 *
 * 처리 단계:
 *   1) 화이트스페이스 + 이모지 정제 (normalizeTitleWhitespace + removeEmojis)
 *   2) | , 분리 첫 부분
 *   3) "40도" 같은 온도/수치 훅 제외
 *   4) 훅 패턴(직접 써보고/리뷰/충격/소름 등) 제거
 *   5) 가전 카테고리 명사(가습기/청소기 등) + 용량(L/kg/인치) 추출
 *   6) 흔한 수식어(대용량/끝판왕/핫템 등) 제거
 *   7) 용량 토큰을 카테고리 명사 *앞*으로 재배치 ("가습기 5L" → "5L 가습기")
 */
export function normalizeReviewProductName(productName: string): string {
  let p = normalizeTitleWhitespace(removeEmojis(String(productName || '').trim()));
  if (!p) return '';

  p = p.split(/[|]/)[0].trim();
  p = p.split(',')[0].trim();

  // "40도" 같은 온도/수치 훅은 제품명에서 제외
  const tempLike = p.match(/\s\d+(?:\.\d+)?\s*도\b/);
  if (tempLike && typeof tempLike.index === 'number' && tempLike.index > 0) {
    p = p.slice(0, tempLike.index).trim();
  }

  const hookPattern = /(직접\s*써보[고니]|(직접\s*)?써보[고니]|써본|사용\s*후기|실사용|리뷰|후기|소름|난리|충격|경악|반전|실화|폭발|알고보니|숨겨진\s*진실|비밀|진짜\s*이유|삶의\s*질\s*상승)/;
  const m = p.match(hookPattern);
  if (m && typeof m.index === 'number') {
    if (m.index > 0) {
      p = p.slice(0, m.index).trim();
    } else {
      p = p.replace(hookPattern, '').trim();
    }
  }

  // 제품 카테고리 명사까지만 잘라서 "제품명"만 남기기
  // (긴 제목형 문구가 productName으로 들어오는 것을 방지)
  const sizeToken = '(?:\\d+(?:\\.\\d+)?\\s*(?:L|l|리터|ml|mL|kg|g|인치|cm|mm))';
  const nouns = [
    '가습기',
    '제습기',
    '선풍기',
    '청소기',
    '공기청정기',
    '에어프라이어',
    '드라이기',
    '보조배터리',
  ];
  let nounHit: { noun: string; idx: number } | null = null;
  for (const noun of nouns) {
    const idx = p.indexOf(noun);
    if (idx >= 0) {
      if (!nounHit || idx < nounHit.idx) nounHit = { noun, idx };
    }
  }
  if (nounHit) {
    let end = nounHit.idx + nounHit.noun.length;
    const after = p.slice(end).trimStart();
    const sizeAfter = after.match(new RegExp(`^${sizeToken}`, 'i'));
    if (sizeAfter && sizeAfter[0]) {
      end += (p.slice(end).length - after.length) + sizeAfter[0].length;
    }
    p = p.slice(0, end).trim();
  }

  // 흔한 수식어 제거(너무 공격적으로 제거하지 않도록 최소한만)
  p = p
    .replace(/\b(대용량|초대형|초소형|가성비|끝판왕|위력|역대급|핫템|강추|필수템)\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // 용량/규격 토큰을 제품 카테고리 명사 앞쪽으로 이동
  // 예: "케리프 가습기 5L" -> "케리프 5L 가습기"
  // 예: "OO 선풍기 16인치" -> "OO 16인치 선풍기"
  const nounToken = '([가-힣A-Za-z0-9]+)';
  const re = new RegExp(`^(.+?)\\s+${nounToken}\\s+(${sizeToken})(\\b.*)?$`);
  const match = p.match(re);
  if (match) {
    const left = String(match[1] || '').trim();
    const noun = String(match[2] || '').trim();
    const size = String(match[3] || '').trim();
    const tail = String(match[4] || '').trim();

    // tail이 있는 경우에는 그대로 붙이되, 너무 긴 경우 방지
    const rebuilt = `${left} ${size} ${noun}${tail ? ` ${tail}` : ''}`.replace(/\s{2,}/g, ' ').trim();
    return rebuilt;
  }

  return p;
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
