/**
 * [Phase 3-20/v2.10.166] contentGenerator god file decomposition — keyword prefix + review title.
 *
 * 키워드/제품명 prefix 보장 + review 제목 정제. 모두 pure (console.log only).
 */

import type { StructuredContent } from './contentGenerator';
import { normalizeTitleWhitespace } from './contentTextHelpers';

export function applyKeywordPrefixToTitle(title: string, keyword: string): string {
  const cleanKeyword = (keyword || '').trim();
  if (!cleanKeyword) return (title || '').trim();

  const cleanTitle = (title || '').trim();
  if (!cleanTitle) return cleanKeyword;

  // ✅ [2026-02-08] 강화된 중복 방지: 키워드의 모든 토큰이 이미 제목에 포함되어 있으면 접두사 불필요
  const keywordTokens = cleanKeyword.split(/\s+/).filter(t => t.length >= 2);
  if (keywordTokens.length > 0) {
    const titleLower = cleanTitle.toLowerCase();
    const allTokensPresent = keywordTokens.every(t => titleLower.includes(t.toLowerCase()));
    if (allTokensPresent) {
      console.log(`[applyKeywordPrefix] 키워드 토큰 모두 제목에 포함됨 → 접두사 생략: "${cleanKeyword}" in "${cleanTitle}"`);
      return cleanTitle;
    }
  }

  const escapeRegex = (s: string): string => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const normalizeForCompare = (s: string) =>
    String(s || '')
      .trim()
      .replace(/[\s\-–—:|·•.,!?()\[\]{}"']/g, '')
      .toLowerCase();

  const normalizeWhitespace = (s: string): string =>
    String(s || '')
      .replace(/\s+/g, ' ')
      // ✅ [2026-02-24] 숫자 사이 쉼표 보호 (1,000원 등)
      .replace(/(?<!\d)\s*,\s*/g, ', ')
      .replace(/,\s+(?=\d{3})/g, ',')
      .replace(/\s*:\s*/g, ': ')
      .replace(/\s*\|\s*/g, ' | ')
      .trim();

  const stripTrailingKeywordSuffix = (s: string): string => {
    let t = normalizeWhitespace(String(s || ''));
    if (!t) return '';
    const suffixes = [
      /\s*(?:하는\s*)?방법\s*$/,
      /\s*(?:하는\s*)?법\s*$/,
      /\s*요령\s*$/,
      /\s*팁\s*$/,
      /\s*가이드\s*$/,
      /\s*(?:총\s*)?정리\s*$/,
    ];
    for (const rx of suffixes) {
      const next = t.replace(rx, '').trim();
      if (next && next !== t) t = next;
    }
    return t.trim();
  };

  const clampTitleLength = (s: string, maxLen: number): string => {
    // ✅ [2026-02-24] removeDuplicatePhrases 제거 (3중 실행 방지, 순수 길이 제한만)
    const t = normalizeWhitespace(String(s || '')).trim();
    if (!t) return '';
    if (t.length <= maxLen) return t;

    // ✅ [2026-02-02] 불완전한 문장 방지: 더 나은 끊김 위치 찾기
    let cut = t.slice(0, maxLen);

    // 1. 완전한 문장 경계 찾기 (구두점)
    const lastPunctuation = Math.max(
      cut.lastIndexOf('!'),
      cut.lastIndexOf('?'),
      cut.lastIndexOf('。'),
      cut.lastIndexOf(')')
    );

    // 2. 한국어 어절 경계 찾기 (조사, 공백)
    const lastSpace = cut.lastIndexOf(' ');

    // 3. 단어 완성 지점 찾기 (쉼표, 콜론)
    const lastDelimiter = Math.max(
      cut.lastIndexOf(','),
      cut.lastIndexOf(':')
      // ✅ [2026-02-24] · 제거 (sanitizeTitleSpecialChars가 이미 제거함 — 사문 코드)
    );

    // ✅ 우선순위: 구두점 > 구분자 > 공백
    const minCutPosition = Math.floor(maxLen * 0.5);  // 최소 50% 이상 유지

    if (lastPunctuation >= minCutPosition) {
      cut = t.slice(0, lastPunctuation + 1);
    } else if (lastDelimiter >= minCutPosition) {
      cut = t.slice(0, lastDelimiter);  // 구분자 자체는 제외
    } else if (lastSpace >= minCutPosition) {
      cut = t.slice(0, lastSpace);
    } else {
      // 적절한 끊김 위치가 없으면 maxLen 위치에서 자르고 끝 정리
      cut = t.slice(0, maxLen);
    }

    // ✅ [2026-02-02 FIX] 끝 정리: 불완전한 문자 제거 (+, &, |, 등)
    return cut.replace(/[\s\-–—:|·•,+&|/\\]+$/g, '').trim();
  };


  const titleNorm = normalizeForCompare(cleanTitle);
  const kwNorm = normalizeForCompare(cleanKeyword);
  if (kwNorm && titleNorm.startsWith(kwNorm)) {
    let rest = cleanTitle.slice(cleanKeyword.length).trim();
    rest = rest.replace(/^[\s\-–—:|·•,]+/, '').trim();

    const kwStem = stripTrailingKeywordSuffix(cleanKeyword);
    const restNormalized = normalizeWhitespace(rest);
    if (kwStem) {
      const candidates = [
        kwStem,
        `${kwStem}법`,
        `${kwStem} 방법`,
        `${kwStem}하는 방법`,
        `${kwStem}하는법`,
        `${kwStem} 요령`,
        `${kwStem} 팁`,
        `${kwStem} 정리`,
      ];
      for (const c of candidates) {
        const rx = new RegExp(`^\\s*${escapeRegex(c)}\\s*`, 'i');
        if (rx.test(restNormalized)) {
          rest = restNormalized.replace(rx, '').trim();
          rest = rest.replace(/^[\s\-–—:|·•,]+/, '').trim();
          break;
        }
      }
    }

    const restNorm = normalizeForCompare(rest);
    if (kwNorm && restNorm.startsWith(kwNorm)) {
      const merged = `${cleanKeyword} ${rest}`.replace(new RegExp(`^${escapeRegex(cleanKeyword)}(?:\\s+${escapeRegex(cleanKeyword)})+`), cleanKeyword).trim();
      return clampTitleLength(merged, 70);
    }
    return clampTitleLength(`${cleanKeyword}${rest ? ` ${rest}` : ''}`.trim(), 70);
  }

  const removed = cleanTitle.split(cleanKeyword).join(' ').replace(/\s+/g, ' ').trim();
  let rest = removed.replace(/^[\s\-–—:|·•]+/, '').trim();

  const kwStem = stripTrailingKeywordSuffix(cleanKeyword);
  if (kwStem && rest) {
    const restNormalized = normalizeWhitespace(rest);
    const candidates = [
      kwStem,
      `${kwStem}법`,
      `${kwStem} 방법`,
      `${kwStem}하는 방법`,
      `${kwStem}하는법`,
      `${kwStem} 요령`,
      `${kwStem} 팁`,
      `${kwStem} 정리`,
    ];
    for (const c of candidates) {
      const rx = new RegExp(`^\\s*${escapeRegex(c)}\\s*`, 'i');
      if (rx.test(restNormalized)) {
        rest = restNormalized.replace(rx, '').trim();
        rest = rest.replace(/^[\s\-–—:|·•,]+/, '').trim();
        break;
      }
    }
  }

  const merged = rest ? `${cleanKeyword} ${rest}` : cleanKeyword;
  return clampTitleLength(merged, 70);
}

export function applyKeywordPrefixToStructuredContent(content: StructuredContent, keyword: string): void {
  const cleanKeyword = (keyword || '').trim();
  if (!content || !cleanKeyword) return;

  if (content.selectedTitle) {
    content.selectedTitle = applyKeywordPrefixToTitle(content.selectedTitle, cleanKeyword);
  }

  if (Array.isArray(content.titleAlternatives)) {
    content.titleAlternatives = content.titleAlternatives
      .map(t => applyKeywordPrefixToTitle(t, cleanKeyword))
      .filter(Boolean);
  }

  if (Array.isArray(content.titleCandidates)) {
    content.titleCandidates = content.titleCandidates.map(c => ({
      ...c,
      text: applyKeywordPrefixToTitle(c.text, cleanKeyword),
    }));
  }
}

export function sanitizeReviewTitle(title: string, productName: string): string {
  const base = String(title || '').trim();
  const pricePattern = /(?:₩\s*)?\d{1,3}(?:,\d{3})+(?:\s*원)?(?:대|짜리)?(?:에|으로|부터)?|(?:₩\s*)?\d+(?:\.\d+)?\s*(?:만\s*)?원(?:대|짜리)?(?:에|으로|부터)?/g;
  const storePattern = /(?:스마트\s*스토어|브랜드\s*스토어|공식\s*스토어|네이버\s*스토어|네이버\s*쇼핑|쇼핑\s*몰|판매처|구매처|최저가|스토어)/gi;
  const awkwardRecipientPattern = /(?:어떤|어느|이런|그런)\s*분(?:들)?(?:께|에게|한테)?(?:\s*(?:맞는|추천하는|좋은))?/g;

  const normalizeShoppingTitlePunctuation = (value: string): string => normalizeTitleWhitespace(value)
    .replace(/\s*[:：]\s*/g, ', ')
    .replace(/\s*,\s*,+/g, ', ')
    .replace(/,\s+/g, ', ')
    .replace(/,\s*(?=$)/g, '')
    .replace(/^[\s,.:;|·•\-–—]+|[\s,.:;|·•\-–—]+$/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const cleanProductNameForReviewTitle = (value: string): string => normalizeShoppingTitlePunctuation(
    String(value || '')
      .replace(pricePattern, ' ')
      .replace(storePattern, ' ')
      .replace(awkwardRecipientPattern, ' ')
  );
  const prod = cleanProductNameForReviewTitle(productName);

  if (!base) {
    return prod ? `${prod} 실사용 후기` : '실사용 후기';
  }

  let t = base;

  const fallbackReviewTitle = (): string => prod ? `${prod}, 실사용 장단점 정리` : '실사용 장단점 정리';

  const removeShoppingConnectTitleArtifacts = (value: string): string => {
    let cleaned = normalizeTitleWhitespace(value);

    cleaned = cleaned
      .replace(pricePattern, ' ')
      .replace(storePattern, ' ')
      .replace(awkwardRecipientPattern, ' ')
      .replace(/후기\s*리뷰/g, '후기')
      .replace(/리뷰\s*후기/g, '후기')
      .replace(/(후기|리뷰|총정리|정리|장단점)(?:\s+\1)+/g, '$1');

    return normalizeShoppingTitlePunctuation(cleaned);
  };

  const hasShoppingConnectTitleArtifacts = (value: string): boolean => (
    /(?:₩\s*)?\d{1,3}(?:,\d{3})+(?:\s*원)?|(?:₩\s*)?\d+(?:\.\d+)?\s*(?:만\s*)?원/.test(value)
    || /(?:스마트\s*스토어|브랜드\s*스토어|공식\s*스토어|네이버\s*스토어|네이버\s*쇼핑|쇼핑\s*몰|판매처|구매처|최저가|스토어)/i.test(value)
    || /(?:어떤|어느|이런|그런)\s*분(?:들)?(?:께|에게|한테)?/.test(value)
    || /후기\s*리뷰|리뷰\s*후기/.test(value)
  );

  const isWeakReviewTitle = (value: string): boolean => {
    if (!prod) return false;
    const normalized = normalizeTitleWhitespace(value);
    let suffix = normalized;
    if (suffix.startsWith(prod)) {
      suffix = suffix.slice(prod.length);
    }
    suffix = suffix.replace(/^[\s,.:;|·•\-–—]+/, '').trim();
    if (!suffix) return true;
    return /^(후기|리뷰|총정리|정리)$/.test(suffix);
  };

  // ✅ [2026-02-08 완전 재작성] 제목 의미를 파괴하지 않는 최소한의 정제만 수행
  // 기존: 훅 키워드(써보고, 소름, 충격 등)를 무조건 제거 → 제목이 제품명만 남는 문제 발생
  // 수정: 정말 과도한 과장 표현만 제거하고, 창의적 훅 제목은 보존

  // 1. 과도한 감정 과장 단어만 제거 (제목 전체를 파괴하지 않는 수준)
  const excessivePatterns = [
    /[!?]{3,}/g,                    // 연속 느낌표/물음표 3개 이상
    /ㅋ{3,}/g,                       // ㅋㅋㅋ 이상
    /ㅎ{3,}/g,                       // ㅎㅎㅎ 이상
    /\.{4,}/g,                       // .... 4개 이상
  ];
  for (const p of excessivePatterns) {
    t = t.replace(p, '');
  }

  // 2. 기본 정규화
  t = normalizeTitleWhitespace(t);
  t = removeShoppingConnectTitleArtifacts(t);

  // 3. 제목이 너무 짧아졌으면 원본 유지
  if (t.length < 15 && base.length >= 15) {
    t = removeShoppingConnectTitleArtifacts(base);
  }

  // 4. 제품명 prefix 보장 (1회만)
  if (prod) {
    t = applyKeywordPrefixToTitle(t, prod);
  }

  if (hasShoppingConnectTitleArtifacts(t) || isWeakReviewTitle(t)) {
    t = fallbackReviewTitle();
  }

  // 5. 완전히 비었을 때만 폴백
  if (!t || t.length < 5) {
    t = fallbackReviewTitle() || base || '실사용 후기';
  }

  return t;
}
