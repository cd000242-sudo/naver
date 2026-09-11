/**
 * SPEC-BLUEPRINT-2026 — turn a verified 설계도 into the material block the body prompt consumes.
 *
 * The block is *material*, not rules: verbatim quotes to use, facts with their source excerpts,
 * the reader's situation for the first sentence, heading candidates, and subjects to keep out.
 * Rendering is deterministic so the prompt cache prefix stays stable across retries.
 */
import type { Blueprint } from './blueprintSchema';

export interface RenderBlueprintOptions {
  /** Minimum number of quotes the body should carry (only asked when the blueprint has that many). */
  readonly quoteFloor?: number;
}

function renderQuotes(blueprint: Blueprint, floor: number): string[] {
  if (blueprint.quotes.length === 0) return [];
  const ask = Math.min(floor, blueprint.quotes.length);
  return [
    `[당사자 발언 — 아래 중 최소 ${ask}개를 본문에 큰따옴표로 그대로 싣고, 발언자를 밝힌다. 글자를 바꾸지 않는다]`,
    ...blueprint.quotes.map((q, i) => `${i + 1}. "${q.text}"${q.speaker ? ` — ${q.speaker}` : ''}`),
  ];
}

function renderFacts(blueprint: Blueprint): string[] {
  if (blueprint.facts.length === 0) return [];
  return [
    '[핵심 사실 — 수치·날짜·금액은 여기 적힌 것만 쓴다. 근거 발췌를 벗어난 숫자를 만들지 않는다]',
    ...blueprint.facts.map((f, i) => `${i + 1}. ${f.claim} (근거: "${f.snippet}")`),
  ];
}

export function renderBlueprintMaterial(blueprint: Blueprint, options: RenderBlueprintOptions = {}): string {
  const floor = Math.max(1, Math.floor(options.quoteFloor ?? 2));
  const lines: string[] = [
    '[설계도 — 이 글은 아래 재료로 쓴다]',
    // Measured 09-04: replacing the 30-fact checklist with a 5~8-fact blueprint shortened bodies
    // (SEO 1,746 → 1,379 chars) and two posts fell under the length floor. The blueprint is a floor,
    // not a ceiling — the rest of the material stays in play, only the excluded subjects leave.
    '- 이 설계도는 최소선이다. 여기 적힌 것만 쓰고 끝내지 말고, 자료에 있는 다른 사실도 함께 담아 요청 분량을 채운다. 빼는 것은 아래에 제외 주제로 적은 것뿐이다.',
  ];
  if (blueprint.angle) lines.push(`- 이 글이 답할 질문: ${blueprint.angle}`);
  if (blueprint.readerSituation) {
    lines.push(`- 독자 상황(도입부 첫 문장은 이 장면에서 시작한다): ${blueprint.readerSituation}`);
  }
  if (blueprint.skeleton.length > 0) {
    lines.push(`- 소제목 후보(각각 다른 질문 축, 순서·표현은 다듬어도 된다): ${blueprint.skeleton.join(' / ')}`);
    /*
     * [2026-09-11] 소제목과 재료를 따로 넘기면 어느 칸이 어느 재료를 맡는지 아무도 정하지
     * 않는다. 재료를 못 받은 칸은 앞에서 한 말을 바꿔 말하는 감상으로 채워진다 — 발행글을
     * 읽어 보니 여섯 칸 중 가운데 두 칸이 그랬다. 중반에서 독자가 나가는 자리다.
     *
     * 그래서 배정을 계약으로 만든다. 그리고 빠져나갈 문을 같이 연다 — 재료가 모자라면
     * 지어내는 게 아니라 칸을 줄이는 것이 옳다. 문을 안 열면 하한이 환각을 부른다.
     */
    lines.push('- 소제목 배정: 각 소제목은 아래 사실·인용 중 **서로 다른 것을 최소 하나씩** 맡는다. 앞 소제목이 이미 쓴 사실을 다른 말로 다시 설명하지 않는다. 맡을 재료가 없는 소제목은 감상으로 채우지 말고 지운다 — 칸이 줄어도 된다.');
  }
  if (blueprint.offTopic.length > 0) {
    lines.push(`- 본문에서 뺄 주제(자료에 있어도 이 글의 질문이 아니다): ${blueprint.offTopic.join(' / ')}`);
  }
  const quotes = renderQuotes(blueprint, floor);
  const facts = renderFacts(blueprint);
  return [lines.join('\n'), quotes.join('\n'), facts.join('\n')].filter(Boolean).join('\n\n');
}

/**
 * 인용 하한이 조용히 꺼졌는지 알린다.
 *
 * renderQuotes 는 설계도가 발언을 하나도 못 찾으면 요구 자체를 내보내지 않는다. 그게 옳다 —
 * 없는 발언을 요구하면 지어낸다. 문제는 **아무도 모른다**는 것이다.
 *
 * 정답표 실측(2026-09-11): 직접 인용 수가 노출을 가른다. seo 노출 3.6개 vs 미노출 0.6개
 * (AUC 0.80), homefeed 3.0 vs 1.0 (AUC 0.81). 미노출군의 67%가 인용 0개였다.
 * 제휴는 역방향(0.25)이고 여행 사진 글은 인용이 구조적으로 없으므로 두 모드만 본다.
 *
 * 고칠 곳은 프롬프트가 아니라 재료다 — 발언이 없는 자료를 받아 왔다는 뜻이기 때문이다.
 */
const QUOTE_SIGNAL_MODES = new Set(['seo', 'homefeed']);

export function missingQuoteSignalWarning(mode: string, quoteCount: number): string | null {
  if (!QUOTE_SIGNAL_MODES.has(String(mode || '').trim())) return null;
  if (quoteCount > 0) return null;
  return '[Blueprint] ⚠️ 당사자 발언 0개 — 인용 하한이 요구 없이 꺼진 채 나간다.'
    + ' 실측상 인용은 이 모드에서 노출을 가르는 축이다(노출 평균 3.6개 vs 미노출 0.6개).'
    + ' 프롬프트가 아니라 자료 수집을 의심할 것.';
}
