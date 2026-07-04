/**
 * [Phase 3-20/v2.10.166] contentGenerator god file decomposition — keyword prefix + review title.
 *
 * 키워드/제품명 prefix 보장 + review 제목 정제. 모두 pure (console.log only).
 */

import type { StructuredContent } from './contentGenerator';
import { normalizeTitleWhitespace } from './contentTextHelpers';

export interface KeywordPrefixOptions {
  /**
   * [SPEC-KEYWORD-ENDGAME Phase 1] 제목 앞 3자 내 메인 키워드 강제.
   * 기존 "토큰이 어디든 있으면 스킵" 조기탈출이 SEO 앞3자 요건을 뚫는 구멍이었다
   * (예: "바꿨더니 효과 본 다이어트 식단" — 토큰 존재하나 선두 아님 → 스킵 → 경고만 뜨고 발행).
   * true면 제목이 키워드로 시작하지 않을 때 조기탈출 없이 재배치 로직을 태운다.
   */
  ensureFront3?: boolean;
}

/** 스캐너(mainKeywordPositionScanner)와 동일 기준: 정규화 후 제목 앞 3자 == 키워드 앞 3자. */
function titleStartsWithKeywordFront3(title: string, keyword: string): boolean {
  const norm = (s: string) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const t = norm(title);
  const k = norm(keyword);
  return Boolean(t && k && t.slice(0, 3) === k.slice(0, 3));
}

export function applyKeywordPrefixToTitle(title: string, keyword: string, options?: KeywordPrefixOptions): string {
  const cleanKeyword = (keyword || '').trim();
  if (!cleanKeyword) return (title || '').trim();

  const cleanTitle = (title || '').trim();
  if (!cleanTitle) return cleanKeyword;

  // [Phase 1] 앞3자 강제 모드: 이미 선두면 무변경, 아니면 조기탈출 건너뛰고 재배치로 직행.
  const front3Satisfied = titleStartsWithKeywordFront3(cleanTitle, cleanKeyword);
  if (options?.ensureFront3 && front3Satisfied) return cleanTitle;

  // ✅ [2026-02-08] 강화된 중복 방지: 키워드의 모든 토큰이 이미 제목에 포함되어 있으면 접두사 불필요
  //   (ensureFront3 모드에서는 이 조기탈출이 앞3자 구멍이므로 건너뛴다)
  const keywordTokens = cleanKeyword.split(/\s+/).filter(t => t.length >= 2);
  if (!options?.ensureFront3 && keywordTokens.length > 0) {
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

export function applyKeywordPrefixToStructuredContent(content: StructuredContent, keyword: string, options?: KeywordPrefixOptions): void {
  const cleanKeyword = (keyword || '').trim();
  if (!content || !cleanKeyword) return;
  // 사용자 지정 제목은 건드리지 않는다 (manualTitleLocked — 라이브 발행 신뢰).
  if ((content as any).manualTitleLocked) return;

  if (content.selectedTitle) {
    content.selectedTitle = applyKeywordPrefixToTitle(content.selectedTitle, cleanKeyword, options);
  }

  if (Array.isArray(content.titleAlternatives)) {
    content.titleAlternatives = content.titleAlternatives
      .map(t => applyKeywordPrefixToTitle(t, cleanKeyword, options))
      .filter(Boolean);
  }

  if (Array.isArray(content.titleCandidates)) {
    content.titleCandidates = content.titleCandidates.map(c => ({
      ...c,
      text: applyKeywordPrefixToTitle(c.text, cleanKeyword, options),
    }));
  }
}

export function sanitizeReviewTitle(title: string, productName: string): string {
  const base = String(title || '').trim();
  const prod = String(productName || '').trim();

  if (!base) {
    return prod ? `${prod} 실사용 후기` : '실사용 후기';
  }

  let t = base;

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

  // 3. 제목이 너무 짧아졌으면 원본 유지
  if (t.length < 15 && base.length >= 15) {
    t = normalizeTitleWhitespace(base);
  }

  // 4. 제품명 prefix 보장 (1회만)
  if (prod) {
    t = applyKeywordPrefixToTitle(t, prod);
  }

  // 5. 완전히 비었을 때만 폴백
  if (!t || t.length < 5) {
    t = prod ? `${prod} 실사용 후기` : (base || '실사용 후기');
  }

  return t;
}
