import { describe, expect, it } from 'vitest';

import { filterExaggeratedContent } from '../contentExaggerationFilter';

/**
 * [2026-08-31] 후처리가 구체 정보를 깎고 있었다.
 *
 * 사장님 지적: "글이 전문가가 읽어도 수긍하면서 맛있게 읽히는 글이어야 되는데
 * 오히려 LLM 으로 글 쓴 게 더 나을 정도야."
 *
 * 파이프라인을 전수 조사해 보니 구조가 거꾸로 서 있었다.
 *   프롬프트  깊이를 요구한다              — 살아 있다
 *   게이트    깊이를 재기만 한다            — 점수·경고뿐, 실행 장치는 죽어 있다
 *   후처리    구체 정보를 실제로 깎는다      — 유일하게 이빨이 있다
 *
 * 그중 가장 나쁜 것이 출처 귀속 삭제였다. "통계에 따르면", "연구에 따르면" 을 지우면
 * 주장은 남고 근거만 사라진다 — 네이버 공식 좋은 문서 1번이 "신뢰할 수 있는 정보 기반"
 * (naver_search 2024-02-28) 인데 정확히 반대로 간다.
 *
 * 수치 파괴도 같다. "100%" 를 "대부분" 으로 바꾸면 사실이 뭉개진다. 같은 이유로
 * naturalizeNumbers 는 이미 파이프라인에서 뺐다("금리 4.50%" → "금리 4.절반 정도").
 * 그 판단이 여기에는 적용되지 않은 채 남아 있었다.
 */
describe('출처 귀속을 지우지 않는다', () => {
  it('"통계에 따르면" 을 지우지 않는다 — 주장만 남기면 근거 없는 단정이 된다', () => {
    const text = '통계에 따르면 국내 1인 가구 비율은 꾸준히 늘고 있습니다.';
    expect(filterExaggeratedContent(text)).toContain('통계에 따르면');
  });

  it('"연구에 따르면" · "조사 결과에 따르면" 도 지키다', () => {
    for (const lead of ['연구에 따르면', '조사 결과에 따르면', '데이터에 따르면']) {
      const text = `${lead} 늦은 식사는 대사에 영향을 줍니다.`;
      expect(filterExaggeratedContent(text)).toContain(lead);
    }
  });

  it('"전문가 의견에 따르면" 도 지킨다', () => {
    const text = '전문가 의견에 따르면 초기 2주가 중요합니다.';
    expect(filterExaggeratedContent(text)).toContain('전문가 의견에 따르면');
  });
});

describe('수치를 뭉개지 않는다', () => {
  it('"100%" 를 "대부분" 으로 바꾸지 않는다', () => {
    const text = '영화 누룩은 100% 사비로 제작됐습니다.';
    const out = filterExaggeratedContent(text);
    expect(out).toContain('100%');
    expect(out).not.toContain('대부분');
  });

  it('비율이 든 문장은 그대로 둔다', () => {
    const text = '탄수화물은 50~65%, 단백질은 10~20% 비율을 권장합니다.';
    expect(filterExaggeratedContent(text)).toBe(text);
  });
});

describe('과장 표현은 계속 걸러낸다 — 이 필터의 본래 목적', () => {
  it('"최고의" · "완벽한" 같은 광고 표현은 여전히 순화한다', () => {
    const out = filterExaggeratedContent('최고의 제품이고 완벽한 선택입니다.');
    expect(out).not.toContain('최고의');
    expect(out).not.toContain('완벽한');
  });

  it('"무조건" · "반드시" 같은 단정은 여전히 걷어낸다', () => {
    const out = filterExaggeratedContent('무조건 사야 하고 반드시 후회 없습니다.');
    expect(out).not.toContain('무조건');
    expect(out).not.toContain('반드시');
  });

  it('어떤 입력에도 던지지 않는다', () => {
    expect(() => filterExaggeratedContent(null as never)).not.toThrow();
  });
});
