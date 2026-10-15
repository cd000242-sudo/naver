// src/homefeedAutopilot/topicJudge.ts
// [2026-10-15] Picks today's homefeed topic from the scored shortlist and adopts it automatically.
//
// The LLM (Claude via the owner's org API credits) sees every signal for the top candidates
// and returns one pick, an angle and a home-style title. It may only pick from the shortlist —
// an index outside it, or an unparsable reply, falls back to the score #1 so a topic is always
// adopted. Facts come from the candidate data only; the prompt forbids inventing any.

import type { ScoredTopic } from './topicScoring.js';

export type JudgeCallModel = (prompt: string, options?: { maxTokens?: number; timeoutMs?: number }) => Promise<string>;

export interface TopicAlternative {
  readonly keyword: string;
  readonly reason: string;
}

export interface TopicDecision {
  readonly keyword: string;
  /** Suggested homefeed title; the generator may still refine it. */
  readonly homeTitle: string;
  /** The angle to write from — what this post adds that the benchmark posts do not. */
  readonly angle: string;
  readonly category: string;
  readonly score: number;
  readonly reasons: readonly string[];
  readonly mustInclude: readonly string[];
  readonly mustAvoid: readonly string[];
  readonly checkBefore: readonly string[];
  readonly sourceUrls: readonly string[];
  readonly alternatives: readonly TopicAlternative[];
  /** 'llm' when the model's pick was used, 'score' when the deterministic #1 was adopted. */
  readonly decidedBy: 'llm' | 'score';
}

export const JUDGE_SHORTLIST_SIZE = 8;

function list(values: readonly string[] | undefined, limit: number): string {
  const kept = (values ?? []).filter(Boolean).slice(0, limit);
  return kept.length ? kept.join(' / ') : '-';
}

function describe(topic: ScoredTopic, index: number): string {
  const c = topic.candidate;
  const b = topic.brief;
  const lines = [
    `[${index}] 키워드: ${topic.keyword} (점수 ${topic.score}, 분야 ${topic.category || '-'})`,
    `  근거: ${topic.reasons.join(' · ')}`,
  ];
  if (c) {
    lines.push(`  벤치마크 제목: ${c.title}`);
    lines.push(`  홈판 노출 제목 예: ${list(c.homeTitles, 3)}`);
    if (c.summary) lines.push(`  요약(사실 확인 전): ${c.summary.slice(0, 200)}`);
    if (c.guide?.direction) lines.push(`  작성 방향: ${c.guide.direction}`);
  }
  if (b?.primaryIntent) lines.push(`  독자 질문: ${b.primaryIntent}`);
  if (b?.differentiation) lines.push(`  차별 각도: ${b.differentiation}`);
  return lines.join('\n');
}

export function buildTopicJudgePrompt(shortlist: readonly ScoredTopic[], titleRules: readonly string[]): string {
  return [
    '너는 네이버 블로그 홈판(홈피드) 편집장이다. 아래 후보 중 오늘 한 편만 쓴다면 무엇을 쓸지 고른다.',
    '목표: 홈판에 노출될 확률이 가장 높고, 노출되면 트래픽(홈판 + 검색 유입)을 가장 많이 몰고 올 글감.',
    '',
    '판단 기준:',
    '1. 이미 여러 채널이 홈판에 올린 소재는 수요가 검증된 것이다. 다만 같은 각도를 반복하면 묻힌다 — 비어 있는 각도가 있는지 본다.',
    '2. 홈판은 몇 시간 단위로 식는다. 오래된 소재는 새 각도가 확실할 때만 고른다.',
    '3. 검색량이 함께 있는 소재는 홈판이 식은 뒤에도 검색으로 유입된다.',
    '4. 감점 사유(민감한 주장, 제목만 있는 소재 등)가 있는 후보는 근거가 확실할 때만 고른다.',
    '5. 후보에 없는 사실을 지어내지 않는다. 제목과 각도는 후보의 정보 안에서만 만든다.',
    '',
    '홈판 제목 규칙:',
    ...(titleRules.length ? titleRules.map((rule) => `- ${rule}`) : ['- 36~49자, 구체적인 숫자나 반응 한 마디로 시작']),
    '',
    '후보:',
    ...shortlist.map((topic, index) => describe(topic, index)),
    '',
    '아래 JSON 한 개만 출력한다. 설명 문장, 코드 블록 표시 없이.',
    '{"pick": 후보 번호, "homeTitle": "홈판 제목", "angle": "이 글만의 각도 한두 문장",',
    ' "reasons": ["고른 이유 최대 3개"], "alternatives": [{"pick": 후보 번호, "reason": "차선 이유"}]}',
  ].join('\n');
}

