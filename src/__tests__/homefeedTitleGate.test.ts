import { describe, expect, it } from 'vitest';
import { computeHomefeedTitleGateIssues, judgeTitleReplacement } from '../content/homefeedTitleGate';
import { stripFakeSourcePhrases } from '../contentSanitizers';

/*
 * [2026-09-17 실측 사고] 게이트는 제대로 잡았는데 재작성이 더 나쁜 제목을 내놨고,
 * 비교 없이 그대로 받아들였다. 그리고 attempt 예산이 끝나 되돌릴 수도 없었다.
 *
 *   [TitleGate] "60분에 빠져도 부상은 아니었다, …"  미달 2건 · attempt=0/1  (폭 30.5 · 장치 1개)
 *   [TitleGate] "60분대에 멈추던 이강인, …"        미달 3건 · attempt=1/1  (폭 31   · 장치 0개)
 *
 * 재작성이 가끔 더 나쁜 것을 내놓는 것은 막을 수 없다. 받아들이는 것은 막을 수 있다.
 */
const BEFORE = '60분에 빠져도 부상은 아니었다, 시메오네 이강인 교체 이유';
const WORSE = '60분대에 멈추던 이강인, 시메오네가 원한 건 풀타임 경기력이었다';
const BETTER = '"모든 걸 쏟아부었다"…60분에 빠지던 이강인, 시메오네가 원한 건 풀타임';

describe('재작성 제목은 나아졌을 때만 받는다', () => {
  it('실측 회귀 — 미달이 늘어난 재작성은 거절한다', () => {
    const v = judgeTitleReplacement(BEFORE, WORSE);
    expect(v.accept).toBe(false);
    // 미달 건수는 둘 다 2건이지만 후킹 장치가 1개 → 0개로 줄었다. 동점은 장치로 가른다.
    expect(v.reason).toContain('장치 1개 → 0개');
  });

  it('미달이 줄면 받는다', () => {
    const v = judgeTitleReplacement(BEFORE, BETTER);
    expect(v.accept).toBe(true);
    expect(v.afterCount).toBeLessThan(v.beforeCount);
  });

  it('빈 결과나 같은 제목은 받지 않는다', () => {
    expect(judgeTitleReplacement(BEFORE, undefined).accept).toBe(false);
    expect(judgeTitleReplacement(BEFORE, '').accept).toBe(false);
    expect(judgeTitleReplacement(BEFORE, BEFORE).accept).toBe(false);
  });

  it('건수가 같으면 원래 제목을 지킨다 — 옆으로 흔들지 않는다', () => {
    const sameCount = '시메오네가 이강인을 60분에 뺀 이유는 무엇이었나';
    const v = judgeTitleReplacement(BEFORE, sameCount);
    if (v.afterCount === v.beforeCount) expect(v.accept).toBe(false);
  });
});

describe('판정은 한 곳에서만 한다', () => {
  it('길이·후킹·인용 세 검사를 함께 돌린다', () => {
    const issues = computeHomefeedTitleGateIssues(WORSE);
    expect(issues.some(i => /너무 짧음/.test(i))).toBe(true);
    expect(issues.some(i => /후킹 구조 부족/.test(i))).toBe(true);
  });

  it('통과하는 제목은 빈 배열', () => {
    expect(computeHomefeedTitleGateIssues('"오픈 전부터 대기하고 있었다"…전현무 계획4 제작진이 목격담에 그은 선'))
      .toEqual([]);
  });
});

/*
 * 같은 글에 '설계도' 라벨도 새어 나왔다 — "설계도에 담긴 감독 발언도 분명합니다."
 * blueprint 의 우리말 내부 명칭이다. 다만 설계도는 건축·비유로도 쓰는 일반 단어라
 * 자료를 가리키는 '에' 형태로만 좁혔다(실측 3건은 전부 "설계도를 그리다" 쪽이었다).
 */
describe('설계도 라벨 누출', () => {
  it('자료를 가리키는 형태는 뗀다', () => {
    expect(stripFakeSourcePhrases('설계도에 담긴 감독 발언도 분명합니다.')).toBe('감독 발언도 분명합니다.');
    expect(stripFakeSourcePhrases('설계도에 따르면 이강인은 풀타임을 소화했습니다.'))
      .toBe('이강인은 풀타임을 소화했습니다.');
  });

  it('진짜 설계도를 말하는 문장은 건드리지 않는다', () => {
    for (const t of [
      '이 집은 설계도부터 다시 그렸습니다.',
      '직접 설계도를 그리기도 한다고 하더라고요.',
      '인생 2막의 설계도를 멋지게 그려나가고 계시는데요!',
    ]) {
      expect(stripFakeSourcePhrases(t)).toBe(t);
    }
  });
});
