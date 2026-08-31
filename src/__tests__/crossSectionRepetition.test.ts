import { describe, expect, it } from 'vitest';

import {
  findCrossSectionRepeats,
  describeCrossSectionRepeats,
} from '../content/crossSectionRepetition';

/**
 * [2026-09-01 사장님 실측] 가을 환절기 비염 글에서 같은 말이 세 번 되풀이됐다.
 *
 *   앞 섹션                                          결론
 *   "숫자를 모르면 조절 자체가 안 됩니다"              "숫자를 모르면 조절이 안 됩니다"
 *   "증상이 조절되더라도 재발이나 합병증을 막기 위해   "증상이 조절돼도 재발과 합병증을 막으려면
 *    꾸준한 관리가 필요"                                꾸준한 관리가 필요"
 *   "이 글의 숫자들은 한 철 대응이 아니라 계절 루틴"   "이 숫자들은 한 철이 아니라 계절 루틴"
 *
 * 글자가 조금씩 달라서 완전 일치 비교로는 안 잡힌다.
 *
 * 왜 아무도 못 봤는지 찾아봤다. contentOptimizer 의 removeConsecutiveDuplicates 는
 * 2026-08-05 에 범위를 문단 안으로 좁혔다 — 그전에는 글 전체를 훑다가 문단 경계를
 * 통째로 날리고(문단 8개 -> 1개) 문단마다 반복되는 정상 문장까지 지웠기 때문이다.
 * 그 수정은 옳았지만, 그 자리에서 섹션 간 반복을 보는 눈이 같이 사라졌다.
 *
 * 여기서는 지우지 않는다. 어느 섹션과 어느 섹션이 겹치는지 알려주기만 한다.
 * 결론이 앞 내용을 요약하는 것은 정상이므로, 거의 그대로 옮긴 경우만 잡는다.
 */
describe('실측 사례를 잡는다', () => {
  const sections = [
    { heading: '습도 정리', content: '습도계를 하나 두고 현재 값부터 확인해 보세요. 숫자를 모르면 조절 자체가 안 됩니다.' },
    { heading: '유병률', content: '알레르기 비염은 증상이 조절되더라도 재발이나 합병증을 막기 위해 꾸준한 관리가 필요합니다.' },
    { heading: '마무리', content: '지금 방 습도가 몇 퍼센트인지부터 확인해보세요. 숫자를 모르면 조절이 안 됩니다.' },
  ];

  it('표현이 조금 달라도 같은 말이면 잡는다', () => {
    const repeats = findCrossSectionRepeats(sections);
    expect(repeats.length).toBeGreaterThan(0);
    expect(repeats.map((r) => r.later).join(' ')).toMatch(/숫자를 모르면/);
  });

  it('어느 섹션끼리 겹치는지 알려준다', () => {
    const message = describeCrossSectionRepeats(findCrossSectionRepeats(sections)).join(' ');
    expect(message).toMatch(/습도 정리/);
    expect(message).toMatch(/마무리/);
  });
});

describe('정상을 괴롭히지 않는다', () => {
  it('같은 주제를 다른 내용으로 말하면 잡지 않는다', () => {
    const sections = [
      { heading: '습도', content: '실내 습도는 45~60% 사이에 두는 것이 기준입니다.' },
      { heading: '온도', content: '실내 온도는 22~23도 내외로 맞추면 됩니다.' },
      { heading: '환기', content: '창문 환기는 하루 세 번, 매회 십 분 이상 확보해야 합니다.' },
    ];
    expect(findCrossSectionRepeats(sections)).toHaveLength(0);
  });

  it('짧은 문장은 비교하지 않는다 — 짧으면 우연히 겹친다', () => {
    const sections = [
      { heading: 'A', content: '그렇습니다. 맞습니다.' },
      { heading: 'B', content: '그렇습니다. 맞습니다.' },
    ];
    expect(findCrossSectionRepeats(sections)).toHaveLength(0);
  });

  it('같은 섹션 안의 반복은 여기서 보지 않는다 — 문단 단위 처리기의 몫이다', () => {
    const sections = [
      { heading: 'A', content: '숫자를 모르면 조절 자체가 안 됩니다. 숫자를 모르면 조절이 안 됩니다.' },
    ];
    expect(findCrossSectionRepeats(sections)).toHaveLength(0);
  });

  it('빈 입력에 던지지 않는다', () => {
    expect(() => findCrossSectionRepeats([])).not.toThrow();
    expect(findCrossSectionRepeats(undefined as never)).toHaveLength(0);
  });
});