function extractJson(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function str(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function validIndex(value: unknown, size: number): number | null {
  const index = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(index) && index >= 0 && index < size ? index : null;
}

export interface ParsedJudgeReply {
  readonly pick: number;
  readonly homeTitle: string;
  readonly angle: string;
  readonly reasons: readonly string[];
  readonly alternatives: ReadonlyArray<{ readonly pick: number; readonly reason: string }>;
}

/** Null when the reply has no JSON or picks outside the shortlist. */
export function parseTopicJudgeReply(raw: string, shortlistSize: number): ParsedJudgeReply | null {
  const json = extractJson(raw);
  if (!json) return null;
  const pick = validIndex(json.pick, shortlistSize);
  if (pick === null) return null;
  const reasons = Array.isArray(json.reasons) ? json.reasons.map((r) => str(r, 200)).filter(Boolean).slice(0, 3) : [];
  const alternatives = (Array.isArray(json.alternatives) ? json.alternatives : []).flatMap((entry) => {
    const row = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
    const index = validIndex(row.pick, shortlistSize);
    return index === null || index === pick ? [] : [{ pick: index, reason: str(row.reason, 200) }];
  }).slice(0, 2);
  return { pick, homeTitle: str(json.homeTitle, 80), angle: str(json.angle, 400), reasons, alternatives };
}

function fallbackAngle(topic: ScoredTopic): string {
  return topic.candidate?.guide?.direction || topic.brief?.differentiation || topic.brief?.primaryIntent || '';
}

function toDecision(
  shortlist: readonly ScoredTopic[],
  reply: ParsedJudgeReply | null,
): TopicDecision {
  const pick = reply?.pick ?? 0;
  const topic = shortlist[pick];
  const guide = topic.candidate?.guide;
  const alternatives = reply
    ? reply.alternatives.map((alt) => ({ keyword: shortlist[alt.pick].keyword, reason: alt.reason }))
    : shortlist.slice(1, 3).map((alt) => ({ keyword: alt.keyword, reason: `점수 ${alt.score}` }));
  return {
    keyword: topic.keyword,
    homeTitle: reply?.homeTitle || topic.candidate?.homeTitles[0] || topic.title,
    angle: reply?.angle || fallbackAngle(topic),
    category: topic.category,
    score: topic.score,
    reasons: reply?.reasons.length ? [...reply.reasons, ...topic.reasons] : topic.reasons,
    mustInclude: guide?.mustInclude ?? [],
    mustAvoid: guide?.mustAvoid ?? [],
    checkBefore: guide?.checkBefore ?? [],
    sourceUrls: topic.candidate?.sourceUrls ?? [],
    alternatives,
    decidedBy: reply ? 'llm' : 'score',
  };
}

/**
 * Returns the adopted topic, or null when there is nothing to choose from.
 * Without `callModel`, or when the model call fails, the score #1 is adopted.
 */
export async function judgeHomefeedTopic(
  scored: readonly ScoredTopic[],
  titleRules: readonly string[],
  callModel?: JudgeCallModel,
): Promise<{ decision: TopicDecision | null; warning?: string }> {
  const shortlist = scored.slice(0, JUDGE_SHORTLIST_SIZE);
  if (shortlist.length === 0) return { decision: null };
  if (!callModel) {
    return { decision: toDecision(shortlist, null), warning: 'Claude API 키가 없어 점수 1순위로 채택했습니다.' };
  }
  try {
    const raw = await callModel(buildTopicJudgePrompt(shortlist, titleRules), { maxTokens: 1500 });
    const reply = parseTopicJudgeReply(raw, shortlist.length);
    if (!reply) return { decision: toDecision(shortlist, null), warning: 'Claude 응답을 해석하지 못해 점수 1순위로 채택했습니다.' };
    return { decision: toDecision(shortlist, reply) };
  } catch (error) {
    const message = (error as Error)?.message ?? '알 수 없는 오류';
    return { decision: toDecision(shortlist, null), warning: `Claude 호출 실패(${message}) — 점수 1순위로 채택했습니다.` };
  }
}
