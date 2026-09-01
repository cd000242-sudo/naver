import { describe, expect, it } from 'vitest';

import { optimizeHeadingsForMode } from '../contentHeadingOptimizer';

/**
 * [2026-09-01] 소제목의 말이 끊긴 원인을 비평 팀이 찾았고, 재현으로 확정했다.
 *
 * 사장님 실측: "추석 전에 비워 둘 자리와 남겨" — "남겨" 에서 끝난다.
 *
 * contentHeadingOptimizer 의 반복 어절 제거가 글자 단위로 비교한다.
 *   원본   추석 전에 비워 둘 자리와 남겨 둘 자리
 *   index=6 에서 suffix = "둘 자리", prefix = "추석 전에 비워 둘 자리와 남겨"
 *   prefix.includes("둘 자리") → "자리와" 안의 "자리" 가 걸려 참
 *   결과   추석 전에 비워 둘 자리와 남겨
 *
 * "자리와" 와 "자리" 는 다른 어절인데 글자 비교라 같다고 봤다.
 * 어절 단위로 비교하면 잡히지 않는다.
 *
 * 이 결함은 오늘 소제목 동기화를 고친 뒤(cf08f3b63) 처음으로 실제 본문에 반영되기
 * 시작했다. 그전에는 소제목만 잘리고 본문은 그대로였다.
 */
const optimize = (titles: string[]) => {
  const content: any = { headings: titles.map((title) => ({ title, content: '내용' })) };
  optimizeHeadingsForMode(content, { contentMode: 'seo' } as never);
  return content.headings.map((h: any) => h.title);
};

describe('반복 어절 제거가 멀쩡한 소제목을 자르지 않는다', () => {
  it('실측 사례 — "자리와" 안의 "자리" 를 반복으로 보지 않는다', () => {
    const [out] = optimize(['추석 전에 비워 둘 자리와 남겨 둘 자리']);
    expect(out).toContain('남겨 둘 자리');
    expect(out).not.toBe('추석 전에 비워 둘 자리와 남겨');
  });

  it('조사만 다른 어절을 같은 말로 보지 않는다', () => {
    const [out] = optimize(['수납장 정리와 팬트리 정리']);
    expect(out).toContain('팬트리 정리');
  });

  it('멀쩡한 소제목은 그대로 둔다', () => {
    for (const title of [
      '냉동실 성에 제거 순서',
      '필터 세척과 내부 건조',
      '주 1회 점검이 필요한 이유',
    ]) {
      expect(optimize([title])[0]).toBe(title);
    }
  });
});

describe('진짜 반복은 계속 잘라낸다 — 완화가 아니다', () => {
  it('같은 어절이 그대로 되풀이되면 뒤를 자른다', () => {
    const [out] = optimize(['냉장고 정리 방법 냉장고 정리 방법']);
    expect(out).toBe('냉장고 정리 방법');
  });
});
