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

/*
 * [2026-09-17] 하한을 장치 1개 → 2개로 올렸다.
 *
 * 기존 근거는 발행 제목 37편 눈대중이었다. 대조군이 없어 "후킹처럼 보이는가"만 볼 수 있었고
 * "실제로 홈판에 더 들어가는가"는 볼 수 없었다. 홈판 1,299편 vs 같은 블로그가 같은 기간에
 * 썼지만 홈판에 못 간 794편으로 다시 재면(장치 정확 개수별 등장률의 비):
 *
 *   0개 0.44배 · 1개 0.84배 · 2개 1.14배 · 3개 이상 1.88배
 *
 * 장치 1개는 홈판 진입에 **불리한 쪽**이었다. 그래서 1개짜리는 통과가 아니라 제목 재작성
 * 대상으로 넘긴다 — 하한 미달은 거절이 아니라 재작성 트리거다.
 */
describe('후킹 있는 실제 발행 제목은 통과한다', () => {
  it('대조 + 인용 + 말줄임 (장치 3개)', () => {
    pass('8년 전 같은 드라마에 있었습니다…\'펜트하우스\' 윤종훈이 11월 1일 결혼하는 10살 연하 배우');
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

  it('"의외로"가 붙고 실제 대조가 있어도 장치 1개면 재작성 대상', () => {
    // 대조 하나뿐이다. 실측 1개 구간은 0.84배 — 통과시키면 불리한 제목을 그대로 내보낸다.
    fail('의외로 금액보다 날짜, 재산세 7월 31일까지와 3% 확인선');
  });
});

describe('장치 1개짜리는 재작성 대상이다 (2026-09-17 하한 상향)', () => {
  it('대조만 있는 실제 발행 제목', () => {
    fail('수술 아니고 시술, 심권호가 마지막 간암 치료 끝내고 전한 근황');
  });

  it('인용만 있는 실제 발행 제목', () => {
    fail('"붕어빵 그 꼬마라고?" 우지원 딸 우서윤 미스코리아 진 당선, 인스타 사복 보니 납득 완료');
  });

  it('장치 0개인데 느슨한 정규식으로 통과하던 생성물', () => {
    // hasContrast 의 `\S 전 ` 이 "오픈 전 대기" 에 걸려 대조 1개로 통과했었다.
    fail('식당 오픈 전 대기 목격담, 즉흥 먹방 여행은 어디까지 리얼일까');
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
    // [2026-09-17] 집계가 인라인 배열에서 homefeedTitleGate 단일 출처로 옮겨졌다.
    //   재작성 수용 판정(judgeTitleReplacement)과 같은 기준을 써야 "고치라고 보냈는데
    //   더 나빠진 것을 받아들이는" 일이 안 생기기 때문이다.
    const gen = fs.readFileSync(new URL('../contentGenerator.ts', import.meta.url), 'utf8');
    expect(gen).toMatch(/const titleIssues = computeHomefeedTitleGateIssues\(/);
    expect(gen).toMatch(/judgeTitleReplacement\(/);

    const gate = fs.readFileSync(new URL('../content/homefeedTitleGate.ts', import.meta.url), 'utf8');
    expect(gate).toMatch(/computeHomefeedTitleCriticalIssues/);
    expect(gate).toMatch(/computeHomefeedTitleHookFloorIssues/);
  });

  it('하한은 후보 순위 계산(contentMergeOverlay)에는 끼어들지 않는다 — 가중치 보존', async () => {
    const fs = await import('fs');
    const src = fs.readFileSync(new URL('../contentMergeOverlay.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/computeHomefeedTitleHookFloorIssues/);
  });
});
