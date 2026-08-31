import { describe, expect, it } from 'vitest';

import {
  findPipelineMetricLeaks,
  describePipelineMetricLeaks,
} from '../content/pipelineMetricLeak';

/**
 * [2026-09-01 사장님 실측] 자취방 인테리어 글에 도구의 내부 수치가 그대로 실렸다.
 *
 *   요약표    "주요 검색 데이터 | 침대헤드수납장 10,268개, 2+1 포스터 33,991개"
 *   본문      "사진 검색 결과를 보면 총 419개 데이터에서"
 *             "버터색 문 사진 검색 결과가 195개 수준으로 확인되며"
 *             "2+1 포스터 사진 검색 33,991개 데이터를 통해 확인되듯"
 *
 * 이건 이미지 검색 결과 개수다. 인테리어와 아무 상관이 없고, 독자에게
 * "포스터 사진이 33,991장 검색된다" 는 아무 의미가 없다. 도구가 자기 배관을 보여준 것이다.
 *
 * 논증도 성립하지 않는다. "419개 데이터에서 낮은 수납장이 눈에 띈다" 는
 * 사진이 419장 검색됐다는 사실일 뿐, 낮은 수납장이 낫다는 근거가 못 된다.
 *
 * 왜 나왔는지 찾아봤다. geo-overlay.prompt 가 "본문 H2당 최소 1개의 검증 가능한 구체
 * (수치/날짜/금액/조건)" 를 요구하는데, 어떤 수치가 유효한지는 정해두지 않았다.
 * 자료에 진짜 수치가 없으면 모델은 자료에 있는 숫자 — 크롤링에 섞여 온 검색 건수 — 를 쓴다.
 * 근거 게이트도 통과한다. 그 숫자가 실제로 자료에 있기 때문이다.
 *
 * 프롬프트에서 금지하고, 여기서 잰다. 경고만 내고 발행은 막지 않는다.
 */
describe('실측 사례를 잡는다', () => {
  it('"사진 검색 결과 419개" 를 잡는다', () => {
    const leaks = findPipelineMetricLeaks('사진 검색 결과를 보면 총 419개 데이터에서 낮은 수납장이 눈에 띕니다.');
    expect(leaks).toHaveLength(1);
    expect(leaks[0]).toContain('419개');
  });

  it('"사진 검색 33,991개 데이터" 도 잡는다', () => {
    expect(findPipelineMetricLeaks('2+1 포스터 사진 검색 33,991개 데이터를 통해 확인되듯')).toHaveLength(1);
  });

  it('요약표에 박힌 검색 건수도 잡는다', () => {
    const table = '| 주요 검색 데이터 | 침대헤드수납장 10,268개, 2+1 포스터 33,991개 |';
    expect(findPipelineMetricLeaks(table).length).toBeGreaterThan(0);
  });

  it('무엇이 문제인지 말해준다', () => {
    const message = describePipelineMetricLeaks(findPipelineMetricLeaks('사진 검색 결과 195개 수준으로 확인됩니다.')).join(' ');
    expect(message).toMatch(/검색 건수/);
  });
});

describe('진짜 수치는 건드리지 않는다', () => {
  it('가격 · 규격 · 기간은 잡지 않는다', () => {
    for (const line of [
      '일반 관람료는 14000원으로 책정됐습니다.',
      '실내 습도는 45~60% 사이가 기준입니다.',
      '환기는 하루 3회, 매회 10분 이상 하세요.',
      '보증 기간은 2년입니다.',
    ]) {
      expect(findPipelineMetricLeaks(line)).toHaveLength(0);
    }
  });

  it('검색과 무관한 개수는 잡지 않는다', () => {
    expect(findPipelineMetricLeaks('구성품은 총 3개입니다.')).toHaveLength(0);
    expect(findPipelineMetricLeaks('후기 7건을 종합하면 밀폐력이 좋다는 평이 많습니다.')).toHaveLength(0);
  });

  it('빈 입력에 던지지 않는다', () => {
    expect(findPipelineMetricLeaks('')).toHaveLength(0);
    expect(() => findPipelineMetricLeaks(undefined as never)).not.toThrow();
  });
});
