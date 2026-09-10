/**
 * [2026-09-10 사장님] "이미 상위노출된 걸 보지 않니?"
 *
 * 본다. 그런데 **채점표를 반만 채우고** 본다. 그래서 1년 동안 "우리가 이긴다" 는 착시가 있었다.
 *
 * 실측(serp-benchmark-history.json 179건, 8월 이후): 우리 84.4점 vs 상위 노출 문서 52.9점,
 * 우세 173/179. 그런데 실제 노출은 상위 문서가 가져간다.
 *
 * 원인: serpProbe 가 상위 문서를 평가할 때 이렇게 넣었다.
 *   headings: []      ← 소제목을 추출하지 않았다 (없는 게 아니라 안 뽑았다)
 *   rawText: ''       ← 자료 없음 (구조적으로 채울 수 없다)
 * 우리 글은 실제 소제목·자료·groundingText 를 다 채우고 평가받는다.
 *
 * seoEval 소제목 배점(15점)만 봐도:
 *   headings=[]        → 4 + 0 + 2 = 6점
 *   소제목 3~7개·중복없음 → 9 + 4 + 2 = 15점
 * 시작부터 9점이 벌어진다. 상대는 맨몸으로 같은 시험을 본다.
 *
 * 계약: (1) 채울 수 있는 것은 채운다 — 본문에서 소제목을 뽑는다.
 *       (2) 구조적으로 못 채우는 축(자료 기반 안전성)은 비교에서 뺀다 —
 *           못 채우는 항목으로 남을 깎으면 그건 측정이 아니라 자기 확인이다.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const live = (p: string, needle: string): number => src(p)
  .split(String.fromCharCode(10))
  .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
  .filter((l) => l.includes(needle))
  .length;

describe('serpProbe — 상위 문서도 같은 조건으로 평가한다', () => {
  it('상위 문서 본문에서 소제목을 뽑는다 (빈 배열을 넣지 않는다)', () => {
    expect(live('../analytics/serpProbe.ts', 'headings: []')).toBe(0);
    expect(live('../analytics/serpProbe.ts', 'extractSemiAutoHeadingsFromBody')).toBeGreaterThan(0);
  });

  it('추출한 소제목을 평가 입력에 싣는다', () => {
    expect(src('../analytics/serpProbe.ts')).toMatch(/headings:\s*(?!\[\])/);
  });
});

describe('benchmarkAnalyzer — 못 채우는 축은 비교하지 않는다', () => {
  it('안전성은 비교 대상에서 뺀다 — 상위 문서는 자료(rawText)가 없어 항상 불리하다', () => {
    const code = src('../analytics/benchmarkAnalyzer.ts');
    expect(code).toMatch(/비교 불가|비교하지 않는다|COMPARABLE/);
  });

  it('안전성 gap 을 강점·보완 목록에 넣지 않는다', () => {
    expect(live('../analytics/benchmarkAnalyzer.ts', 'safetyGap')).toBe(0);
  });
});
