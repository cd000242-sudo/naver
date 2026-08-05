import { describe, expect, it } from 'vitest';

import { optimizeContentForNaver } from '../contentOptimizer';

/**
 * [2026-08-05] 후처리가 본문 문단을 전멸시키던 문제.
 *
 * removeConsecutiveDuplicates(contentOptimizer.ts:438)가 본문 전체를
 * `/(?<=[.!?])\s+/` 로 쪼갠다. 이 정규식의 `\s+` 는 문단 사이 `\n\n` 도 삼키고,
 * 마지막에 `uniqueSentences.join(' ')` 로 **공백 하나**를 넣어 다시 붙인다.
 * 결과적으로 모든 문단 경계가 사라진다.
 *
 * 실측(수정 전): 문단 8개 입력 → 출력 문단 1개, 개행 0개.
 * 게다가 문단마다 반복되는 문장이 "중복"으로 판정돼 본문 내용까지 소실됐다.
 *
 * 프롬프트는 정반대를 요구한다 —
 *   seo/base.prompt   "한 단락 2~3문장 (모바일 1화면)"
 *   homefeed/base.prompt 동일 취지
 *
 * 파급이 하나 더 있다. 문단이 1개로 뭉개지면 문단 단위로 도는 후속 단계들이
 * 사실상 무력화된다(enhanceEEAT 의 split(/\n{2,}/) 등). 이 문제를 고치면
 * 그 단계들이 처음으로 정상 작동하므로, 그쪽 안전성도 함께 확인해야 한다.
 */

function body(paragraphCount = 8): string {
  return Array.from({ length: paragraphCount }, (_, i) =>
    `${i + 1}번 문단입니다. 조건과 절차를 설명합니다. 자료에서 확인된 내용만 담았습니다.`,
  ).join('\n\n');
}

describe('후처리 — 문단 경계를 보존한다', () => {
  it('문단 수가 유지된다', () => {
    const input = body(8);
    const out = String(optimizeContentForNaver(input, 'professional', true));
    expect(out.split(/\n{2,}/).filter((p) => p.trim()).length).toBe(8);
  });

  it('개행이 남아 있다', () => {
    const out = String(optimizeContentForNaver(body(8), 'professional', true));
    expect((out.match(/\n/g) || []).length).toBeGreaterThan(0);
  });

  it('문단마다 반복되는 문장을 중복으로 지우지 않는다', () => {
    // 각 문단이 같은 설명 문장을 갖는 것은 정상이다(주제가 다르므로).
    const out = String(optimizeContentForNaver(body(8), 'professional', true));
    const kept = (out.match(/조건과 절차를 설명합니다/g) || []).length;
    expect(kept, '문단별 문장이 통째로 사라지면 본문이 소실된다').toBeGreaterThan(1);
  });

  it('한 문단 안의 진짜 연속 중복은 계속 제거한다 (회귀 방지)', () => {
    const dup = '같은 문장이 이어집니다. 같은 문장이 이어집니다. 뒤에 다른 내용이 옵니다.';
    const out = String(optimizeContentForNaver(dup, 'professional', true));
    expect((out.match(/같은 문장이 이어집니다/g) || []).length).toBe(1);
  });

  it('전 톤에서 문단이 보존된다', () => {
    for (const tone of ['professional', 'community_fan', 'mom_cafe']) {
      const out = String(optimizeContentForNaver(body(6), tone, true));
      expect(out.split(/\n{2,}/).filter((p) => p.trim()).length, tone).toBe(6);
    }
  });
});

/**
 * 문단이 1개로 뭉개져 있는 동안 잠들어 있던 주입기들이 문단 복원과 함께 깨어난다.
 * 실측: 문단을 살린 직후 authority 사전이 40회 중 40회 없는 출처를 귀속시켰다.
 * base H6(출처 언급 절대 금지)·F1(자료 외 사실 금지) 동시 위반이므로 같은 릴리즈에서 막는다.
 */
describe('후처리 — 없는 출처를 귀속시키지 않는다', () => {
  const FABRICATED_SOURCE = [
    '공식 발표에 따르면', '신뢰할 수 있는 데이터에 따르면', '검증된 리포트를 보면',
    '공신력 있는 출처에 의하면', '전문가들의 의견에 따르면', '실제로 확인해본 결과',
    '관련 데이터를 분석해보면', '팩트에 기반하여',
  ] as const;

  it('문단이 많은 글에서도 출처 표현이 주입되지 않는다', () => {
    const hits = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const out = String(optimizeContentForNaver(body(10), 'professional', true));
      FABRICATED_SOURCE.filter((p) => out.includes(p)).forEach((p) => hits.add(p));
    }
    expect([...hits], '자료에 없는 출처를 만들면 H6·F1을 동시에 위반한다').toEqual([]);
  });
});
