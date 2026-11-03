// src/crawler/issueHarness/planStage.ts
// The "read the article, make the search queries" stage of the collector, split out of harness.ts
// (which sits at the 300-line limit). The model is the one the owner chose (options.planCaller).
// When it cannot answer the run still goes on with heading text — but never silently:
// the progress modal, the caller's log and the stats all say so.

import { buildIssueQueryPlan } from './queryFanout.js';
import type { IssueCollectPayload, IssueHarnessOptions, IssueQueryPlan } from './types.js';

const LOG = '[IssueHarness]';
export const PLAN_FALLBACK_NOTICE = '⚠️ 본문 분석 실패 — 소제목 글자로 검색합니다';

export function formatPlanFallbackNotice(reason: string | undefined): string {
  const why = String(reason || '').replace(/\s+/g, ' ').trim().slice(0, 140);
  return why ? `${PLAN_FALLBACK_NOTICE} (${why})` : PLAN_FALLBACK_NOTICE;
}

export async function runPlanStage(
  payload: IssueCollectPayload,
  options: IssueHarnessOptions,
  emit: (percent: number, message: string) => void,
): Promise<IssueQueryPlan> {
  emit(3, '🧠 AI가 제목·서론·본문 전체와 소제목을 읽고 사건 맥락을 파악하는 중...');
  const plan = await buildIssueQueryPlan(payload.title, payload.headings, options.planCaller, payload.intro, payload.articleBody);
  if (plan.aiGenerated) {
    emit(8, `🧠 사건 파악: ${plan.mainSubject}${plan.programName ? ` · ${plan.programName}` : ''}${plan.contextSummary ? ` — ${plan.contextSummary.slice(0, 60)}` : ''}`);
  } else {
    const notice = formatPlanFallbackNotice(plan.fallbackReason);
    emit(8, notice);
    console.warn(`${LOG} ${notice}`);
    try { options.log?.(notice); } catch { /* the caller's log is display only */ }
  }
  console.log(`${LOG} 🚀 수집 시작: ${plan.querySets.length}개 소제목, AI플랜=${plan.aiGenerated}, 주체="${plan.mainSubject}"`);
  return plan;
}
