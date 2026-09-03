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
  const lines: string[] = ['[설계도 — 이 글은 아래 재료로 쓴다]'];
  if (blueprint.angle) lines.push(`- 이 글이 답할 질문: ${blueprint.angle}`);
  if (blueprint.readerSituation) {
    lines.push(`- 독자 상황(도입부 첫 문장은 이 장면에서 시작한다): ${blueprint.readerSituation}`);
  }
  if (blueprint.skeleton.length > 0) {
    lines.push(`- 소제목 후보(각각 다른 질문 축, 순서·표현은 다듬어도 된다): ${blueprint.skeleton.join(' / ')}`);
  }
  if (blueprint.offTopic.length > 0) {
    lines.push(`- 본문에서 뺄 주제(자료에 있어도 이 글의 질문이 아니다): ${blueprint.offTopic.join(' / ')}`);
  }
  const quotes = renderQuotes(blueprint, floor);
  const facts = renderFacts(blueprint);
  return [lines.join('\n'), quotes.join('\n'), facts.join('\n')].filter(Boolean).join('\n\n');
}
