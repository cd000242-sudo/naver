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
    // [2026-08-26] agentUsage 는 window.api 에 있다(preload:103 브리지).
    //   electronAPI(preload:1296)에는 없어서 처음엔 조용히 실패하고 배찌가 숨었다.
    //   조회 실패 시 카드를 숨기는 설계라 화면에는 아무 흔적도 남지 않았다.
    const api = (window as any).api;
    const res = await api?.agentUsage?.(provider);
    if (!res?.success || !res.usage) {
      // 조용히 숨기면 "배찌가 왜 안 보이지"로 끝난다 — 이유를 남긴다.
      console.warn('[AgentQuotaBadge] 사용량 조회 실패 — 배찌 숨김', res?.message ?? '(응답 없음)');
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
  } catch (err) {
    // 사용량 표시는 부가 정보다 — 조회가 실패해도 생성 흐름과 무관하다.
    // 다만 원인을 남긴다. 조용한 숨김이 이 기능의 첫 버그였다.
    console.warn('[AgentQuotaBadge] 배찌 갱신 실패:', (err as Error)?.message ?? err);
    card.style.display = 'none';
  }
}

/**
 * 배찌를 눌러 플랜 한도를 입력받는다.
 *
 * [2026-08-26 사장님 지적] "몇 회 사용 가능 이게 나와야지 사용횟수만 보여주면 어쩌냐."
 * 맞는 지적인데, 구독 CLI 에는 잔여 조회 명령이 없고(claude --help 실측: agents/auth/
 * doctor/gateway/import/install/mcp/plugin/project — usage·limit·quota 없음),
 * 플랜 이름으로 편수를 환산할 공개 근거도 없다. 없는 숫자를 지어 띄웠다가 그보다 일찍
 * 막히면 더 나쁘다. 그래서 한도는 사용자가 알려주고, 실제로 막히면 그 값으로 자동 교정한다.
 */
async function promptForLimit(provider: string): Promise<void> {
  const api = (window as any).api;
  const current = await api?.agentUsage?.(provider).catch(() => null);
  const now = Number(current?.usage?.manualLimit) || 0;
  const answer = window.prompt(
    '이 플랜으로 5시간 동안 글을 몇 편까지 뽑을 수 있나요?\n'
    + '(모르면 비워두세요. 실제로 한도에 막히면 그 값으로 자동 보정됩니다.)',
    now > 0 ? String(now) : '',
  );
  if (answer === null) return;
  const value = Math.floor(Number(String(answer).trim()) || 0);
  if (String(answer).trim() !== '' && (!Number.isFinite(value) || value < 0)) {
    window.alert('숫자를 입력해주세요.');
    return;
  }
  const res = await api?.agentSetUsageLimit?.(provider, value);
  if (res && res.success === false) {
    window.alert(res.message || '한도 저장에 실패했습니다.');
    return;
  }
  await refreshAgentQuotaBadge();
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
  const card = document.getElementById('agent-quota-badge');
  if (card) {
    card.style.cursor = 'pointer';
    card.title = '눌러서 플랜 한도(5시간당 글 수)를 입력';
    card.addEventListener('click', () => {
      const provider = resolveSelectedAgentProvider(readSelectedEngine());
      if (provider) void promptForLimit(provider);
    });
  }
  void refreshAgentQuotaBadge();
}
