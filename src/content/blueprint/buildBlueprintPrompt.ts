/**
 * SPEC-BLUEPRINT-2026 — prompt for the 설계도 call. Pure function; no network.
 *
 * The prompt is deliberately short. It asks for ingredients, not prose, and it insists that every
 * quote and snippet be copied verbatim from the material — the parser drops anything that is not.
 */
import { BLUEPRINT_LIMITS } from './blueprintSchema';

export interface BlueprintPromptInput {
  readonly keyword: string;
  /** 'homefeed' | 'seo' | 'custom' | 'mate' | 'business' — affects the reader-situation framing only. */
  readonly mode: string;
  readonly material: string;
  /** Optional cap on how much material to include (chars). */
  readonly materialMaxChars?: number;
}

const DEFAULT_MATERIAL_MAX_CHARS = 30_000;

function modeFraming(mode: string): string {
  if (mode === 'homefeed') {
    return '독자는 검색하지 않고 피드에서 이 글을 만난다. readerSituation 은 그 사람이 지금 겪고 있는 장면(헷갈리는 것, 막힌 것, 결정 못 한 것)이어야 한다.';
  }
  return '독자는 이 키워드를 검색해서 들어온다. readerSituation 은 그 검색을 하게 만든 상황(무엇을 몰라서, 무엇을 정하려고)이어야 한다.';
}

export function buildBlueprintPrompt(input: BlueprintPromptInput): string {
  const keyword = String(input.keyword || '').trim();
  const max = Math.max(1_000, Math.floor(input.materialMaxChars ?? DEFAULT_MATERIAL_MAX_CHARS));
  const material = String(input.material || '').slice(0, max);
  const L = BLUEPRINT_LIMITS;
  return [
    `아래 [자료]를 읽고, 키워드 "${keyword}" 로 쓸 블로그 글의 설계도를 JSON 하나로만 출력한다. 설명·마크다운·코드펜스 금지.`,
    '',
    '[규칙]',
    `- angle: 이 글이 답할 질문 하나(${L.angleMaxChars}자 이내). 키워드를 검색한 사람이 실제로 묻는 것.`,
    `- readerSituation: 독자의 구체 상황 1문장(${L.readerSituationMaxChars}자 이내). ${modeFraming(input.mode)}`,
    `- quotes: 자료 안에 있는 당사자 발언을 최대 ${L.quotesMax}개. text 는 자료 원문을 한 글자도 바꾸지 않고 그대로 옮긴다(따옴표는 뺀다). speaker 는 자료가 밝힌 발언자, 없으면 빈 문자열. 발언이 없으면 빈 배열.`,
    `- facts: 이 글에 쓸 핵심 사실 최대 ${L.factsMax}개. claim 은 짧게 정리한 사실, snippet 은 그 사실이 적힌 자료 원문 발췌(${L.snippetMinChars}~${L.snippetMaxChars}자, 그대로 복사). 수치·날짜·금액은 snippet 에 있는 것만.`,
    `- skeleton: 소제목 후보 ${L.skeletonMin}~${L.skeletonMax}개(각 ${L.headingMaxChars}자 이내, 명사구 또는 짧은 질문형). 서로 다른 질의 축(정의·조건·절차·비용·비교·예외·확인처)을 하나씩 맡는다.`,
    `- offTopic: 자료에 있지만 이 키워드의 질문과 무관해 본문에서 빼야 할 주제를 최대 ${L.offTopicMax}개(각 한 줄). 없으면 빈 배열.`,
    '- 자료에 없는 사실·수치·발언을 만들지 않는다. 모르면 비운다.',
    '',
    '[출력 형식]',
    '{"angle":"…","readerSituation":"…","quotes":[{"text":"…","speaker":"…"}],"facts":[{"claim":"…","snippet":"…"}],"skeleton":["…"],"offTopic":["…"]}',
    '',
    '[자료]',
    material,
  ].join('\n');
}
