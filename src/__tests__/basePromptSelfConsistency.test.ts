import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

/**
 * [2026-08-05] base.prompt 자기모순 제거.
 *
 * 카테고리 파일이나 오버레이로는 덮을 수 없는 충돌들이다. base가 스스로 어긋나면
 * 뒤에 오는 어떤 파일도 그 모호성을 해소할 수 없다.
 *
 * 1) 룰 ID 네임스페이스 중복 — F1~F6이 두 계열에 동시에 쓰였다.
 *    :11-38  [SECTION -2] 충실도 게이트 (F1 자료 외 사실 금지 …)
 *    :471-485 진짜 사람 글의 지문 (F1 1문장 단락 …)
 *    그리고 참조가 서로 반대 강도를 요구했다:
 *    :43  "⛔ F1~F6 위반은 RAG/팩트체크 실패와 동일. 응답 거부 또는 재생성 트리거."
 *    :641 "□ F1~F15 중 8개 이상 적용되었는가?"
 *    같은 F1인데 한쪽은 절대 준수, 한쪽은 15개 중 8개만 고르면 되는 선택 항목이다.
 *    근거 게이트를 약화시키는 방향의 모호성이므로 우선 해소한다.
 *
 * 2) R0-13이 F1을 직접 위배 — F1은 `⛔ "○월 ○일 기준" 작성일 못박기 금지`인데
 *    R0-13은 `"최근 ~ 기준 업데이트" 시점 표시 1회 자연 삽입`을 지시했다.
 *    :7이 "본 섹션 5개 룰은 다른 모든 룰보다 우선. 위반 시 전체 응답 폐기"라고
 *    선언했으므로 F1이 이겨야 한다.
 *
 * 3) 도입부 모범 예시가 자기 블랙리스트에 걸림 — :311의 "정리해드릴게요"가
 *    R0-8(:126 "정리하면" 등 AI 정리체 금지)과 B1(:448)에 해당한다.
 */

const base = readFileSync(new URL('../prompts/seo/base.prompt', import.meta.url), 'utf8');
const lines = base.split(/\r?\n/);

/** 줄머리에 선언된 룰 ID만 수집한다 (본문 중 언급은 제외) */
function declaredIds(pattern: RegExp): string[] {
  return lines
    .map((l) => l.match(pattern)?.[1])
    .filter((v): v is string => Boolean(v));
}

describe('base.prompt — 룰 ID가 유일하다', () => {
  it.each([
    ['F', /^\s*(F\d+)\./],
    ['H', /^\s*(H\d+)\./],
    ['R0', /^\s*(R0-\d+)\./],
    ['B', /^\s*(B\d+)\./],
  ])('%s 계열에 중복 선언이 없다', (_label, pattern) => {
    const ids = declaredIds(pattern as RegExp);
    const seen = new Set<string>();
    const dupes = ids.filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
    expect(
      [...new Set(dupes)],
      '같은 ID가 서로 다른 규칙을 가리키면 어떤 참조도 모호해집니다',
    ).toEqual([]);
  });

  it('충실도 게이트 F계열과 문체 지문 계열이 다른 접두사를 쓴다', () => {
    // :471 이후의 문체 항목이 여전히 F로 시작하면 :43(응답 거부)과 :641(8개 이상)이
    // 같은 ID를 반대 강도로 참조하게 된다.
    const styleBlockStart = lines.findIndex((l) => l.includes('진짜 사람 글의 지문'));
    expect(styleBlockStart).toBeGreaterThan(-1);
    const styleBlock = lines.slice(styleBlockStart, styleBlockStart + 20);
    expect(styleBlock.filter((l) => /^\s*F\d+\./.test(l))).toEqual([]);
  });

  it('체크리스트가 충실도 게이트를 선택 항목으로 만들지 않는다', () => {
    // "F1~F15 중 8개 이상"은 F1(자료 외 사실 금지)을 8/15 선택지로 강등한다.
    const codeLines = lines.filter((l) => !l.trim().startsWith('//'));
    expect(codeLines.join('\n')).not.toMatch(/F1~F15\s*중\s*\d+개\s*이상/);
  });
});

