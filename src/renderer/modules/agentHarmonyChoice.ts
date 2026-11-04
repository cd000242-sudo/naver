// src/renderer/modules/agentHarmonyChoice.ts
// [2026-11-04] 에이전트 글 검수 방식 선택 (환경설정 → 글생성 엔진, 에이전트 카드 아래).
//
// 사장님: "조화모드를 모든 사용자 기본값으로 해주고 둘다 가능하게 해줘 지금 방법을 선택형으로 바꿔줘".
//   조화 모드(기본)  에이전트가 한 세션에서 제목 후보 비교 · 앱 기준 자기 점검까지 하고, 끝에 독립 검수 1번.
//   기존 검수 방식   제목 후보 캐기 · 토너먼트 · 비평을 따로 돌리고, 다른 제목이 이기면 글 전체를 다시 쓴다.
// 저장값은 config.agentHarmonyMode 하나(boolean). 키가 없으면 조화 모드다(harmonyRuntime.resolveAgentHarmonyFlag).
// NOTE: inline bundle = single scope. Every top-level identifier is prefixed agentHarmonyChoice*.

const agentHarmonyChoiceRadioName = 'agentHarmonyChoice';

function agentHarmonyChoiceRadios(): HTMLInputElement[] {
  return [...document.querySelectorAll<HTMLInputElement>(`input[name="${agentHarmonyChoiceRadioName}"]`)];
}

/** Checks the radio for the saved value. Only an explicit false means the classic review; anything else is harmony. */
export function agentHarmonyChoiceLoad(config: { readonly agentHarmonyMode?: unknown } | null | undefined): void {
  const harmony = config?.agentHarmonyMode !== false;
  for (const radio of agentHarmonyChoiceRadios()) {
    radio.checked = (radio.value === 'harmony') === harmony;
  }
}

/** Value to save: true = harmony, false = classic review, undefined = the choice is not on screen (save nothing). */
export function agentHarmonyChoiceValue(): boolean | undefined {
  const checked = agentHarmonyChoiceRadios().find((radio) => radio.checked);
  return checked ? checked.value === 'harmony' : undefined;
}
