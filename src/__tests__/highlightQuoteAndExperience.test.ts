import { describe, expect, it } from 'vitest';

import { buildMobileRichHtml, pickRichArticleThemes } from '../automation/richTextPaste';

/**
 * [2026-08-05] 하이라이트 대상에 인용문·경험 서술 추가.
 *
 * 사용자 관찰: "하이라이트는 핵심 내용도 중요하지만 '경험'이나 따옴표에도
 * 들어가던데, 따옴표가 핵심 내용인 것 같더라."
 *
 * 기존 점수 규칙(scoreImportantSentence)에는 따옴표 항목이 아예 없었고,
 * IMPORTANT_KEYWORDS의 '경험'·'후기'는 **명사**라서 실제 경험 문장
 * ("직접 써보니 …")을 잡지 못했다. 서술 어미로 잡아야 걸린다.
 */
const themes = pickRichArticleThemes();

function isHighlighted(text: string): boolean {
  const result = buildMobileRichHtml(text, {
    highlight: true,
    maxChunkChars: 200,
    ...themes,
  });
  // 하이라이트는 배경색으로 칠해진다. 본문 기본 배경(#ffffff)은 제외.
  return /background-color:(?!#ffffff)/.test(result.html);
}

describe('하이라이트 — 인용문', () => {
  it('큰따옴표 인용을 칠한다', () => {
    expect(isHighlighted('구매자 후기에서 "3주 쓰니 아이 코막힘이 줄었어요" 라는 반응이 반복됐습니다.')).toBe(true);
  });

  it('한국식 따옴표(“ ”, ‘ ’)도 인식한다', () => {
    expect(isHighlighted('감독은 “우리 팀을 떠나주세요” 라고 말한 것으로 전해졌습니다.')).toBe(true);
    expect(isHighlighted('관계자는 ‘예정된 수순이었다’ 는 입장을 밝혔습니다.')).toBe(true);
  });

  it('낫표(「」)도 인식한다', () => {
    expect(isHighlighted('공지에는 「사전 예약분은 순차 발송」 이라고 적혀 있었습니다.')).toBe(true);
  });

  it('짝이 맞지 않는 따옴표는 인용으로 보지 않는다', () => {
    // 한쪽만 남은 따옴표 — 인용이 아니다
    expect(isHighlighted('그는 " 라고만 적어두고 더 설명하지 않았다는 이야기가 있습니다.')).toBe(false);
  });
});

describe('하이라이트 — 경험 서술', () => {
  it('"써보니" 계열을 칠한다', () => {
    expect(isHighlighted('직접 써보니 물통 위치가 불편해서 매번 옆으로 빼야 했습니다.')).toBe(true);
  });

  it('"갔더니" 계열을 칠한다', () => {
    expect(isHighlighted('주말 오후에 갔더니 사십 분을 기다려야 했고 대기표를 따로 받았습니다.')).toBe(true);
  });

  it('체감·느낌 서술을 칠한다', () => {
    expect(isHighlighted('소음은 수치보다 실제로 체감되는 차이가 더 크게 느껴졌습니다.')).toBe(true);
  });
});

describe('하이라이트 — 남발 방지', () => {
  it('평범한 설명 문장은 칠하지 않는다', () => {
    expect(isHighlighted('이 제품은 여러 기능을 갖추고 있으며 다양한 환경에서 활용할 수 있습니다.')).toBe(false);
  });

  it('기존 키워드 규칙은 그대로 동작한다 (회귀 없음)', () => {
    expect(isHighlighted('핵심은 설치 공간입니다. 좁은 주방이라면 이 부분을 먼저 확인하세요.')).toBe(true);
  });

  it('섹션당 1개 · 상한 유지 — 인용이 많아도 전부 칠하지 않는다', () => {
    const manyQuotes = Array.from({ length: 12 }, (_, i) =>
      `${i + 1}번째 후기에서는 "이 부분이 특히 좋았어요" 라는 반응이 있었습니다.`).join('\n\n');
    const result = buildMobileRichHtml(manyQuotes, { highlight: true, maxChunkChars: 200, ...themes });
    const highlighted = (result.html.match(/background-color:(?!#ffffff)/g) || []).length;
    expect(highlighted).toBeGreaterThan(0);
    // DEFAULT_MAX_HIGHLIGHTS = 7. 문단 12개가 전부 칠해지면 남발이다.
    expect(highlighted).toBeLessThan(12);
  });

  it('하이라이트를 끄면 아무것도 칠하지 않는다', () => {
    const result = buildMobileRichHtml(
      '구매자 후기에서 "정말 좋았어요" 라는 반응이 있었습니다.',
      { highlight: false, maxChunkChars: 200, ...themes },
    );
    expect(/background-color:(?!#ffffff)/.test(result.html)).toBe(false);
  });
});
