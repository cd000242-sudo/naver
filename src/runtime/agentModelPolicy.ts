// src/runtime/agentModelPolicy.ts
// [2026-09-10] 에이전트(구독 CLI) 안에서 어느 모델로 돌릴지 정하는 순수 정책.
//
// 사장님 지적: "에이전트 고르고 나서 에이전트 속 에이전트 모델은 왜 안 뜨니."
// 배선이 절반만 있었다 — 세 러너 모두 모델 플래그를 받을 준비가 돼 있는데
// (codex `-m`, claude `--model`, agy `--model`) 아무도 채우지 않았다.
// 그래서 각 CLI 기본 모델로만 돌았고, 어떤 모델로 쓰는지 알 방법도 없었다.
//
// 설계 원칙 하나: **모델 이름을 앱이 지어내지 않는다.**
// 벤더가 모델을 갈아치울 때마다 앱을 고쳐야 하는 구조를 만들지 않는다. 사용자가 CLI 에서
// 쓰는 이름을 그대로 적어 넘긴다. 비워 두면 종전대로 CLI 기본 모델이다(회귀 없음).

import type { AgentTextProvider } from './modelRegistry.js';

/** 설정 키 — UI·저장 허용 목록·이 파일이 같은 이름을 써야 한다. */
export const AGENT_MODEL_CONFIG_KEYS = [
  'agentCodexModel',
  'agentClaudeModel',
  'agentGeminiModel',
] as const;

const PROVIDER_TO_KEY: Readonly<Record<string, (typeof AGENT_MODEL_CONFIG_KEYS)[number]>> = Object.freeze({
  'agent-codex': 'agentCodexModel',
  'agent-claude': 'agentClaudeModel',
  'agent-gemini': 'agentGeminiModel',
});

/*
 * 모델 이름에 공백이나 대시로 시작하는 값이 섞이면 CLI 인자가 깨진다 —
 * "--dangerously-skip-permissions" 같은 값이 모델 자리로 들어가면 전혀 다른 명령이 된다.
 * 벤더 모델 ID 는 전부 [영문/숫자/./-/_/:] 범위이므로 그 밖은 받지 않는다.
 */
const SAFE_MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

/*
 * [2026-11-07] agy(안티그래비티)가 더 이상 내놓지 않는 이름 -> 가장 가까운 새 이름.
 * `agy models` 실측에서 3.7/3.6 Flash, 3.1 Pro, Claude 4.6 이 사라졌다. 저장돼 있던 값을 그대로 넘기면 CLI 가
 * "모르는 모델" 로 거부하므로 실행 직전에 옮긴다. 단계(low/medium/high)는 그대로 가져간다.
 * 정규식 표는 식별자를 하나만 쓴다 — 렌더러 인라인 번들(copy-static)에서 이름이 겹치면 안 된다.
 */
const RETIRED_AGY_MODEL_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^gemini-3\.[67]-flash-(low|medium|high)$/, 'gemini-3.8-flash-$1'],
  [/^gemini-3\.1-pro-(low|medium|high)$/, 'gemini-4-argon-$1'],
  [/^claude-opus-4-6-thinking$/, 'claude-opus-5-5-high'],
  [/^claude-sonnet-4-6$/, 'claude-sonnet-5-5-high'],
];

/** 저장된 에이전트 모델이 agy 에서 사라진 이름이면 새 이름으로, 아니면 그대로(다른 에이전트 값은 건드리지 않는다). */
export function migrateRetiredAgentModelId(provider: AgentTextProvider | string, model: string): string {
  if (provider !== 'agent-gemini') return model;
  for (const [pattern, replacement] of RETIRED_AGY_MODEL_RULES) {
    if (pattern.test(model)) return model.replace(pattern, replacement);
  }
  return model;
}

/**
 * 고른 에이전트에 설정된 모델 이름. 없거나 안전하지 않으면 undefined —
 * 그때는 CLI 기본 모델로 간다(막지 않는다).
 */
export function resolveAgentModel(
  provider: AgentTextProvider | string,
  config: Record<string, unknown> | null | undefined,
): string | undefined {
  const key = PROVIDER_TO_KEY[String(provider ?? '')];
  if (!key || !config) return undefined;

  const raw = config[key];
  if (typeof raw !== 'string') return undefined;
  const model = raw.trim();
  if (!model || !SAFE_MODEL_ID.test(model)) return undefined;
  return migrateRetiredAgentModelId(provider, model);
}

/**
 * 에이전트별 모델 후보. 전부 CLI/공식 문서에서 확인한 값이다(2026-09-10 최초, 2026-11-07 갱신).
 *   claude --help  → "an alias for the latest model (e.g. 'fable', 'opus', or 'sonnet')
 *                     or a model's full name (e.g. 'claude-fable-5')"
 *                    별칭은 opus→Opus 5.5, sonnet→Sonnet 5.5, haiku→Haiku 5.5, fable→Fable 5.1
 *   agy models     → 2026-11-07 실측: gemini-4-argon-*, gemini-3.8-flash-*, claude-opus-5-5-*,
 *                    claude-sonnet-5-5-*, gpt-oss-120b-medium (low/medium/high 는 목록 그대로)
 *   codex          → 2026-11-07 구독 모델 목록 (gpt-5.5 는 10/14 은퇴)
 *
 * 목록에 없는 모델은 화면의 "직접 입력" 으로 넣는다 — 벤더가 새 모델을 내면 앱 업데이트를
 * 기다리지 않아도 되게 한다. 이 목록은 편의이지 울타리가 아니다.
 */
