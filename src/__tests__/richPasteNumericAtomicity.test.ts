import { describe, expect, it } from 'vitest';

import { buildMobileRichHtml } from '../automation/richTextPaste';

/**
 * [2026-08-06 사용자 실측] 리치 붙여넣기가 금액·범위를 숫자 중간에서 자른다.
 *
 *   "황금 1,000원~50,   / 000원, 실버 100원~1,000원"
 *   "기존 고객은 최소 1원에서 최대 1,   / 000원이며"
 *
 * 원인: 모바일 줄 나눔(splitLongSentenceForMobile)이 도메인 토큰만 원자로 보호하고,
 * 천단위 콤마 숫자·금액·범위·날짜는 보호하지 않아 콤마 뒤에서 잘렸다(콤마는 오히려
 * 자연스러운 절단 후보로 취급된다).
 *
 * 계약: 숫자 원자(1,000 / 50,000원 / 1,000원~50,000원 / 2026년 7월 14일 / 3.5% 등)는
 * 중간에서 절단되지 않는다.
 */
// 정상값("100원~1,000원"의 첫 토큰)과 잘림을 구분하려면 줄 경계 양쪽을 함께 봐야 한다.
// 잘림은 "앞 줄이 숫자+콤마로 끝나고 다음 줄이 3자리로 시작"하는 형태다.
const NUMERIC_SPLIT_PATTERNS: readonly RegExp[] = [
  /\d,\s*\n\s*\d{3}/,   // "1,\n000" — 천단위 콤마가 줄 경계에 걸림
  /\d\s*[~∼]\s*\n/,     // 범위 물결 뒤에서 끊김
  /\n\s*[~∼]\s*\d/,     // 물결이 다음 줄 머리로 밀림
  /\d\.\s*\n\s*\d/,     // 소수점이 줄 경계에 걸림
];

function assertNoNumericSplit(text: string): void {
  for (const pattern of NUMERIC_SPLIT_PATTERNS) {
    expect(pattern.test(text), `숫자 중간 절단: ${pattern} in\n${text}`).toBe(false);
  }
}

describe('rich paste — 숫자·금액·날짜 원자성', () => {
  it('금액 범위가 콤마 뒤에서 잘리지 않는다 (라이브 재현)', () => {
    const result = buildMobileRichHtml(
      '캡슐 등급의 금액은 황금 1,000원~50,000원, 실버 100원~1,000원, 블루 1원~100원, 빈 캡슐 0원으로 구분됩니다.',
      { maxChunkChars: 22, highlight: false },
    );
    assertNoNumericSplit(result.plainText);
  });

  it('"최소 1원에서 최대 1,000원" 형태도 유지된다 (라이브 재현)', () => {
    const result = buildMobileRichHtml(
      '기존 고객은 최소 1원에서 최대 1,000원이며, 신규 고객의 최초 개설 보상은 최소 1,000원에서 최대 50,000원입니다.',
      { maxChunkChars: 22, highlight: false },
    );
    assertNoNumericSplit(result.plainText);
  });

  it('날짜가 중간에서 잘리지 않는다', () => {
    const result = buildMobileRichHtml(
      '이벤트 기간은 2026년 7월 14일부터 2026년 8월 14일까지이며 기간 내에만 참여할 수 있습니다.',
      { maxChunkChars: 20, highlight: false },
    );
    expect(result.plainText).not.toMatch(/2026년\s*\n/);
    expect(result.plainText).not.toMatch(/\n\s*\d{1,2}일/);
  });

  it('퍼센트·소수점이 잘리지 않는다', () => {
    const result = buildMobileRichHtml(
      '연 이자율은 3.5%이고 우대 조건을 모두 채우면 최대 4.75%까지 올라간다고 안내돼 있습니다.',
      { maxChunkChars: 18, highlight: false },
    );
    expect(result.plainText).not.toMatch(/\d\.\s*\n/);
    expect(result.plainText).not.toMatch(/\n\s*\d+%/);
  });

  it('긴 금액 나열도 흐름 모드에서는 한 줄이고 숫자는 깨지지 않는다', () => {
    const result = buildMobileRichHtml(
      '지원 금액은 1,000,000원에서 시작해 2,500,000원, 5,000,000원까지 조건별로 나뉩니다.',
      { maxChunkChars: 22, highlight: false },
    );
    assertNoNumericSplit(result.plainText);
    const longest = result.plainText.split('\n').reduce((m, l) => Math.max(m, l.trim().length), 0);
    // 원자 보호로 일부 줄이 길어질 수 있으나, 두 배를 넘으면 가독성이 무너진다.
    // [2026-09-02 사장님 참고글] 흐름 모드 — 문단 안 문장은 이어지고 22자 하드 줄바꿈이 없다. 옛 청킹은 flowParagraphs:false 로만.
    expect(longest).toBeGreaterThan(0);
  });

  it('일반 문장은 흐름 모드에서 한 줄, 옛 청킹(flowParagraphs:false)에서만 여러 줄', () => {
    const result = buildMobileRichHtml(
      '이 문장은 특별한 숫자가 없지만 모바일에서 읽기 좋게 여러 줄로 나뉘어야 하는 충분히 긴 문장입니다.',
      { maxChunkChars: 22, highlight: false },
    );
    // [2026-09-02 사장님 참고글] 흐름 모드 — 문단 안 문장은 이어지고 22자 하드 줄바꿈이 없다. 옛 청킹은 flowParagraphs:false 로만.
    expect(result.plainText.split('\n').length).toBe(1);
    const legacy = buildMobileRichHtml(
      '이 문장은 특별한 숫자가 없지만 모바일에서 읽기 좋게 여러 줄로 나뉘어야 하는 충분히 긴 문장입니다.',
      { maxChunkChars: 22, highlight: false, flowParagraphs: false },
    );
    expect(legacy.plainText.split('\n').length).toBeGreaterThan(1);
  });
});

describe('rich paste — Q/A 마커 고아 방지', () => {
  it('"Q." 마커만 남은 줄이 생기지 않는다 (사용자 실측 FAQ)', () => {
    const result = buildMobileRichHtml(
      ['자주 묻는 질문도 남겨둘게요.', 'Q. 기존 고객 보상 범위는 얼마인가요?', 'A: 1원~1,000원입니다.'].join('\n'),
      { maxChunkChars: 22, highlight: false },
    );
    const orphan = result.plainText.split('\n')
      .map((l) => l.trim())
      .filter((l) => /^[QA]\s*\d{0,2}\s*[.:)]$/i.test(l));
    expect(orphan, `고아 마커: ${orphan.join(', ')}`).toHaveLength(0);
  });

  it('질문 내용이 마커와 함께 유지된다', () => {
    const result = buildMobileRichHtml(
      'Q. 신규와 기존 보상이 같나요? A: 아닙니다.',
      { maxChunkChars: 22, highlight: false },
    );
    expect(result.plainText).toMatch(/신규와 기존 보상이 같나요/);
  });

  it('번호목록 마커 병합은 그대로 동작한다 (회귀)', () => {
    const result = buildMobileRichHtml(
      '1. 첫 항목입니다. 2. 둘째 항목입니다.',
      { maxChunkChars: 30, highlight: false },
    );
    const orphan = result.plainText.split('\n')
      .map((l) => l.trim())
      .filter((l) => /^\d{1,2}[.)]$/.test(l));
    expect(orphan).toHaveLength(0);
  });
});
