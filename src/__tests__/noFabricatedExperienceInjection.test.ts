import { describe, expect, it } from 'vitest';

import { applyAuthGRDefense } from '../authgrDefense';
import { optimizeContentForNaver } from '../contentOptimizer';

/**
 * [2026-08-05] 후처리가 본문에 가짜 1인칭 경험을 주입하던 문제.
 *
 * 프롬프트 층은 "경험 날조 금지"를 정교하게 계약해 왔지만, 생성이 끝난 뒤
 * 후처리 코드가 사전에서 경험 문구를 뽑아 문단 앞에 직접 붙이고 있었다.
 * 자료 근거를 인자로 받지도 않으므로 근거 유무와 무관하게 항상 주입된다.
 *
 * 실측(수정 전): "이 문단은 어떤 개인 경험도 포함하지 않습니다"라고 명시한
 * 문단 8개를 넣었더니 아래가 붙어 나왔다.
 *   "다시 구매할 의향이 있냐고 물으면 실제로 경험해보니, …"
 *   "제 경우에는 …"
 * 사용 기간은 난수였다(authgrDefense.ts의 periods 배열 + Math.random).
 *
 * 이 문구들은 evidenceIntegrity의 1인칭 검출 패턴에 걸리지 않아 품질 게이트도
 * 통과했다. 즉 프롬프트가 막고, 후처리가 넣고, 게이트가 못 잡는 상태였다.
 *
 * 함수 자체는 남긴다(단위 테스트가 있다). 프로덕션 파이프라인에서만 분리한다.
 */

/**
 * 자료에 없는 1인칭 체험·사회적 증거를 주장하는 문구들 — 후처리 3종이 만들어내던 것.
 * 출처: contentOptimizer TONE_EEAT_EXPRESSIONS.experience / TONE_HUMAN_EXPRESSIONS,
 *      authgrDefense EXPERIENCE_EXPRESSIONS / EXTENDED_EXPERIENCE.
 */
const FABRICATED_EXPERIENCE = [
  // enhanceEEAT — experience 카테고리
  '실제로 사용해보니', '직접 경험한 바로는', '현장에서 느껴본 결론은', '오랫동안 지켜본 결과',
  // authgrDefense — 경험 표현
  '제 경우에는', '실제로 해보니까', '직접 비교해본 결과', '다시 구매할 의향이 있냐고 물으면',
  '실제로 경험해보니', '처음에는 반신반의했',
  // addHumanExpressions — 체험·사회적 증거
  '막상 해보니', '막상 경험해보니', '실제 생활에서', '주변 지인들도', '나중에 알고 보니',
  '솔직히 고민이 많았', '시간이 지날수록 더 마음에 드는', '애기가 좋아해서',
] as const;

/** 삽입은 Math.random 기반이라 1회 실행으로는 놓친다 — 반복해서 확인한다. */
const TRIALS = 40;

/** 근거가 전혀 없는 본문 — 어떤 경험 주장도 나오면 안 된다 */
function neutralBody(paragraphCount = 10): string {
  return Array.from({ length: paragraphCount }, (_, i) =>
    `${i + 1}번 항목입니다. 자료에서 확인된 조건과 절차만 설명하며, `
    + '작성자의 사용 경험이나 방문 기록은 이 글에 포함되어 있지 않습니다.').join('\n\n');
}

function foundIn(text: string): string[] {
  return FABRICATED_EXPERIENCE.filter((phrase) => text.includes(phrase));
}

describe('후처리 — 자료 없는 1인칭 경험을 주입하지 않는다', () => {
  it('applyAuthGRDefense가 경험 문구를 붙이지 않는다', () => {
    const hits = new Set<string>();
    for (let i = 0; i < TRIALS; i++) {
      const r = applyAuthGRDefense(neutralBody(), 'professional') as { content?: string };
      foundIn(String(r?.content ?? r)).forEach((p) => hits.add(p));
    }
    expect([...hits], '자료 근거 없이 체험을 주장하는 문구가 주입됐습니다').toEqual([]);
  });

  it('사용 기간을 난수로 만들어 붙이지 않는다', () => {
    for (let i = 0; i < TRIALS; i++) {
      const r = applyAuthGRDefense(neutralBody(), 'professional') as { content?: string };
      expect(String(r?.content ?? r)).not.toMatch(/사용한\s*지\s*(?:2주|한\s*달|3개월|6개월|1년)째/);
    }
  });

  it('정규 발행 경로에서도 주입되지 않는다 (전 톤)', () => {
    const hits = new Set<string>();
    for (const tone of ['professional', 'community_fan', 'mom_cafe']) {
      for (let i = 0; i < TRIALS; i++) {
        foundIn(String(optimizeContentForNaver(neutralBody(), tone, true))).forEach((p) => hits.add(p));
      }
    }
    expect([...hits], 'optimizeContentForNaver는 매 글에 호출된다').toEqual([]);
  });

  it('원문 문단 수를 늘리지 않는다', () => {
    const input = neutralBody(6);
    for (let i = 0; i < TRIALS; i++) {
      const after = String(optimizeContentForNaver(input, 'professional', true))
        .split(/\n{2,}/).filter((p) => p.trim()).length;
      expect(after).toBeLessThanOrEqual(6);
    }
  });
});
