/**
 * [Phase 3-4/v2.10.142] contentGenerator god file 분해 — 제목 전용 cleanup helper.
 *
 * 도메인: 제목/소제목 문자열 정제 (특수문자, 시작/끝 토큰, 콜론+따옴표 패턴 등).
 * 일반 텍스트 정제는 contentTextHelpers.ts 참조.
 *
 * 의존: contentTextHelpers (normalizeTitleWhitespace, removeEmojis)
 *   — cleanupTrailingTitleTokens가 두 함수를 호출하기 위해.
 */

import { normalizeTitleWhitespace, removeEmojis } from './contentTextHelpers';

/**
 * 소제목 prefix 제거 — "첫 번째 소제목:", "제 1 번째 소제목:", "소제목:" 패턴 제거.
 *
 * AI가 프롬프트의 지시("소제목: ...")를 리터럴로 출력한 경우 후처리.
 *
 * @param text - 소제목 텍스트
 * @returns prefix가 제거된 소제목. 입력이 falsy면 빈 문자열.
 */
export function stripOrdinalHeadingPrefix(text: string): string {
  let t = String(text || '').trim();
  if (!t) return '';
  t = t.replace(/^\s*(?:제\s*)?\d+\s*번째\s*소제목\s*[:：]\s*/i, '');
  t = t.replace(/^\s*(?:첫|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s*번째\s*소제목\s*[:：]\s*/i, '');
  t = t.replace(/^\s*소제목\s*[:：]\s*/i, '');
  return t.trim();
}

/**
 * 제목 내 특수문자 정제 — 중간점/세미콜론/따옴표/[출처] 태그 제거.
 *
 * AI가 크롤링 원문이나 프롬프트 지시를 잘못 학습해 출력하는 패턴을 후처리:
 *   - "[출처]..." 이후 중복 제목 제거
 *   - 크롤링 아티팩트 접미사 (내돈내산, 협찬, 체험단 등) 제거
 *   - 중간점/bullet/세미콜론 정규화
 *   - 한글 사이 따옴표 제거
 *   - 천 단위 구분자(1,000원) 보호
 *
 * @param raw - 정제 대상 제목
 * @returns 정제된 제목. 입력이 falsy면 빈 문자열.
 */
export function sanitizeTitleSpecialChars(raw: string): string {
  let t = String(raw || '').trim();
  if (!t) return '';

  // [출처] 태그 + 이후 중복 제목 전체 제거
  // 크롤링된 원문에서 "제목\n[출처] 제목" 패턴이 유입됨
  t = t.replace(/\[출처\].*$/s, '').trim();
  t = t.replace(/\(출처[^)]*\)/g, '').trim();

  // 크롤링 아티팩트/낚시성 접미사 제거 (쇼핑 블로그에서 자주 유입)
  const junkSuffixes = [
    '내돈내산', '협찬', '제공', '체험단', '서포터즈',
    '원고료', '광고', '소정의', '대가성',
    '킹 카', '킹카',
  ];
  for (const junk of junkSuffixes) {
    const rx = new RegExp(`[\\s,·•|:]*${junk.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
    t = t.replace(rx, '').trim();
  }

  // 1. 가운뎃점(·) 및 bullet(•) → 공백으로 대체
  t = t.replace(/[·•]/g, ' ');

  // 2. 세미콜론(;) → 쉼표로 대체
  t = t.replace(/;/g, ',');

  // 3. 한글 사이 따옴표/아포스트로피 제거
  t = t.replace(/([가-힣])['`'´'']/g, '$1');
  t = t.replace(/['`'´'']([가-힣])/g, '$1');

  // 4. 연속된 구두점 정리
  t = t.replace(/,\s*,/g, ',');
  // 천 단위 구분자(1,000원) 보호
  t = t.replace(/(?<!\d)\s*,\s*/g, ', ');
  t = t.replace(/,\s+(?=\d{3})/g, ',');

  // 5. 이중 공백 정리
  t = t.replace(/\s{2,}/g, ' ').trim();

  // 6. 선행/후행 구두점 정리
  t = t.replace(/^[\s,;·•]+/, '').replace(/[\s,;·•]+$/, '').trim();

  return t;
}

/**
 * 제목 시작 토큰 정리 — [공지], [NOTICE], [지역명], [브랜드] 등 대괄호 시작 패턴 제거.
 *
 * AI가 "[김해] 월세 0원 사무실..." 같은 형태로 생성하면 네이버 SEO에 불리.
 *
 * @param raw - 정제 대상 제목
 * @returns 시작 토큰이 제거된 제목. 입력이 falsy면 빈 문자열.
 */
export function cleanupStartingTitleTokens(raw: string): string {
  let t = String(raw || '').trim();
  if (!t) return '';

  // 1. [공지], (공지), 【공지】 등 공지 관련 태그 제거
  t = t.replace(/^\s*[\[\(【]\s*공지\s*[\]\)】]\s*/i, '');

  // 2. [NOTICE], (NOTICE), 공지사항: 등 유사 패턴 제거
  t = t.replace(/^\s*[\[\(【]?\s*(?:NOTICE|공지사항|안내|이슈)\s*[\]\)】]?\s*[:：]?\s*/i, '');

  // 3. [지역명], [브랜드] 등 짧은 대괄호 시작 패턴 제거 (최대 10자)
  t = t.replace(/^\s*\[[^\]]{1,10}\]\s*/g, '');

  // 4. 맨 앞의 불필요한 기호 제거
  t = t.replace(/^[\s\-–—:|·•,]+/, '');

  return t.trim();
}

/**
 * 제목 끝 토큰 정리 — 빈 괄호/대괄호 + 낚시성 단어 + 후행 구두점 제거.
 *
 * AI가 프롬프트 예시 패턴을 잘못 학습해 "...() []"처럼 빈 괄호를 남기거나
 * "...직접", "...진짜", "...충격" 같은 낚시성 단어를 끝에 붙이는 케이스 차단.
 *
 * 처리 전 normalizeTitleWhitespace + removeEmojis 적용 (contentTextHelpers 의존).
 *
 * @param raw - 정제 대상 제목
 * @returns 끝 토큰이 제거된 제목. 입력이 falsy면 빈 문자열.
 */
export function cleanupTrailingTitleTokens(raw: string): string {
  let t = normalizeTitleWhitespace(removeEmojis(String(raw || '').trim()));
  if (!t) return '';

  // 빈 괄호/대괄호 제거 (AI 프롬프트 예시 패턴 잘못 학습)
  t = t.replace(/\[\s*\]/g, '');
  t = t.replace(/\(\s*\)/g, '');
  t = t.replace(/【\s*】/g, '');
  t = t.replace(/\s{2,}/g, ' ').trim();

  // 끝에 자주 등장하는 낚시성 단일 단어 제거 (보수적 — 정상 제목은 건드리지 않음)
  const trailingTokens = ['직접', '진짜', '충격', '대박'];
  for (const tok of trailingTokens) {
    const rx = new RegExp(`(?:[\\s,·•|:]+)?${tok}\\s*$`, 'i');
    if (rx.test(t)) {
      t = t.replace(rx, '').trim();
    }
  }

  // 끝에 남은 구두점 정리
  t = t.replace(/[\s\-–—:|·•,]+$/g, '').trim();
  return t;
}

/**
 * 콜론+따옴표 패턴 정제 — "키워드 : "설명" 나머지" 형태를 풀어줌.
 *
 * AI가 프롬프트의 `{키워드} + {설명}` 구조를 리터럴로 해석해 출력하는 케이스 후처리.
 * 다양한 따옴표 (큰따옴표, 작은따옴표, 한글 따옴표 「」『』) 모두 대응.
 *
 * @param raw - 정제 대상 제목
 * @returns 패턴이 제거된 제목. 입력이 falsy면 빈 문자열.
 */
export function cleanupColonQuotePattern(raw: string): string {
  let t = String(raw || '').trim();
  if (!t) return '';

  // 1) 콜론+따옴표 구분자 제거
  t = t.replace(/\s*[:：]\s*["'“”‘’「」『』]+\s*/g, ' ');

  // 2) 남은 닫는 따옴표 제거
  t = t.replace(/["'“”‘’「」『』]+/g, '');

  // 3) 이중 공백 정리
  t = t.replace(/\s{2,}/g, ' ').trim();

  return t;
}
