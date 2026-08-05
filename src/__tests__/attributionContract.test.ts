import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

/**
 * [2026-08-05] 출처·귀속 표현 4중 충돌 해소.
 *
 * 조립본에 같은 대상에 대해 네 가지 지시가 동시에 들어간다:
 *   base F2(:18)   앱 내부 메타 표현 금지 — `[자료]`, "자료에 따르면", "입력 자료에"
 *   base H6(:202)  "출처 표현 단어 자체 금지"          ← 과잉
 *   base(:354)     "제3자 후기는 출처를 구분해 요약"
 *   human-writing(:30) "꼭 필요한 1~2곳에서만 정확히 출처를 댄다"  ← 최후미 = 실질 승자
 *
 * H6의 "단어 자체 금지"가 뒤의 두 지시를 정면으로 막았다. 그 결과
 * "구매자 후기에서 반복된 지적은 ○○였다" 같은 **타인 경험의 정직한 귀속**이
 * 봉쇄됐다. 이건 자료에 실재하는 경험을 살리는 유일한 통로인데
 * (쇼핑 모드에는 같은 취지의 계약이 shopping_review.prompt 에 이미 있다),
 * SEO·홈판에서는 H6이 그것을 막고 있었다.
 *
 * 해소 방향: H6을 "완전 금지" → "남발 금지 + 대상 한정"으로 좁혀
 * human-writing:30 과 정렬한다. 가짜 1인칭 차단은 H1이 계속 담당한다.
 */

const base = readFileSync(new URL('../prompts/seo/base.prompt', import.meta.url), 'utf8');
const humanWriting = readFileSync(
  new URL('../prompts/shared/human-writing-anti-pattern.prompt', import.meta.url), 'utf8');

function ruleBlock(src: string, id: string): string {
  const start = src.indexOf(`${id}.`);
  if (start < 0) return '';
  const rest = src.slice(start);
  const end = rest.slice(1).search(/\n\s*(?:H\d+|F\d+|R0-\d+|B\d+)\./);
  return end < 0 ? rest.slice(0, 600) : rest.slice(0, end + 1);
}

describe('출처·귀속 — 매체 지시어 남발은 계속 막는다', () => {
  const h6 = ruleBlock(base, 'H6');

  it('H6이 실재한다', () => {
    expect(h6.length).toBeGreaterThan(0);
  });

  it('전언·매체 지시어를 계속 금지한다', () => {
    for (const banned of ['보도에 따르면', '기사를 보니', '관계자에 따르면', '한 매체에 따르면']) {
      expect(h6, `${banned} 는 계속 금지 대상이어야 한다`).toContain(banned);
    }
  });

  it('확인된 사실은 근거 표현 없이 단정하라고 유지한다', () => {
    expect(h6).toMatch(/근거 표현 없이|원래 알던 것처럼|그냥 단정/);
  });
});

describe('출처·귀속 — 타인 경험의 정직한 귀속을 막지 않는다', () => {
  const h6 = ruleBlock(base, 'H6');

  it('"출처 표현 단어 자체 금지" 같은 전면 금지가 남아 있지 않다', () => {
    // 이 문장이 있으면 :354 와 human-writing:30 이 동시에 무효가 된다.
    expect(h6).not.toMatch(/출처 표현 단어 자체 금지/);
  });

  it('귀속이 필요한 경우를 예외로 명시한다', () => {
    expect(h6, '예외가 없으면 모델은 귀속 자체를 회피한다').toMatch(/✅/);
    expect(h6).toMatch(/후기|타인의 경험|경험을 옮길/);
  });

  it('예외에 상한을 둔다 (남발 방지)', () => {
    expect(h6).toMatch(/1~2곳|한두 곳/);
  });

  it('타인 경험을 작성자 경험으로 바꾸지 말라는 계약을 유지한다', () => {
    expect(base, ':354 제3자 후기 조항').toMatch(/제3자 후기[^\n]*작성자 경험으로 바꾸지 않는다/);
    expect(h6).toMatch(/H1|작성자 경험으로/);
  });
});

describe('출처·귀속 — 층별 역할이 겹치지 않는다', () => {
  it('F2는 앱 내부 메타 표현만 다룬다', () => {
    const f2 = ruleBlock(base, 'F2');
    expect(f2).toMatch(/자료에 따르면|입력 자료에/);
    // F2가 매체 지시어까지 금지하면 H6과 대상이 겹쳐 어느 쪽이 이기는지 모호해진다.
    expect(f2).not.toContain('보도에 따르면');
  });

  it('human-writing의 1~2곳 규칙과 base H6이 서로 어긋나지 않는다', () => {
    expect(humanWriting).toMatch(/1~2곳/);
    expect(ruleBlock(base, 'H6')).toMatch(/1~2곳|한두 곳/);
  });
});

/**
 * [2026-08-05] 표 열 수 정의 분산 해소.
 *
 * 같은 축에 두 값이 있었다:
 *   base:376 / homefeed:85 / contentJsonPromptFormat:111  → 최대 2열
 *   exposure-structure:30                                  → 2~3열
 * 조립 순서상 최후미인 contentJsonPromptFormat 이 2열이라 실동작은 이미 2열이었다.
 * 이상치 1곳만 맞춰 정의를 단일화한다 — 동작 변화 없음.
 */
describe('수치 정의 — 표 열 수가 한 값이다', () => {
  const sources = [
    ['seo/base', readFileSync(new URL('../prompts/seo/base.prompt', import.meta.url), 'utf8')],
    ['homefeed/base', readFileSync(new URL('../prompts/homefeed/base.prompt', import.meta.url), 'utf8')],
    ['exposure-structure', readFileSync(new URL('../prompts/shared/exposure-structure.prompt', import.meta.url), 'utf8')],
    ['contentJsonPromptFormat', readFileSync(new URL('../contentJsonPromptFormat.ts', import.meta.url), 'utf8')],
  ] as const;

  it.each(sources)('%s 에 열 수 범위 지정이 없다', (_name, src) => {
    // "2~3열" 처럼 범위로 주면 상한이 둘이 된다. 설명문("3열 이상은 잘림")은 대상이 아니다.
    expect(String(src), '범위 지정은 상한을 모호하게 만든다').not.toMatch(/\d\s*~\s*\d\s*열/);
  });

  it.each(sources)('%s 가 2열 외의 상한을 지시하지 않는다', (_name, src) => {
    // 처방형만 본다 — "N열까지", "N열로", "최대 N열".
    const prescribed = [...String(src).matchAll(/(?:최대\s*)?(\d)\s*열(?:까지|로|만)/g)].map((m) => m[1]);
    for (const n of prescribed) {
      expect(n, '표 상한 정의는 2열 하나여야 한다').toBe('2');
    }
  });
});