export const AGENT_MODEL_PRESETS: Readonly<Record<string, ReadonlyArray<{ value: string; label: string }>>> = Object.freeze({
  'agent-codex': [
    { value: 'gpt-6.1-sol', label: 'GPT-6.1 솔 (최신·고품질)' },
    { value: 'gpt-6-astra', label: 'GPT-6 아스트라 (최상위)' },
    { value: 'gpt-6.1-terra', label: 'GPT-6.1 테라 (균형)' },
    { value: 'gpt-6-sol', label: 'GPT-6 솔 (이전 세대)' },
    { value: 'gpt-6-luna', label: 'GPT-6 루나 (경량·저비용)' },
    { value: 'gpt-5.6-sol', label: 'GPT-5.6 솔' },
    { value: 'gpt-5.6-terra', label: 'GPT-5.6 테라' },
    { value: 'gpt-5.6-luna', label: 'GPT-5.6 루나' },
  ],
  'agent-claude': [
    { value: 'fable', label: '페이블 5.1 (최상위 별칭)' },
    { value: 'opus', label: '오푸스 5.5 (별칭)' },
    { value: 'sonnet', label: '소넷 5.5 (별칭)' },
    { value: 'haiku', label: '하이쿠 5.5 (가장 빠름·별칭)' },
    { value: 'claude-fable-5-1', label: 'claude-fable-5-1 (버전 고정)' },
    { value: 'claude-opus-5-5', label: 'claude-opus-5-5 (버전 고정)' },
    { value: 'claude-sonnet-5-5', label: 'claude-sonnet-5-5 (버전 고정)' },
    { value: 'claude-haiku-5-5', label: 'claude-haiku-5-5 (버전 고정)' },
  ],
  'agent-gemini': [
    { value: 'gemini-4-argon-high', label: 'Gemini 4 Argon (High · 최상위·비용 큼)' },
    { value: 'gemini-4-argon-medium', label: 'Gemini 4 Argon (Medium)' },
    { value: 'gemini-4-argon-low', label: 'Gemini 4 Argon (Low)' },
    { value: 'gemini-3.8-flash-high', label: 'Gemini 3.8 Flash (High · 최신)' },
    { value: 'gemini-3.8-flash-medium', label: 'Gemini 3.8 Flash (Medium)' },
    { value: 'gemini-3.8-flash-low', label: 'Gemini 3.8 Flash (Low)' },
    { value: 'claude-opus-5-5-high', label: 'Claude Opus 5.5 (High)' },
    { value: 'claude-opus-5-5-medium', label: 'Claude Opus 5.5 (Medium)' },
    { value: 'claude-opus-5-5-low', label: 'Claude Opus 5.5 (Low)' },
    { value: 'claude-sonnet-5-5-high', label: 'Claude Sonnet 5.5 (High)' },
    { value: 'claude-sonnet-5-5-medium', label: 'Claude Sonnet 5.5 (Medium)' },
    { value: 'claude-sonnet-5-5-low', label: 'Claude Sonnet 5.5 (Low)' },
    { value: 'gpt-oss-120b-medium', label: 'GPT-OSS 120B (Medium)' },
  ],
});

/** 화면에서 "직접 입력" 을 고른 상태를 나타내는 값. 설정에는 저장되지 않는다. */
export const AGENT_MODEL_CUSTOM = '__custom__';

/*
 * CLI 가 "이 모델 모른다" 고 말하는 문구들. 벤더마다 표현이 다르므로 실측 문구를 담는다.
 * 확신할 수 있을 때만 단정한다 — 애매하면 원문을 그대로 보여 주는 편이 낫다.
 */
const UNKNOWN_MODEL_HINT = /unknown model|invalid model|model not found|unsupported model|no such model|모델.*(없|찾을 수 없|지원하지 않)|지원하지 않는 모델/i;

/**
 * 에이전트 실패 메시지에 "어느 모델로 시도했는지" 를 붙인다.
 *
 * [2026-09-10 심층 점검] 모델 선택을 붙이면서 새 실패 유형이 생겼다. CLI 는 모르는 모델
 * 이름을 거부하는데, classifyExit(parse.ts:109)에는 모델 분류가 없어 nonzero_exit 로
 * 떨어진다 — 사용자는 "codex가 오류를 반환했습니다" 만 보고 자기가 고른 모델 때문인지
 * 알 수 없다. 원인을 아는데 안 알려주면 앱 버그로 읽힌다.
 *
 * 모델을 안 골랐으면 원문 그대로 돌려준다 — 없는 원인을 지어내지 않는다.
 */
export function describeAgentModelFailure(model: string | undefined, rawMessage: string): string {
  const raw = String(rawMessage ?? '');
  const name = String(model ?? '').trim();
  if (!name) return raw;

  if (UNKNOWN_MODEL_HINT.test(raw)) {
    return `${raw}

🧠 모델 이름 "${name}" 을 CLI 가 알지 못합니다. 환경설정 > AI 텍스트 엔진에서 다른 모델을 고르거나 비워 두세요(비우면 CLI 기본 모델).`;
  }
  return `${raw}

(에이전트 모델 "${name}" 로 시도했습니다. 이 모델을 처음 쓰신 거라면 이름이 맞는지 확인해 주세요.)`;
}
