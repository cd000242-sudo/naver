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

/**
 * 에이전트별 모델 후보. **전부 CLI 에서 실측한 값이다**(2026-09-10).
 *   claude --help  → "an alias for the latest model (e.g. 'fable', 'opus', or 'sonnet')
 *                     or a model's full name (e.g. 'claude-fable-5')"
 *   agy models     → gemini-3.8-flash-high … 목록 그대로
 *   codex          → ~/.codex/config.toml 의 model 값(gpt-6-astra) + textModelConstants 의 5.6 계열
 *
 * 목록에 없는 모델은 화면의 "직접 입력" 으로 넣는다 — 벤더가 새 모델을 내면 앱 업데이트를
 * 기다리지 않아도 되게 한다. 이 목록은 편의이지 울타리가 아니다.
 */
export const AGENT_MODEL_PRESETS: Readonly<Record<string, ReadonlyArray<{ value: string; label: string }>>> = Object.freeze({
  'agent-codex': [
    { value: 'gpt-6-astra', label: 'GPT-6 아스트라 (최신)' },
    { value: 'gpt-5.6-sol', label: 'GPT-5.6 솔 (고품질)' },
    { value: 'gpt-5.6-terra', label: 'GPT-5.6 테라 (균형)' },
    { value: 'gpt-5.6-luna', label: 'GPT-5.6 루나 (경량·저비용)' },
  ],
  'agent-claude': [
    { value: 'fable', label: '페이블 (최신 별칭)' },
    { value: 'opus', label: '오푸스 (최신 별칭)' },
    { value: 'sonnet', label: '소넷 (최신 별칭)' },
    { value: 'claude-fable-5', label: 'claude-fable-5 (버전 고정)' },
    { value: 'claude-opus-5', label: 'claude-opus-5 (버전 고정)' },
    { value: 'claude-sonnet-5', label: 'claude-sonnet-5 (버전 고정)' },
    { value: 'claude-haiku-4-5-20251001', label: 'claude-haiku-4.5 (가장 빠름)' },
  ],
  'agent-gemini': [
    { value: 'gemini-3.8-flash-high', label: 'Gemini 3.8 Flash (High · 최신)' },
    { value: 'gemini-3.8-flash-medium', label: 'Gemini 3.8 Flash (Medium)' },
    { value: 'gemini-3.8-flash-low', label: 'Gemini 3.8 Flash (Low)' },
    { value: 'gemini-3.7-flash-high', label: 'Gemini 3.7 Flash (High)' },
    { value: 'gemini-3.6-flash-high', label: 'Gemini 3.6 Flash (High)' },
    { value: 'gemini-3.1-pro-high', label: 'Gemini 3.1 Pro (High)' },
    { value: 'claude-opus-4-6-thinking', label: 'Claude Opus 4.6 (Thinking)' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Thinking)' },
    { value: 'gpt-oss-120b-medium', label: 'GPT-OSS 120B (Medium)' },
  ],
});

/** 화면에서 "직접 입력" 을 고른 상태를 나타내는 값. 설정에는 저장되지 않는다. */
export const AGENT_MODEL_CUSTOM = '__custom__';
