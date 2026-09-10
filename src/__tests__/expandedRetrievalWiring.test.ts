/**
 * SPEC-EVENT-RETRIEVAL-2026 Phase 2 배선.
 *
 * 순수 함수는 9c625ee5 에서 만들어 두고 **아무도 부르지 않았다** — 비용이 늘어나는 일이라
 * 상한과 기본값 결정을 기다렸다. 이제 붙이되 기본은 OFF 다.
 *
 * 결정(안전 우선):
 *   · 기본 OFF — 켜지 않으면 호출이 한 번도 늘지 않는다(회귀 없음)
 *   · 추가 검색 상한 3회 — decomposeKeyword 는 최대 6개를 만들지만 3개만 쓴다
 *   · 자료가 부족할 때만 — 충분하면 확장하지 않는다
 *   · 확장해도 못 찾으면 있는 자료로 진행한다(F12: 글을 막지 않는다)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { planExpandedRetrieval } from '../content/thinMaterialExpansion';

const SEP = '\n\n---\n\n';

describe('planExpandedRetrieval — 언제 · 무엇을 더 검색할지 정한다', () => {
  const thin = ['류현진 평행이론 이야기.', '송영진이 151km를 던졌다.'].join(SEP);
  const rich = [
    '김서현 류현진 평행이론이 화제다.',
    '김서현과 류현진의 평행이론 정리.',
    '류현진 김서현 평행이론 비교.',
  ].join(SEP);

  it('꺼져 있으면 아무것도 하지 않는다 — 기본이 OFF 다', () => {
    const p = planExpandedRetrieval(thin, '김서현 류현진 평행이론', { enabled: false });
    expect(p.shouldExpand).toBe(false);
    expect(p.queries).toEqual([]);
  });

  it('자료가 충분하면 확장하지 않는다 — 켜져 있어도', () => {
    expect(planExpandedRetrieval(rich, '김서현 류현진 평행이론', { enabled: true }).shouldExpand).toBe(false);
  });

  it('자료가 마르면 키워드 안 조합으로 2차 질의를 만든다', () => {
    const p = planExpandedRetrieval(thin, '김서현 류현진 평행이론', { enabled: true });
    expect(p.shouldExpand).toBe(true);
    expect(p.queries.length).toBeGreaterThan(0);
    for (const q of p.queries) {
      for (const word of q.split(' ')) expect('김서현 류현진 평행이론').toContain(word);
    }
  });

  it('추가 검색은 3회를 넘지 않는다 — 비용 상한', () => {
    const p = planExpandedRetrieval('짧은 자료', '가가가 나나나 다다다 라라라 마마마', { enabled: true });
    expect(p.queries.length).toBeLessThanOrEqual(3);
  });

  it('엔티티가 하나뿐이면 분해할 것이 없다', () => {
    expect(planExpandedRetrieval('짧은 자료', '평행이론', { enabled: true }).shouldExpand).toBe(false);
  });

  it('왜 확장하는지 근거를 남긴다 — 로그로 실측해 임계를 조정해야 한다', () => {
    const p = planExpandedRetrieval(thin, '김서현 류현진 평행이론', { enabled: true });
    expect(p.reason).toMatch(/\d/);
  });
});

describe('배선 핀', () => {
  const live = (needle: string): number => readFileSync(new URL('../main/ipc/miscHandlers.ts', import.meta.url), 'utf8')
    .split(String.fromCharCode(10))
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .filter((l) => l.includes(needle))
    .length;

  it('수집 핸들러가 확장 계획을 세운다', () => {
    expect(live('planExpandedRetrieval(')).toBeGreaterThan(0);
  });

  it('설정으로 켜고 끈다 — 기본 OFF', () => {
    expect(live('expandedRetrieval')).toBeGreaterThan(0);
  });

  it('확장 실패해도 있는 자료로 진행한다 — throw 하지 않는다', () => {
    expect(live('throw')).toBe(0);
  });
});
