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

/**
 * [2026-08-05 배치 3b] 홈판 food·travel 신규격 계약.
 *
 * 적대 검증에서 정렬된 원칙: 안전·기준일 규율은 SEO 신판과 **축자 공유**가 정답
 * (로더가 모드당 1파일만 로드 — 자작 변주는 드리프트다). 검증이 재작성안의
 * 비축자 5곳을 실물 문구로 복원시켰다.
 */
const hfFood = read('homefeed/food.prompt');
const hfTravel = read('homefeed/travel.prompt');

describe('homefeed 배치 3b — 우선순위·조건 발동', () => {
  it.each([['food', hfFood], ['travel', hfTravel]])('%s가 base 우선 + 조건부 발동을 선언한다', (_n, p) => {
    expect(p).toMatch(/★[\s\S]{0,40}base\.prompt \[SECTION -2\][\s\S]{0,80}항상 우선한다/);
    expect(p).toMatch(/"입력에 그 재료가 있을 때"만 발동/);
  });

  it.each([['food', hfFood], ['travel', hfTravel]])('%s에 GAMMA-7 재진술 불릿이 없다', (_n, p) => {
    expect(p).not.toMatch(/^- 첫 화면에는/m);
  });
});

describe('homefeed food — 멈춤·분기·안전', () => {
  it('검색하지 않은 독자의 멈춤을 자료 실재 지점으로 세운다', () => {
    expect(hfFood).toMatch(/검색한 사람이 아니다/);
    expect(hfFood).toMatch(/자료에 답이[\s\S]{0,4}없는 질문은 세우지 않고/);
  });

  it('실패 원인을 절차 나열보다 앞에 둔다', () => {
    expect(hfFood).toMatch(/결과가 갈리는 지점을[\s\S]{0,10}(?:전체 순서|나열)/);
  });

  it('조리 분기의 이유는 입력 접지 + 폐쇄가 있다', () => {
    expect(hfFood).toMatch(/입력에 없는 이유는 만들지 않고 조건만 쓴다/);
  });

  it('오감 날조·결과 보장·조급함을 막는다 (홈판 고유)', () => {
    expect(hfFood).toMatch(/오감 묘사를 날조하지 않는다/);
    expect(hfFood).toMatch(/실패 없는|무조건 성공/);
    expect(hfFood).toMatch(/서두르라는 취지의 문장 자체를 만들지 않는다/);
  });

  it('위생·식중독 소재를 후킹용으로 끌어오지 않는다', () => {
    expect(hfFood).toMatch(/위생·식중독[\s\S]{0,20}후킹용으로 끌어오지 않는다/);
  });

  it('알레르기·유통기한 수치는 표기 그대로만', () => {
    expect(hfFood).toMatch(/알레르기·유통기한/);
    expect(hfFood).toMatch(/임의로 환산하거나 어림하지 않는다/);
  });
});

describe('homefeed travel — 멈춤·사실 규율·조급함 금지', () => {
  it('"나도 갈 수 있나" 질문을 자료의 가르는 조건으로 세운다', () => {
    expect(hfTravel).toMatch(/나도 갈 수 있나/);
    expect(hfTravel).toMatch(/자료에 답이 없는 질문은 세우지 않고/);
  });

  it('헛걸음 조건을 볼거리보다 앞에 둔다', () => {
    expect(hfTravel).toMatch(/헛걸음 조건을 볼거리보다 먼저/);
  });

  it('사실 규율이 SEO 신판과 축자 공유된다', () => {
    // 검증이 복원시킨 5곳 중 핵심 — 자작 변주가 아니라 실물 문구.
    expect(hfTravel).toMatch(/총액이나 1인 비용을 계산해 새로 제시하지 않는다/);
    expect(hfTravel).toMatch(/인접 지역이나 상위 광역/);
    expect(hfTravel).toMatch(/코스를 만들지 않는다/);
    expect(hfTravel).toMatch(/그 해의 값이 있을 때만/);
    expect(hfTravel).toMatch(/"공식 안내에서 확인"을 넘는 구체 확인처를 만들지 않는다/);
  });

  it('마감·성수기 조급함을 만들지 않는다 (홈판 고유)', () => {
    expect(hfTravel).toMatch(/조급함을 만들지 않는다/);
    expect(hfTravel).toMatch(/예약 전쟁|지금 아니면 못 간다/);
  });

  it('가격 시세를 입력 없이 만들지 않는다', () => {
    expect(hfTravel).toMatch(/요즘 ○○원대|최저가/);
    expect(hfTravel).toMatch(/시세 서술을 입력 없이 만들지 않는다/);
  });

  it('감성 묘사가 자료 밖 장면을 만들지 않는다', () => {
    expect(hfTravel).toMatch(/자료 밖 장면을 만들지 않는다/);
    expect(hfTravel).toMatch(/장면이 자료에 없으면 장면 없이 조건과[\s\S]{0,4}판단으로 쓴다/);
  });
});

describe('homefeed 배치 3b — 날조 유발 문구 부재', () => {
  it.each([['food', hfFood], ['travel', hfTravel]])('%s에 무조건 포함 지시가 없다', (_n, p) => {
    const lines = p.split('\n').filter((l) => l.trim().startsWith('-') || l.trim().startsWith('⛔'));
    for (const line of lines) {
      expect(line).not.toMatch(/반드시 (포함|넣|쓴다|작성)|필수로 (포함|넣)/);
    }
  });
});
