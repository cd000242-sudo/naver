// src/agentCli/usageBadge.ts
// 에이전트 구독 사용량 배찌 문구. 순수 함수 — 렌더러와 메인 양쪽에서 쓴다.
//
// [2026-08-26 사장님 요청] "클로드코드/코덱스/안티그래비티 선택하면 지금 구독한
// 플랜으로 몇 개의 글 생성이 가능한지 알려줄 순 없니? 배찌를 하나 만들어서."
//
// 구독 CLI는 남은 양을 알려주는 명령이 없다(v2.11.135 실측 — claude 의
// .credentials.json 은 subscriptionType/rateLimitTier 만 들고 있다). 그래서 배찌는
// 두 가지만 말한다.
//   1. 실측 — 이 앱이 이번 창에서 몇 편 뽑았는가
//   2. 추정 — 예전에 막혔던 지점(관측 한도)까지 몇 편 남았는가
//
// 추정은 한 번이라도 막혀 봤을 때만 나온다. 근거 없이 "N편 가능"이라고 띄웠다가
// 실제로는 몇 편에서 막히면 그게 더 나쁘다("추정/예상 결과 금지" 원칙).
// 관측이 없으면 "아직 한도에 안 닿음"이라고만 쓴다.

export interface AgentUsageBadgeInput {
  readonly provider: string;
  readonly callsInWindow: number;
  readonly observedLimit?: number;
  readonly estimatedRemaining?: number;
  readonly windowOpensAt?: number;
  readonly rateLimitResetAt?: number;
  readonly rateLimitedAt?: number;
  /** CLI 로그인에서 확인한 구독 유형(claude: max/pro …). */
  readonly plan?: string;
  /** 사용자가 직접 알려준 한도(5시간 창당 글 수). */
  readonly manualLimit?: number;
}

export type AgentUsageBadgeTone = 'idle' | 'ok' | 'warn' | 'blocked';

export interface AgentUsageBadge {
  /** 배찌에 크게 보일 한 마디. */
  readonly headline: string;
  /** 그 아래 작게 붙는 근거. */
  readonly detail: string;
  readonly tone: AgentUsageBadgeTone;
}

const PROVIDER_LABELS: Readonly<Record<string, string>> = Object.freeze({
  claude: '클로드코드',
  codex: '코덱스',
  gemini: '안티그래비티',
});

export function agentProviderLabel(provider: string): string {
  return PROVIDER_LABELS[String(provider || '').trim()] || String(provider || '에이전트');
}

const PLAN_LABELS: Readonly<Record<string, string>> = Object.freeze({
  max: 'Max',
  pro: 'Pro',
  team: 'Team',
  enterprise: 'Enterprise',
  free: 'Free',
});

/**
 * 플랜 이름을 사람이 읽는 형태로. 모르는 값은 그대로 보여준다 — 숨기면 사용자가
 * 자기 플랜을 확인할 방법이 없어진다.
 *
 * [2026-08-26] 플랜은 표시만 한다. "이 플랜은 글 몇 편"이라는 값은 어디에도 공개돼
 * 있지 않고(공개된 것은 "5시간당 메시지 N개" 류다), 글 한 편이 몇 메시지를 쓰는지는
 * 글마다 다르다. 편수는 실제로 막혀 본 지점(observedLimit)으로만 말한다.
 */
export function agentPlanLabel(plan: string | undefined): string {
  const raw = String(plan || '').trim();
  if (!raw) return '';
  return PLAN_LABELS[raw.toLowerCase()] || raw;
}

/** "클로드코드 Max" 처럼 공급자 + 플랜. 플랜을 모르면 공급자만. */
function providerWithPlan(provider: string, plan: string | undefined): string {
  const label = agentProviderLabel(provider);
  const planLabel = agentPlanLabel(plan);
  return planLabel ? `${label} ${planLabel}` : label;
}

/** 남은 시간을 "1시간 20분" 꼴로. 1분 미만은 "곧". */
export function formatRemainingTime(untilMs: number, now: number): string {
  const diff = untilMs - now;
  if (!Number.isFinite(diff) || diff <= 60_000) return '곧';
  const totalMinutes = Math.round(diff / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}분`;
  if (minutes === 0) return `${hours}시간`;
  return `${hours}시간 ${minutes}분`;
}

export function buildAgentUsageBadge(
  input: AgentUsageBadgeInput,
  now: number = Date.now(),
): AgentUsageBadge {
  const label = providerWithPlan(input.provider, input.plan);
  const used = Math.max(0, Math.round(Number(input.callsInWindow) || 0));

  // 1. 지금 막혀 있는 경우 — 추정할 것이 없다. 언제 풀리는지만 말한다.
  const resetAt = Number(input.rateLimitResetAt) || 0;
  const blocked = resetAt > now;
  if (blocked) {
    return {
      headline: `${label} 한도 도달`,
      detail: `${formatRemainingTime(resetAt, now)} 뒤 다시 사용할 수 있습니다 (CLI가 알려준 시각)`,
      tone: 'blocked',
    };
  }

  // 2. 한도를 아는 경우 — "쓴 편수 / 한도" 를 그대로 보여준다.
  //    실측(막혀 본 값)이 사용자가 알려준 값보다 세다.
  const observedLimit = Number(input.observedLimit) || 0;
  const manualLimit = Number(input.manualLimit) || 0;
  const limit = observedLimit > 0 ? observedLimit : manualLimit;
  if (limit > 0) {
    const remaining = Math.max(0, limit - used);
    const basis = observedLimit > 0 ? '실측 한도' : '입력한 한도';
    const windowNote = input.windowOpensAt && input.windowOpensAt > now
      ? ` · ${formatRemainingTime(input.windowOpensAt, now)} 뒤 한 편 분량 회복`
      : '';
    if (remaining <= 0) {
      return {
        headline: `${label} ${used}/${limit}편 — 여유 없음`,
        detail: `${basis} ${limit}편을 다 썼습니다${windowNote}`,
        tone: 'warn',
      };
    }
    return {
      headline: `${label} ${used}/${limit}편 · ${remaining}편 가능`,
      detail: `${basis} 기준${windowNote}`,
      tone: remaining <= 2 ? 'warn' : 'ok',
    };
  }

  // 3. 한도를 모르는 경우 — 지어내지 않는다. 대신 알려 달라고 한다.
  //    구독 CLI 에는 잔여 조회 명령이 없고(claude --help 실측), 플랜 이름으로 편수를
  //    환산할 공개 근거도 없다. 없는 숫자를 띄웠다가 그보다 일찍 막히는 쪽이 더 나쁘다.
  return {
    headline: `${label} ${used}편 사용`,
    detail: '배찌를 눌러 플랜 한도(5시간당 글 수)를 알려주시면 남은 편수를 계산합니다',
    tone: used === 0 ? 'idle' : 'ok',
  };
}
