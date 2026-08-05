import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

/**
 * [2026-08-05 배치 3a] SEO food·travel 신규격 계약.
 *
 * 비평서 실측: food 는 레시피(조리 순서)와 맛집(주차·대기·예약)을 6줄에 섞고 있었고,
 * 두 파일 모두 지역성·계절성 축이 0건이었다 — 맛집·여행 프롬프트인데.
 */

const read = (rel: string): string =>
  readFileSync(new URL(`../prompts/${rel}`, import.meta.url), 'utf8');

const food = read('seo/food.prompt');
const travel = read('seo/travel.prompt');
const base = read('seo/base.prompt');

describe('배치 3a — 우선순위 선언', () => {
  it.each([['food', food], ['travel', travel]])('%s가 SECTION -2 우선을 선언한다', (_n, p) => {
    // "항상 위다"도 우선 선언으로 인정한다 (배치 3a 파일 문면).
    expect(p).toMatch(/★[\s\S]{0,80}\[SECTION -2\][\s\S]{0,160}(?:우선|항상 위)/);
  });

  it.each([['food', food], ['travel', travel]])('%s의 룰 ID 참조가 base에 실재한다', (_n, p) => {
    const refs = [...p.matchAll(/\b(F\d+|H\d+|R0-\d+)\b/g)].map((m) => m[1]);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of new Set(refs)) {
      expect(base, `${ref} 가 base에 없습니다`).toMatch(new RegExp(`(?:^\s*|\[)${ref}(?:\]|\.)`, 'm'));
    }
  });
});

describe('food — 조리/방문 분기 계약', () => {
  it('입력 성격으로 판단글 유형을 가른다', () => {
    expect(food).toMatch(/조리 판단글/);
    expect(food).toMatch(/방문 판단글/);
    expect(food).toMatch(/판별 근거가 입력에[\s\S]{0,4}없으면 분기하지 (말고|않고)/);
  });

  it('조리: 결과가 갈리는 변수를 나열보다 앞에 둔다', () => {
    expect(food).toMatch(/결과가 갈리는 변수/);
    expect(food).toMatch(/추정치로 메우지 말고/);
  });

  it('방문: 어긋나면 헛걸음이 되는 조건을 앞에 둔다', () => {
    expect(food).toMatch(/휴무|브레이크타임|라스트오더/);
  });

  it('지역성 — 입력 표기 그대로, 확장 금지', () => {
    expect(food).toMatch(/입력 표기 그대로/);
    expect(food).toMatch(/넓히거나 좁히지 않는다|넓히지 않는다/);
  });

  it('계절성 — 운영 기간이 있을 때만', () => {
    expect(food).toMatch(/운영 기간이 있을 때만/);
  });

  it('아쉬운 점을 균형용으로 지어내지 않는다', () => {
    expect(food).toMatch(/균형을 맞추려고 만들지 않는다/);
  });
});

describe('travel — 방문 판단 계약', () => {
  it('헛걸음 조건을 뒤로 미루지 않는다', () => {
    expect(travel).toMatch(/헛걸음/);
    expect(travel).toMatch(/휴무|마지막 입장|사전 예약/);
  });

  it('요금 — 없는 구분·총액 계산 금지', () => {
    expect(travel).toMatch(/총액이나 1인 비용을 계산해 새로 제시하지 않는다/);
  });

  it('지역성 — 입력 표기 그대로, 거리 표현은 값이 있을 때만', () => {
    expect(travel).toMatch(/입력 표기 그대로/);
    expect(travel).toMatch(/도보 5분|차로 10분/);
  });

  it('연계 코스를 지명 지식으로 만들지 않는다', () => {
    expect(travel).toMatch(/코스를 만들지 않는다/);
  });

  it('계절성 — 그 해의 값이 있을 때만', () => {
    expect(travel).toMatch(/그 해의 값이 있을 때만/);
  });

  it('일정·비용 정리는 항목과 값이 모두 있을 때만', () => {
    expect(travel).toMatch(/항목과 값이 모두 있을 때만/);
  });
});

describe('배치 3a — 날조 유발 문구 부재', () => {
  it.each([['food', food], ['travel', travel]])('%s에 무조건 포함 지시가 없다', (_n, p) => {
    const lines = p.split('\n').filter((l) => l.trim().startsWith('-') || l.trim().startsWith('⛔'));
    for (const line of lines) {
      expect(line).not.toMatch(/반드시 (포함|넣|쓴다|작성)|필수로 (포함|넣)/);
    }
  });

  it.each([['food', food], ['travel', travel]])('%s가 경험 날조를 요구하지 않는다 (기존 계약 유지)', (_n, p) => {
    expect(p).not.toContain('필수 경험 표현');
    expect(p).not.toMatch(/구체적 에피소드 필수/);
  });
});
