// src/renderer/modules/agentModelSelect.ts
// [2026-09-10] 에이전트 안에서 쓸 모델을 드롭다운으로 고른다.
//
// 사장님 지적: "코덱스는 5.6 sol 아스트라 등등 있고 클로드코드도 페이블 오푸스5 소넷이
// 있고 안티그래비티도 3.8플래쉬 이런 식으로 모델이 있잖아. 얘네들도 환경설정에서 선택이
// 가능하게 해줘야지."
//
// 목록은 전부 CLI 에서 실측한 값이다(agentModelPolicy.AGENT_MODEL_PRESETS 주석 참조).
// 다만 목록이 울타리가 되면 안 된다 — 벤더가 새 모델을 내면 앱 업데이트를 기다려야 하므로,
// "직접 입력" 을 남겨 둔다. 저장되는 값은 언제나 모델 이름 문자열 하나다.

import { AGENT_MODEL_PRESETS, AGENT_MODEL_CUSTOM } from '../../runtime/agentModelPolicy.js';

const AGENT_MODEL_FIELDS = [
  { provider: 'agent-codex', selectId: 'agent-codex-model-select', inputId: 'agent-codex-model' },
  { provider: 'agent-claude', selectId: 'agent-claude-model-select', inputId: 'agent-claude-model' },
  { provider: 'agent-gemini', selectId: 'agent-gemini-model-select', inputId: 'agent-gemini-model' },
] as const;

function agentModelEl<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

/** 드롭다운을 채운다. 저장된 값이 목록에 없으면 "직접 입력" 으로 열어 보여 준다. */
function fillAgentModelSelect(selectId: string, inputId: string, provider: string): void {
  const select = agentModelEl<HTMLSelectElement>(selectId);
  const input = agentModelEl<HTMLInputElement>(inputId);
  if (!select || !input) return;

  const presets = AGENT_MODEL_PRESETS[provider] ?? [];
  const saved = input.value.trim();

  select.innerHTML = [
    '<option value="">CLI 기본 모델 (선택 안 함)</option>',
    ...presets.map((m) => `<option value="${m.value}">${m.label}</option>`),
    `<option value="${AGENT_MODEL_CUSTOM}">✏️ 직접 입력…</option>`,
  ].join('');

  const known = presets.some((m) => m.value === saved);
  if (saved && !known) {
    select.value = AGENT_MODEL_CUSTOM;
    input.style.display = '';
  } else {
    select.value = saved;
    input.style.display = 'none';
  }
}

/**
 * 드롭다운 선택을 숨은 입력칸(저장 대상)에 반영한다.
 *
 * 저장은 예전처럼 input 값 하나만 본다(priceInfoModal). 드롭다운을 새로 얹었다고
 * 저장 경로를 두 갈래로 만들면 어느 쪽이 이기는지가 흐려진다 — 입력칸이 정본이다.
 */
function bindAgentModelSelect(selectId: string, inputId: string): void {
  const select = agentModelEl<HTMLSelectElement>(selectId);
  const input = agentModelEl<HTMLInputElement>(inputId);
  if (!select || !input) return;

  select.addEventListener('change', () => {
    if (select.value === AGENT_MODEL_CUSTOM) {
      input.style.display = '';
      input.focus();
      return;
    }
    input.style.display = 'none';
    input.value = select.value;
  });
}

/** 설정 화면이 값을 채운 뒤 부른다 — 저장된 모델을 드롭다운에 비춘다. */
export function syncAgentModelSelects(): void {
  for (const field of AGENT_MODEL_FIELDS) {
    fillAgentModelSelect(field.selectId, field.inputId, field.provider);
  }
}

export function initAgentModelSelects(): void {
  for (const field of AGENT_MODEL_FIELDS) {
    const select = agentModelEl(field.selectId);
    if (!select || (select as any).__bound) continue;
    (select as any).__bound = true;
    bindAgentModelSelect(field.selectId, field.inputId);
  }
  syncAgentModelSelects();
}
