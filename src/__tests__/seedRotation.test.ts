/**
 * [2026-09-10] keywordAnalyzer 가 씨앗을 이렇게 골랐다:
 *   seeds.sort(() => Math.random() - 0.5).slice(0, 3)
 *
 * 문제가 셋이다.
 *   1. `sort` 에 랜덤 비교자를 주는 것은 **편향된 셔플**이다 — 균등한 순열이 안 나온다.
 *      어떤 씨앗은 거의 안 뽑히고 어떤 것은 자주 뽑힌다.
 *   2. `sort` 는 **원본 배열을 제자리에서 바꾼다.** getLifestyleProductQueries() 가
 *      상수 배열을 돌려주면 호출할 때마다 그 상수가 뒤섞인다(불변성 위반).
 *   3. 랜덤이라 **재현이 안 된다.** "어제는 됐는데 오늘 안 된다" 를 추적할 수 없다.
 *
 * 대신 날짜로 도는 순환을 쓴다 — 며칠이면 모든 씨앗이 고르게 한 번씩 돌고,
 * 같은 날 다시 돌리면 같은 결과가 나온다.
 */
import { describe, it, expect } from 'vitest';
import { rotateDailySlice } from '../analytics/seedRotation';

const seeds = ['가', '나', '다', '라', '마', '바', '사'];

describe('rotateDailySlice — 날짜로 도는 결정적 순환', () => {
  it('같은 날이면 같은 결과 — 재현된다', () => {
    expect(rotateDailySlice(seeds, 3, 10)).toEqual(rotateDailySlice(seeds, 3, 10));
  });

  it('날이 바뀌면 다음 묶음으로 넘어간다', () => {
    expect(rotateDailySlice(seeds, 3, 0)).toEqual(['가', '나', '다']);
    expect(rotateDailySlice(seeds, 3, 1)).toEqual(['라', '마', '바']);
  });

  it('끝에 닿으면 앞으로 돌아와 이어 붙인다 — 빈손으로 돌아가지 않는다', () => {
    expect(rotateDailySlice(seeds, 3, 2)).toEqual(['사', '가', '나']);
  });

  it('며칠이면 모든 씨앗이 한 번씩은 돈다 — 랜덤은 그 보장이 없다', () => {
    const seen = new Set<string>();
    for (let day = 0; day < 3; day += 1) for (const s of rotateDailySlice(seeds, 3, day)) seen.add(s);
    expect(seen.size).toBe(seeds.length);
  });

  it('원본을 바꾸지 않는다 — sort 는 제자리에서 배열을 뒤집는다', () => {
    const original = [...seeds];
    rotateDailySlice(seeds, 3, 5);
    expect(seeds).toEqual(original);
  });

  it('요청 수가 전체보다 많으면 전체를 한 번씩만 준다', () => {
    expect(rotateDailySlice(['가', '나'], 5, 3)).toEqual(['가', '나']);
  });

  it('빈 목록·0개 요청은 빈 배열', () => {
    expect(rotateDailySlice([], 3, 1)).toEqual([]);
    expect(rotateDailySlice(seeds, 0, 1)).toEqual([]);
  });
});

describe('배선 핀 — 편향 셔플이 남아 있지 않다', () => {
  const src = (): string[] => {
    const fs = require('fs') as typeof import('fs');
    return fs.readFileSync(new URL('../analytics/keywordAnalyzer.ts', import.meta.url), 'utf8')
      .split(String.fromCharCode(10))
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'));
  };

  it('sort(랜덤) 패턴이 사라졌다', () => {
    expect(src().filter((l) => l.includes('Math.random() - 0.5')).length).toBe(0);
  });

  it('순환 함수를 쓴다', () => {
    expect(src().filter((l) => l.includes('rotateDailySlice(')).length).toBeGreaterThan(0);
  });
});
