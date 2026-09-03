import { describe, expect, it } from 'vitest';

import { assessQuoteCoverage, countDirectQuotes, QUOTE_COVERAGE_ISSUE } from '../content/quoteCoverage';
import { evaluateHomefeed } from '../content/evaluators/homefeedEval';

/** [2026-09-04 사장님 결정] 재료엔 인용 93개, 글엔 0개 — 게이트에 항목이 없어 아무도 밀지 않았다 */
describe('직접 인용 커버리지', () => {
  const material = '장동혁 대표는 "공산주의 혁명을 목표로 한 조직"이라고 규정했다. 김민석 대표는 "청문회 이전이라도 판단할 수 있는 문제"라고 말했다. 진보당은 "철 지난 색깔론과 혐오 공세를 중단하라"고 논평했다.';

  it('따옴표 인용을 센다 — 8자 미만·줄 넘김은 제외', () => {
    expect(countDirectQuotes(material)).toBe(3);
    expect(countDirectQuotes('"짧다" 라고 했다')).toBe(0);
    expect(countDirectQuotes('')).toBe(0);
  });

  it('재료에 3개 이상 있는데 본문에 0이면 missing', () => {
    expect(assessQuoteCoverage(material, '인용 없이 정리한 본문입니다.').missing).toBe(true);
    expect(assessQuoteCoverage(material, '장동혁 대표는 "공산주의 혁명을 목표로 한 조직"이라고 규정했습니다.').missing).toBe(false);
    expect(assessQuoteCoverage('인용 없는 재료', '인용 없는 본문').missing).toBe(false);
  });

  it('홈판 평가기가 인용 누락을 이슈로 올린다', () => {
    const body = '청문회를 앞두고 논란이 번졌습니다. 조직문화 의혹과 보조금 지출이 각각 다른 쟁점이거든요. '.repeat(6);
    const withoutQuotes = evaluateHomefeed({ body, title: '용혜인 언더조직 논란 청문회 전 쟁점', rawText: material, headings: [] } as any);
    expect(withoutQuotes.issues).toContain(QUOTE_COVERAGE_ISSUE);
    const withQuotes = evaluateHomefeed({ body: `${body} 장동혁 대표는 "공산주의 혁명을 목표로 한 조직"이라고 규정했습니다.`, title: '용혜인 언더조직 논란 청문회 전 쟁점', rawText: material, headings: [] } as any);
    expect(withQuotes.issues).not.toContain(QUOTE_COVERAGE_ISSUE);
    expect(withQuotes.score).toBeGreaterThan(withoutQuotes.score);
  });
});
