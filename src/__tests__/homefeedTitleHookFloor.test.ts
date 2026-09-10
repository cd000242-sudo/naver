/**
 * [2026-09-11] 홈판 제목 후킹 하한.
 *
 * 뿌리: 후킹 공식 248줄(prompts/title/homefeed/base.prompt)이 generateTitleOnlyPatch 에만
 *   있고, computeHomefeedTitleCriticalIssues 가 이슈를 잡을 때만 호출된다. 실측으로
 *   홈판 37편 중 13편(35%)이 무결점 통과 → 후킹 공식이 한 번도 안 돌았다.
 *   결함이 없으면 후킹도 없는 구조였다.
 *
 * 이 파일은 (1) 밋밋한 제목이 하한에 걸리고, (2) 후킹 있는 제목은 통과하고,
 * (3) 단어만 박아서는 못 피한다는 계약을 잠근다.
 */
import { describe, it, expect } from 'vitest';
import { computeHomefeedTitleHookFloorIssues } from '../contentTitleValidators';

const pass = (t: string) => expect(computeHomefeedTitleHookFloorIssues(t)).toEqual([]);
const fail = (t: string) => expect(computeHomefeedTitleHookFloorIssues(t).length).toBeGreaterThan(0);

describe('후킹 있는 실제 발행 제목은 통과한다', () => {
  it('대조 구조', () => {
    pass('수술 아니고 시술, 심권호가 마지막 간암 치료 끝내고 전한 근황');
    pass('8년 전 같은 드라마에 있었습니다…\'펜트하우스\' 윤종훈이 11월 1일 결혼하는 10살 연하 배우');
  });

  it('인용 구조', () => {
    pass('"붕어빵 그 꼬마라고?" 우지원 딸 우서윤 미스코리아 진 당선, 인스타 사복 보니 납득 완료');
  });

  it('결론 차단 구조', () => {
    pass('그것이 알고싶다 1501회 나체 살인범 정재환, 부모 반응이 이게맞나...?');
    pass('권민아 재산 피해 주장, 1억5천 차용증 한 장이 남은 배경은 무엇일까');
  });
});

describe('밋밋한 실제 발행 제목은 하한에 걸린다', () => {
  it('요약형 종결 — 정보가 제목에서 끝나 클릭 이유가 없다', () => {
    fail('2026년 택배없는날 8월 14일 멈추는 배송 택배사별 재개일 정리');
    fail('홈플러스 재개장 67개 매장 확인과 반값 할인 재고 현황');
    fail('몰아보기 2천만 뷰의 전설, 예비역 소환한 신병4 24일 첫방 관전 포인트');
    fail('로메로 AT마드리드 2031년 계약 이강인 든든한 방패 얻었다 이적료 656억 확정');
    fail('영화 오디세이 4DX 솔직 관람 후기 172분 체감과 IMAX 비교');
  });

  it('구조 신호 없음 — 정보형 나열', () => {
    fail('카라 곡 리메이크로 1위 찍은 리센느, 내일은 축구장 무대');
    fail('2026 한섬 패밀리세일 첫 방문이라면 1관 2관 3관 동선부터 정하세요');
  });
});

describe('단어만 박아서는 하한을 못 피한다', () => {
  it('"의외로"를 붙였지만 대조 구조가 없으면 미달', () => {
    fail('올다르크 구속 영장 기각, 의외로 먼저 봐야 할 법원 판단');
  });

  it('"의외로"가 붙고 실제 대조("금액보다 날짜")가 있으면 통과', () => {
    pass('의외로 금액보다 날짜, 재산세 7월 31일까지와 3% 확인선');
  });
});

describe('경계', () => {
  it('빈 제목은 하한 판정 대상이 아니다 — 기존 critical 게이트가 잡는다', () => {
    expect(computeHomefeedTitleHookFloorIssues('')).toEqual([]);
    expect(computeHomefeedTitleHookFloorIssues('   ')).toEqual([]);
  });

  it('요약형 종결은 다른 구조 신호가 있어도 걸린다', () => {
    fail('수술 아니고 시술, 심권호 간암 치료 내역');
  });
});

describe('배선 핀 — 하한이 패치 경로에 실제로 합류했는가', () => {
  it('contentGenerator 의 홈판 제목 이슈 집계가 하한을 포함한다', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(new URL('../contentGenerator.ts', import.meta.url), 'utf8');
    const block = src.slice(src.indexOf('const titleIssues = ['));
    expect(block.slice(0, 300)).toMatch(/computeHomefeedTitleCriticalIssues/);
    expect(block.slice(0, 300)).toMatch(/computeHomefeedTitleHookFloorIssues/);
  });

  it('하한은 후보 순위 계산(contentMergeOverlay)에는 끼어들지 않는다 — 가중치 보존', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(new URL('../contentMergeOverlay.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/computeHomefeedTitleHookFloorIssues/);
  });
});
