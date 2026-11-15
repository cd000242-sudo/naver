// src/crawler/issueHarness/visionEngineError.ts
//
// [2026-11-15] The picture check ("vision gate") runs on the engine the owner chose. When that engine cannot run at
// all (subscription usage limit, logged out, quota gone, key refused) every further call fails the same way, so the
// collection stops at the first such failure and says why. It never switches to another way of judging (no silent
// fallback) and it never reports "no matching photo" for a check that did not happen.
//
// Anything else (timeout, overloaded server, empty answer, plain per-minute 429) stays a one-batch rejection.

import type { IssueVisionRoute, VisionJudgeVendor } from './visionRoute.js';

export type VisionEngineProblem = 'rate_limit' | 'login';
type RouteInfo = Pick<IssueVisionRoute, 'vendor' | 'label'>;

export class VisionEngineUnavailableError extends Error {
  readonly reason: VisionEngineProblem;
  readonly engineLabel: string;
  readonly vendor: VisionJudgeVendor;

  constructor(reason: VisionEngineProblem, route: RouteInfo, message: string) {
    super(message);
    this.name = 'VisionEngineUnavailableError';
    this.reason = reason;
    this.engineLabel = route.label;
    this.vendor = route.vendor;
  }
}

export function isVisionEngineUnavailableError(error: unknown): error is VisionEngineUnavailableError {
  return error instanceof VisionEngineUnavailableError
    || (error instanceof Error && error.name === 'VisionEngineUnavailableError');
}

/** Stable code plus the reason and vendor, so the screen can open its "how to check instead" window. */
export const VISION_ENGINE_UNAVAILABLE_CODE = 'VISION_ENGINE_UNAVAILABLE';
export function buildVisionUnavailableFields(error: VisionEngineUnavailableError): {
  code: typeof VISION_ENGINE_UNAVAILABLE_CODE; visionUnavailable: { reason: VisionEngineProblem; vendor: VisionJudgeVendor };
} {
  return { code: VISION_ENGINE_UNAVAILABLE_CODE, visionUnavailable: { reason: error.reason, vendor: error.vendor } };
}

/** User-facing Korean text. Subscription engines suggest the other subscription; API engines point to settings. */
export function buildVisionEngineUnavailableMessage(route: RouteInfo, reason: VisionEngineProblem): string {
  if (route.vendor === 'agent-claude' || route.vendor === 'agent-codex') {
    const mine = route.vendor === 'agent-claude' ? 'Claude' : 'Codex';
    const other = route.vendor === 'agent-claude' ? 'Codex' : 'Claude';
    const head = reason === 'rate_limit'
      ? `${mine} 구독 사용 한도가 소진돼 사진 검사를 못 했어요. 한도가 풀린 뒤 다시 하거나,`
      : `${mine} 구독 로그인이 풀려 사진 검사를 못 했어요. 다시 로그인한 뒤 하거나,`;
    return `${head} 글 엔진을 ${other} 구독으로 바꾸면 바로 검사할 수 있어요.`;
  }
  const head = reason === 'rate_limit'
    ? `${route.label} 사용 한도가 소진돼 사진 검사를 못 했어요.`
    : `${route.label} 키 인증이 거절돼 사진 검사를 못 했어요.`;
  return `${head} 설정에서 엔진을 확인해 주세요.`;
}

/** Subscription CLI failures carry a stable code (agentCli/types.ts) — the cleanest signal there is. */
function classifyAgentError(error: unknown): VisionEngineProblem | null {
  const err = error as { name?: unknown; code?: unknown } | null;
  if (!err || err.name !== 'AgentCliError') return null;
  if (err.code === 'rate_limited') return 'rate_limit';
  // subscription_inactive: the login exists but is not a usable paid subscription — same remedy as a lost login.
  if (err.code === 'not_logged_in' || err.code === 'subscription_inactive') return 'login';
  return null;
}

/** HTTP status from the judge's own message ("OpenAI vision 401: …") or the Gemini SDK ("[403 Forbidden] …"). */
function httpStatusOf(error: unknown, text: string): number | null {
  const direct = Number((error as { status?: unknown } | null)?.status);
  if (Number.isInteger(direct) && direct >= 100) return direct;
  const matched = text.match(/\bvision (\d{3}):/) || text.match(/\[(\d{3}) [A-Za-z ]+\]/);
  return matched ? Number(matched[1]) : null;
}

const QUOTA_GONE = /insufficient_quota|exceeded your current quota|credit balance is too low|quota exceeded|billing (hard )?limit/i;
const KEY_REFUSED = /invalid[_ ]api[_ ]key|api key not valid|invalid x-api-key|authentication_error|\bUNAUTHENTICATED\b|\bPERMISSION_DENIED\b/i;

/** Quota gone or key refused → stop. A plain per-minute 429 or a 5xx is transient and is NOT matched here. */
function classifyApiError(error: unknown): VisionEngineProblem | null {
  const text = String((error as { message?: unknown } | null)?.message ?? error ?? '');
  if (QUOTA_GONE.test(text)) return 'rate_limit';
  const status = httpStatusOf(error, text);
  if (status === 401 || status === 403 || KEY_REFUSED.test(text)) return 'login';
  return null;
}

/**
 * Decides whether a failed judge call means "the engine cannot check photos right now".
 * Returns the typed error to throw, or null when the failure is an ordinary one-batch problem.
 */
export function classifyVisionEngineFailure(error: unknown, route: RouteInfo): VisionEngineUnavailableError | null {
  const subscription = route.vendor === 'agent-claude' || route.vendor === 'agent-codex';
  const reason = subscription ? classifyAgentError(error) : classifyApiError(error);
  return reason ? new VisionEngineUnavailableError(reason, route, buildVisionEngineUnavailableMessage(route, reason)) : null;
}
