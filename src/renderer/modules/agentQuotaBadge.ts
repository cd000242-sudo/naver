// src/renderer/modules/agentQuotaBadge.ts
// 요약 카드 줄에 에이전트 구독 잔여 배찌를 그린다.
//
// [2026-08-26 사장님 요청] "클로드코드/코덱스/안티그래비티 선택하면 지금 구독한
// 플랜으로 몇 개의 글 생성이 가능한지" 배찌로 보여 달라.
//
// 표시 규칙은 usageBadge 가 정한다(순수 함수). 여기서는 DOM 만 다룬다.
// 에이전트를 안 쓰는 엔진을 골랐을 때는 배찌를 통째로 숨긴다 — 관계없는 사람에게
// 카드를 하나 더 보여줄 이유가 없다.

import { buildAgentUsageBadge, type AgentUsageBadgeTone } from '../../agentCli/usageBadge.js';

const TONE_COLORS: Readonly<Record<AgentUsageBadgeTone, string>> = Object.freeze({
  idle: '#9ca3af',
  ok: '#15803d',
  warn: '#b45309',
  blocked: '#b91c1c',
});

/** 라디오 값('agent-codex')에서 공급자 코드('codex')를 뽑는다. 에이전트가 아니면 null. */
export function resolveSelectedAgentProvider(radioValue: string | null | undefined): string | null {
  const value = String(radioValue || '').trim();
  if (!value.startsWith('agent-')) return null;
  const provider = value.slice('agent-'.length);
  return provider === 'codex' || provider === 'claude' || provider === 'gemini' ? provider : null;
}

function readSelectedEngine(): string {
  const checked = document.querySelector<HTMLInputElement>(
    'input[name="primaryGeminiTextModel"]:checked',
  );
  return checked?.value || '';
}

/** 배찌를 현재 선택·사용량에 맞춰 다시 그린다. 실패해도 화면을 깨지 않는다. */
export async function refreshAgentQuotaBadge(): Promise<void> {
  const card = document.getElementById('agent-quota-badge');
  if (!card) return;

  const provider = resolveSelectedAgentProvider(readSelectedEngine());
  if (!provider) {
    card.style.display = 'none';
    return;
  }

  try {
    const api = (window as any).electronAPI;
    const res = await api?.agentUsage?.(provider);
    if (!res?.success || !res.usage) {
      card.style.display = 'none';
      return;
    }

    const badge = buildAgentUsageBadge({ provider, ...res.usage });
    const value = document.getElementById('agent-quota-badge-value');
    const detail = document.getElementById('agent-quota-badge-detail');
    if (value) {
      value.textContent = badge.headline;
      value.style.color = TONE_COLORS[badge.tone];
    }
    if (detail) detail.textContent = badge.detail;
    card.style.display = '';
  } catch {
    // 사용량 표시는 부가 정보다 — 조회가 실패해도 생성 흐름과 무관하다.
    card.style.display = 'none';
  }
}

let bound = false;

/** 엔진 선택이 바뀌거나 글이 생성될 때 배찌를 갱신하도록 묶는다. */
export function initAgentQuotaBadge(): void {
  if (bound) return;
  bound = true;
  document.addEventListener('change', (event) => {
    const target = event.target as HTMLInputElement | null;
    if (target?.name === 'primaryGeminiTextModel') void refreshAgentQuotaBadge();
  });
  void refreshAgentQuotaBadge();
}
