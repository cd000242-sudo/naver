import { describe, expect, it } from 'vitest';

import { buildMobileRichHtml } from '../automation/richTextPaste';

/**
 * [2026-09-02 사장님 결정] "문단정리 중앙정렬 말고 좌측정렬로."
 * P13 은 에디터 진입 정렬 버튼만 왼쪽으로 바꿨는데, 붙여넣기 HTML 이 문단마다 text-align:center 를 박아
 * (기본값 centerAlign=true, 넘기는 호출처 없음) 발행글은 여전히 가운데였다(닥터웰 화면). 여기서 잠근다.
 */
const PROSE = '첫 문장입니다. 둘째 문장입니다.\n\n셋째 문장입니다. 넷째 문장입니다.';

describe('붙여넣기 문단 정렬', () => {
  it('기본은 왼쪽 — <p> 에 center 가 하나도 없다', () => {
    const { html } = buildMobileRichHtml(PROSE, { highlight: false });
    const paragraphs = html.match(/<p[^>]*>/g) || [];
    expect(paragraphs.length).toBeGreaterThan(0);
    expect(paragraphs.every((tag) => tag.includes('text-align:left'))).toBe(true);
    expect(paragraphs.some((tag) => tag.includes('text-align:center'))).toBe(false);
  });

  it('가운데는 명시할 때만', () => {
    const { html } = buildMobileRichHtml(PROSE, { highlight: false, centerAlign: true });
    const paragraphs = html.match(/<p[^>]*>/g) || [];
    expect(paragraphs.some((tag) => tag.includes('text-align:center'))).toBe(true);
  });
});
