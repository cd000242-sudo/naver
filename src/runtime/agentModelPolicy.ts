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
  return model;
}
