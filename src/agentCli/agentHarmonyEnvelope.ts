// Agent harmony envelope (Release C1, 2026-11-04) — a homefeed-only alternative to wrapAsAgenticTask.
//
// Why: the title review, the repair passes and the quality gates run as separate calls AFTER the article. Their
// criteria are invisible to the writer, and the writer's own instructions conflict silently. The harmony session
// brings those criteria into the ONE agent call: analyse -> strategy -> title candidates -> pick -> write ->
// self-critique as a distrustful reviewer -> find conflicting instructions -> revise -> one JSON object.
//
// C1 is observe-only and default OFF (source.agentHarmony). The base prompt is preserved verbatim at the end, so a
// run with the flag off sends exactly what it sends today (selectAgentTaskPrompt without `harmony` IS the old call).
// The title-review criteria are the outer review's own texts, imported — never retyped.
import { wrapAsAgenticTask } from './agenticEnvelope.js';
import { DAILY_TITLE_EVIDENCE_SUBMISSION, DAILY_TITLE_POLICY } from '../main/services/dailyPublishingTitleReview.js';
import {
  buildAppCriteriaBlock, buildLadderBlock, buildMeasuredNote, buildOutputContract, payoffWindowSentence,
} from './agentHarmonyCriteria.js';

export interface AgentHarmonyContext { readonly mode: 'homefeed' }

function buildSteps(): string {
  return `[조화 절차] — 아래는 머릿속/작업공간에서 수행하세요. 중간 산출물(분석표, 후보 목록, 채점표, 메모)은 제출하지 마세요.
1. 자료 분석: [작업 명세]의 자료를 읽고 ① 중심 사건을 한 줄로, ② 자료에 그대로 적힌 확인된 사실(숫자·날짜·이름·인용은 원문 표기 그대로), ③ 자료에 없는 것(독자가 궁금해해도 자료가 답하지 않는 것)을 가른다.
2. 독자·노출 전략: 이 글이 닿을 독자 상황 하나와 그 독자의 질문 하나를 정한다. [작업 명세]에 [검증된 노출 성공 제목] 또는 [이 블로그의 실제 성과 관측] 블록이 이미 있으면 질문의 유형을 참고만 한다 — 제목·문장을 베끼지 않고 효과를 약속하지 않는다. 그런 블록이 없으면 "관측 자료 없음"이라고 적고 넘어간다.
3. 제목 후보: 서로 다른 독자 질문을 가진 제목 후보 5~8개를 만든다. 후보마다 제목의 모든 숫자·인용·단위가 들어 있는 자료 원문 문장(sourceAnchors)과, 그 질문에 답할 본문 문장(bodyAnchors)을 정한다. 근거 문장을 못 찾은 후보는 버린다.
4. 비교·선정: 남은 후보를 아래 [독립 제목 검수 기준]으로 비교해 하나를 고른다. 탈락한 차점 후보의 가장 큰 약점을 한 문장으로 적어 둔다. 점수·등급·퍼센트로 매기지 않는다.
5. 본문 작성: 고른 제목의 약속을 본문이 그대로 갚는다. ${payoffWindowSentence()}
6. 자기비평: 아래 [앱 검사 기준]으로 글을 읽는다. 작성자를 믿지 않는 검수자처럼 읽는다 — 자기 글이라고 봐주지 않는다.
7. 지시 점검: [작업 명세] 안에서 서로 충돌하거나, 빠졌거나, 이 자료에 맞지 않는 지시를 찾는다. 찾으면 [우선순위 사다리]로 해결하고 complementReport 에 기록한다. 없으면 items 를 빈 배열로 둔다.
8. 수정·제출: 비평과 점검에서 나온 문제를 고친다. 3~7단계 점검을 모두 통과할 때까지 반복한 뒤 최종 JSON 하나만 제출한다. 고칠 때 자료에 없는 사실을 새로 넣지 않는다 — 근거가 없으면 빼거나 범위를 좁힌다.`;
}

function buildHeader(): string {
  return [
    `당신은 네이버 블로그 홈피드 글을 쓰는 자율 에이전트입니다.
아래 [작업 명세]를 한 번에 받아쓰지 말고, [조화 절차]를 스스로 끝까지 수행한 뒤 최종 결과만 제출하세요.
[작업 명세]는 앱이 만든 원문 그대로이며 목표·자료·금지사항·평가 기준·JSON 스키마가 모두 들어 있습니다.`,
    buildSteps(),
    buildLadderBlock(),
    `[독립 제목 검수 기준 — 앱의 별도 제목 검수 단계가 쓰는 원문 그대로다. 마지막 줄의 "JSON"은 이 작업에서는 [작업 명세] 안의 자료 구간을 뜻한다]
${DAILY_TITLE_POLICY}
${DAILY_TITLE_EVIDENCE_SUBMISSION}`,
    buildAppCriteriaBlock(),
    buildMeasuredNote(),
    buildOutputContract(),
    '────────────────────────────\n[작업 명세]\n',
  ].join('\n\n');
}

/**
 * Wrap a homefeed prompt as a harmony session. The base prompt is appended verbatim. Any other mode falls back to the
 * plain agentic envelope — the harmony procedure is written for homefeed only.
 */
export function wrapAsHarmonyTask(basePrompt: string, ctx: AgentHarmonyContext): string {
  if (typeof basePrompt !== 'string' || !basePrompt.trim()) return basePrompt;
  if (ctx?.mode !== 'homefeed') return wrapAsAgenticTask(basePrompt, (ctx as { mode?: string } | undefined)?.mode);
  return `${buildHeader()}${basePrompt}`;
}

export interface AgentTaskPromptOptions {
  readonly mode?: string;
  /** Judge / eval calls: send the prompt as-is. */
  readonly raw?: boolean;
  /** false: the prompt is already complete (V3). */
  readonly agenticEnvelope?: boolean;
  readonly harmony?: AgentHarmonyContext;
}

/**
 * The one place that decides which envelope callAgent sends. Without `harmony` this is exactly the previous
 * behaviour: raw / agenticEnvelope:false -> untouched, otherwise wrapAsAgenticTask(prompt, mode).
 */
export function selectAgentTaskPrompt(prompt: string, options: AgentTaskPromptOptions = {}): string {
  if (options.raw || options.agenticEnvelope === false) return prompt;
  return options.harmony ? wrapAsHarmonyTask(prompt, options.harmony) : wrapAsAgenticTask(prompt, options.mode);
}
