// Agent harmony envelope (Release C1, 2026-11-04; extended to every text mode the same day) — an alternative to wrapAsAgenticTask.
//
// Why: the title review, the repair passes and the quality gates run as separate calls AFTER the article. Their
// criteria are invisible to the writer, and the writer's own instructions conflict silently. The harmony session
// brings those criteria into the ONE agent call: analyse -> strategy -> title candidates -> pick -> write ->
// self-critique as a distrustful reviewer -> find conflicting instructions -> revise -> one JSON object.
//
// C1 is observe-only and default OFF (source.agentHarmony). The base prompt is preserved verbatim at the end, so a
// run with the flag off sends exactly what it sends today (selectAgentTaskPrompt without `harmony` IS the old call).
// The homefeed wording below is locked by a byte-for-byte fixture test; the other modes share the same contract (steps,
// ladder, packet / report, final JSON) and add only their own criteria (agentHarmonyModeCriteria.ts).
// The homefeed title-review criteria are the outer review's own texts, imported — never retyped.
import { wrapAsAgenticTask } from './agenticEnvelope.js';
import { DAILY_TITLE_EVIDENCE_SUBMISSION, DAILY_TITLE_POLICY } from '../main/services/dailyPublishingTitleReview.js';
import { isHarmonyMode, type HarmonyMode } from '../content/agentHarmony/harmonyModes.js';
import {
  buildAppCriteriaBlock, buildLadderBlock, buildMeasuredNote, buildOutputContract, payoffWindowSentence,
} from './agentHarmonyCriteria.js';
import {
  buildIntro, buildModeAppCriteriaBlock, buildModeBlocks, buildTitleComparisonBlock, ladderVariantFor, packetHintsFor,
  stepPartsFor, type StepParts,
} from './agentHarmonyModeCriteria.js';

export interface AgentHarmonyContext { readonly mode: HarmonyMode }

function homefeedStepParts(): StepParts {
  return {
    central: '중심 사건',
    reader: '이 글이 닿을 독자 상황 하나와 그 독자의 질문 하나를 정한다.',
    titleBlockName: '독립 제목 검수 기준',
    confirmedNote: '',
    payoff: payoffWindowSentence(),
    critique: '[앱 검사 기준]',
  };
}

function buildSteps(parts: StepParts): string {
  return `[조화 절차] — 아래는 머릿속/작업공간에서 수행하세요. 중간 산출물(분석표, 후보 목록, 채점표, 메모)은 제출하지 마세요.
1. 자료 분석: [작업 명세]의 자료를 읽고 ① ${parts.central}을 한 줄로, ② 자료에 그대로 적힌 확인된 사실(숫자·날짜·이름·인용은 원문 표기 그대로), ③ 자료에 없는 것(독자가 궁금해해도 자료가 답하지 않는 것)을 가른다.
2. 독자·노출 전략: ${parts.reader} [작업 명세]에 [검증된 노출 성공 제목] 또는 [이 블로그의 실제 성과 관측] 블록이 이미 있으면 질문의 유형을 참고만 한다 — 제목·문장을 베끼지 않고 효과를 약속하지 않는다. 그런 블록이 없으면 "관측 자료 없음"이라고 적고 넘어간다.
3. 제목 후보: 서로 다른 독자 질문을 가진 제목 후보 3~5개를 만든다. 후보마다 제목의 모든 숫자·인용·단위가 들어 있는 자료 원문 문장(sourceAnchors)과, 그 질문에 답할 본문 문장(bodyAnchors)을 정한다. 근거 문장을 못 찾은 후보는 버린다.
4. 비교·선정: 남은 후보를 아래 [${parts.titleBlockName}]으로 비교해 하나를 고른다. 탈락한 차점 후보의 가장 큰 약점을 한 문장으로 적어 둔다. 점수·등급·퍼센트로 매기지 않는다.${parts.confirmedNote}
5. 본문 작성: 고른 제목의 약속을 본문이 그대로 갚는다. ${parts.payoff}
6. 자기비평: 아래 ${parts.critique}으로 글을 읽는다. 작성자를 믿지 않는 검수자처럼 읽는다 — 자기 글이라고 봐주지 않는다.
7. 지시 점검: [작업 명세] 안에서 서로 충돌하거나, 빠졌거나, 이 자료에 맞지 않는 지시를 찾는다. 찾으면 [우선순위 사다리]로 해결하고 complementReport 에 기록한다. 없으면 items 를 빈 배열로 둔다.
8. 수정·제출: 비평과 점검에서 나온 문제를 한 번 고친 뒤 최종 JSON 하나만 바로 제출한다. 처음부터 다시 쓰거나 3~7단계를 되풀이하지 않는다. 고칠 때 자료에 없는 사실을 새로 넣지 않는다 — 근거가 없으면 빼거나 범위를 좁힌다.`;
}

function homefeedTitleReviewBlock(): string {
  return `[독립 제목 검수 기준 — 앱의 별도 제목 검수 단계가 쓰는 원문 그대로다. 마지막 줄의 "JSON"은 이 작업에서는 [작업 명세] 안의 자료 구간을 뜻한다]
${DAILY_TITLE_POLICY}
${DAILY_TITLE_EVIDENCE_SUBMISSION}`;
}

function buildHeader(mode: HarmonyMode): string {
  const homefeed = mode === 'homefeed';
  return [
    buildIntro(mode),
    buildSteps(homefeed ? homefeedStepParts() : stepPartsFor(mode)),
    buildLadderBlock(ladderVariantFor(mode)),
    homefeed ? homefeedTitleReviewBlock() : buildTitleComparisonBlock(mode),
    homefeed ? buildAppCriteriaBlock() : buildModeAppCriteriaBlock(mode),
    // The 2026-09-11 heading-count observation was measured on exposure data, not on every mode: homefeed keeps it, others do not claim it.
    ...(homefeed ? [buildMeasuredNote()] : buildModeBlocks(mode)),
    buildOutputContract(packetHintsFor(mode)),
    '────────────────────────────\n[작업 명세]\n',
  ].join('\n\n');
}

/**
 * Wrap a prompt as a harmony session. The base prompt is appended verbatim. A mode without a session (photo, unknown,
 * missing) falls back to the plain agentic envelope.
 */
export function wrapAsHarmonyTask(basePrompt: string, ctx: AgentHarmonyContext): string {
  if (typeof basePrompt !== 'string' || !basePrompt.trim()) return basePrompt;
  const mode = (ctx as { mode?: unknown } | undefined)?.mode;
  if (!isHarmonyMode(mode)) return wrapAsAgenticTask(basePrompt, typeof mode === 'string' ? mode : undefined);
  return `${buildHeader(mode)}${basePrompt}`;
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
