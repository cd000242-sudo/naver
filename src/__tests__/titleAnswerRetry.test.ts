/** [2026-09-06] 제목 약속 미이행 재생성 — 바닥 0.6, 약속 2개 이상일 때만, 지시문은 미상환 항목을 그대로 적는다. */
import { describe, expect, it } from 'vitest';
import { TITLE_ANSWER_RETRY_FLOOR, buildTitleAnswerRetryInstruction, shouldRetryForTitleAnswer } from '../content/titleAnswerRetry';

describe('shouldRetryForTitleAnswer', () => {
  it('응답률이 바닥 아래이고 약속이 둘 이상일 때만 참', () => {
    expect(TITLE_ANSWER_RETRY_FLOOR).toBe(0.6);
    expect(shouldRetryForTitleAnswer({ checked: true, answerRate: 0.33, promised: ['도시가스', '현금'] })).toBe(true);
    expect(shouldRetryForTitleAnswer({ checked: true, answerRate: 0.6, promised: ['a', 'b'] })).toBe(false);
    expect(shouldRetryForTitleAnswer({ checked: true, answerRate: 0, promised: ['하나'] })).toBe(false);
    expect(shouldRetryForTitleAnswer({ checked: false, answerRate: 0, promised: ['a', 'b'] })).toBe(false);
    expect(shouldRetryForTitleAnswer(null)).toBe(false);
  });
});

describe('buildTitleAnswerRetryInstruction', () => {
  it('제목·미상환 항목·응답률을 담고, 제목 변경으로 맞추는 길을 막는다', () => {
    const text = buildTitleAnswerRetryInstruction('겨울 난방비 절약 방법, 도시가스 캐시백과 현금 지원', { promised: ['도시가스', '현금', '캐시백'], echoedOnly: [], answerRate: 0.33 }, ['도시가스', '현금']);
    expect(text.startsWith('[제목 약속 미이행 — 반드시 고칠 것]')).toBe(true);
    expect(text).toContain('도시가스, 현금 (본문 응답 33%)');
    expect(text).toContain('제목은 그대로 두고 본문을 채운다');
    expect(text).toContain('지어내지 않는다');
  });
});