describe('오버레이 — base 룰 ID 참조가 실재한다', () => {
  /** base 계열별로 선언된 ID 집합. 대괄호 표기([GAMMA-7])와 점 표기(R0-4.) 둘 다 인정한다. */
  function idsOf(mode: 'seo' | 'homefeed'): Set<string> {
    const src = readFileSync(new URL(`../prompts/${mode}/base.prompt`, import.meta.url), 'utf8');
    const ids = [...src.matchAll(/(?:^\s*|\[)((?:R0-|GAMMA-|HW|F|H|B)\d+)(?:\]|\.)/gm)].map((m) => m[1]);
    return new Set(ids);
  }

  it('situation-depth가 참조하는 룰이 전부 실재한다', () => {
    const overlay = readFileSync(new URL('../prompts/shared/situation-depth.prompt', import.meta.url), 'utf8');
    const refs = [...overlay.matchAll(/\b(seo|homefeed)\s+((?:R0-|GAMMA-|HW|F|H|B)\d+(?:·(?:R0-|GAMMA-|HW|F|H|B)?\d+)*)/g)];
    expect(refs.length, '참조를 하나도 찾지 못했다면 정규식이 틀린 것이다').toBeGreaterThan(0);

    const missing: string[] = [];
    for (const [, mode, group] of refs) {
      const declared = idsOf(mode as 'seo' | 'homefeed');
      for (const id of group.split('·')) {
        if (!declared.has(id)) missing.push(`${mode} ${id}`);
      }
    }
    expect(missing, '존재하지 않는 룰을 가리키면 모델이 그 지시를 해석할 수 없다').toEqual([]);
  });
});

describe('base.prompt — 절대 룰을 스스로 위배하지 않는다', () => {
  it('작성일 못박기를 금지하면서 동시에 지시하지 않는다', () => {
    // F1: ⛔ "○월 ○일 기준" 작성일 못박기 금지(실시간 기준)
    expect(base).toMatch(/작성일 못박기 금지/);
    // R0-13이 요구하던 "기준 업데이트 시점 표시"가 남아 있으면 정면 충돌이다.
    expect(base).not.toMatch(/기준\s*업데이트[^\n]*표시\s*1회/);
    expect(base).not.toMatch(/2026-05 기준 최신 변경 사항/);
  });

  it('근거 없는 외부 수치를 프롬프트가 사실로 제시하지 않는다', () => {
    // R0-14가 인용하던 "스크랩 +14점 / 댓글 +5점"은 벤더 주장이며 출처 검증이 안 된다.
    // F1이 자료 외 수치를 금지하는데 프롬프트 자신이 그 수치를 쓰고 있었다.
    expect(base).not.toMatch(/스크랩\s*=\s*글\s*점수\s*\+\d+점/);
    expect(base).not.toMatch(/블로그연구소 실측/);
  });

  it('AI 정리체를 금지하면서 모범 예시로 제시하지 않는다', () => {
    // R0-8(:126) "정리하면" 등 AI 정리체 금지 / B1(:448) "살펴보겠습니다"
    expect(base).toMatch(/AI 정리체 금지/);
    expect(base).not.toMatch(/순서로 정리해드릴게요/);
  });
});

/**
 * [2026-08-05] geo-overlay 가 base F1 을 위배하던 문제.
 *
 * `geo-overlay.prompt:7` 은 "충돌 시 base.prompt가 우선"을 스스로 선언해 놓고,
 * 시점 시그널 블록에서 `✅ "현재(2026년 5월) 기준"` 처럼 자료에 없는 날짜를
 * 모범 예시로 제시했다. base F1 은 `⛔ "○월 ○일 기준" 작성일 못박기 금지
 * (실시간 기준). 날짜·연도는 자료에 있을 때만.` 이다.
 * ef6ad3e8 에서 base R0-13 을 같은 이유로 지웠는데 여기에 같은 위반이 남아 있었다.
 */
describe('geo-overlay — base F1을 위배하지 않는다', () => {
  const geo = readFileSync(new URL('../prompts/seo/geo-overlay.prompt', import.meta.url), 'utf8');

  it('하드코딩된 작성 시점을 모범 예시로 제시하지 않는다', () => {
    expect(geo).not.toMatch(/✅[^\n]*"현재\(\d{4}년/);
    expect(geo).not.toMatch(/✅[^\n]*"이번 달/);
    expect(geo).not.toMatch(/✅[^\n]*"지금 시점/);
  });

  it('시점 표현을 자료 근거 조건부로 지시한다', () => {
    expect(geo).toMatch(/자료에 (?:날짜가 없으면|있을 때만|적혀 있으면)/);
  });

  it('base F1을 명시적으로 인용한다', () => {
    // 오버레이가 상위 규칙을 알고 있다는 것을 파일 안에서 확인할 수 있어야 한다.
    expect(geo).toMatch(/\bF1\b/);
  });
});
