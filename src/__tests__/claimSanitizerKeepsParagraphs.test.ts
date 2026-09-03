import { describe, expect, it } from 'vitest';

import { sanitizeStructuredContentClaims, sanitizeUnverifiedOfficialGuideClaims } from '../contentClaimSanitizer';

/**
 * [2026-09-03 뿌리 — 사장님 "뿌리부터 완벽히 잡아"] 발행글이 벽이던 진짜 원인.
 * 생성 꼬리에서 ensureContentParagraphBreaks 가 45문장 → 15문단으로 나눈 직후(로그) sanitizeStructuredContentClaims 가
 * 돌면서 `\s{2,}` → ' ' 로 문단 사이 빈 줄을 전부 지웠다. 본문·도입·결론·소제목 내용 모두. 실측 프로브: 빈 줄 2 → 0.
 * 정제기는 가로 공백만 접는다.
 */
const PARA = '점심 뒤 나른함이 거슬린다면 식후 관리를 봅니다. 두달만에 5kg 감량했다는 경험도 있습니다.\n\n식후 15분 안에 3알씩 챙깁니다. 알약이 작아 부담이 없어요.\n\n마지막 문단입니다. 끝.';
const blankLines = (s: string) => (s.match(/\n\n/g) || []).length;

describe('주장 정제기는 문단 경계를 지우지 않는다', () => {
  it('빈 줄 2개가 그대로 남는다 (본문·도입·결론·소제목)', () => {
    const c: any = { bodyPlain: PARA, introduction: PARA, conclusion: PARA, headings: [{ title: '식후 나른함부터', content: PARA }] };
    sanitizeStructuredContentClaims(c);
    expect(blankLines(c.bodyPlain)).toBe(2);
    expect(blankLines(c.introduction)).toBe(2);
    expect(blankLines(c.conclusion)).toBe(2);
    expect(blankLines(c.headings[0].content)).toBe(2);
  });

  it('원래 하던 일은 그대로 — 공식 가이드 주장 제거, 겹친 공백은 하나로, 3줄 이상 빈 줄은 2줄로', () => {
    const out = sanitizeUnverifiedOfficialGuideClaims('2026년 공식 가이드에 따르면 하루  두 번입니다.\n\n\n\n다음 문단.  끝.');
    expect(out).not.toContain('공식 가이드');
    expect(out).not.toMatch(/ {2,}/u);
    expect(blankLines(out)).toBe(1);
    expect(out).not.toMatch(/\n{3,}/u);
  });

  it('홑 줄바꿈(표 행·목록)도 살아 있다', () => {
    const table = '| 구분 | 내용 |\n| --- | --- |\n| 구성 | 120캡슐 |';
    expect(sanitizeUnverifiedOfficialGuideClaims(table)).toBe(table);
  });
});
