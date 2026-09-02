import { describe, expect, it } from 'vitest';

import { buildMobileRichHtml, SOFT_HIGHLIGHT_THEMES } from '../automation/richTextPaste';

/**
 * [2026-09-03 사장님 화면] 하이라이트가 문단 통째로 칠해졌다. 흐름 모드에서 문단은 2~3문장이라 통째 감싸기는 벽이 된다.
 * 문단 안에서 가장 중요한 한 문장만 칠한다. (선택 신호는 기존 규칙 그대로 — 따옴표 인용이 1순위)
 */
const theme = SOFT_HIGHLIGHT_THEMES[0];
const spanRe = () => new RegExp(`<span style="background-color:${theme.background}[^>]*>([^<]*)</span>`, 'g');

describe('하이라이트는 문단 안 한 문장만', () => {
  it('3문장 문단이 중요 문단으로 뽑혀도 형광펜은 한 문장(인용문)에만', () => {
    const text = '지원 대상은 25세 이상 청년입니다. "신청은 9월 15일까지 복지로에서만 받습니다." 놓치면 다음 접수는 내년입니다.';
    const { html, highlightCount } = buildMobileRichHtml(text, { highlight: true, maxHighlights: 1, highlightTheme: theme });
    expect(highlightCount).toBe(1);
    const spans = html.match(spanRe()) || [];
    expect(spans.length).toBe(1);
    expect(spans[0]).toContain('신청은 9월 15일까지');
    expect(spans[0]).not.toContain('지원 대상은');
    expect(spans[0]).not.toContain('놓치면');
    expect(html).toContain('지원 대상은 25세 이상 청년입니다.');
  });

  it('문장 하나짜리 문단은 그대로 통째', () => {
    const { html, highlightCount } = buildMobileRichHtml('"신청은 9월 15일까지 복지로에서만 받습니다."', { highlight: true, maxHighlights: 1, highlightTheme: theme });
    expect(highlightCount).toBe(1);
    expect((html.match(spanRe()) || []).length).toBe(1);
  });
});
