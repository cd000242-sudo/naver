import { describe, expect, it } from 'vitest';
import { checkTitleAnswer, describeTitleAnswer } from '../content/titleAnswerCheck';

const title = '스트레이 키즈 日국립경기장 단독 입성, 해외 남성 아티스트 최초 기록';
const keyword = '스트레이 키즈 日국립경기장 단독 입성';

describe('checkTitleAnswer', () => {
  it('flags the measured case: the intro echoes the promise and the body never develops it', () => {
    const result = checkTitleAnswer({
      title,
      primaryKeyword: keyword,
      introduction: '해외 남성 아티스트 최초로 도쿄 국립경기장에 단독 입성한다는 점에서 특별한 의미를 지닙니다.',
      body: '공연은 8월 29일과 30일 양일간 펼쳐지며 약 8만 석 규모입니다. 일본에서만 총 7회 공연을 진행합니다.',
    });

    expect(result.checked).toBe(true);
    expect(result.echoedOnly.length).toBeGreaterThanOrEqual(2);
    expect(describeTitleAnswer(result)).toContain('⚠️');
    expect(result.message).toContain('도입부만 되뇌고');
  });

  it('passes when the body actually develops the promise', () => {
    const result = checkTitleAnswer({
      title,
      primaryKeyword: keyword,
      introduction: '해외 남성 아티스트 최초 단독 입성입니다.',
      body: '기록의 범위는 해외 남성 아티스트 최초 단독 입성입니다. 해외 아티스트 전체 최초는 트와이스가 먼저 썼습니다.',
    });

    expect(result.echoedOnly).toHaveLength(0);
    expect(describeTitleAnswer(result)).toContain('✅');
  });

  it('does not judge when there is nothing to judge', () => {
    expect(checkTitleAnswer({ title: '', primaryKeyword: '', introduction: 'a', body: 'b' }).checked).toBe(false);
    expect(checkTitleAnswer({ title, primaryKeyword: keyword, introduction: '', body: 'b' }).checked).toBe(false);
    expect(describeTitleAnswer({ checked: false } as never)).toBe('');
  });

  it('never throws on malformed input', () => {
    expect(() => checkTitleAnswer(undefined as never)).not.toThrow();
    expect(checkTitleAnswer(undefined as never).checked).toBe(false);
  });
});
