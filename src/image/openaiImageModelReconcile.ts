/**
 * Reconciles the OpenAI image model the screen carries with the one the current account's config holds.
 *
 * [2026-09-02 세 번째] "gpt-image-2 를 골랐는데 2 를 선택하라고 한다."
 *
 * 저장값이 두 계정으로 갈려 있었다.
 *   settings_acct1.json   openaiImageModel = gpt-image-1.5   ← 부팅이 lastActiveUserId 로 먼저 복원하는 낡은 계정
 *   settings_b52d….json   openaiImageModel = gpt-image-2     ← 진짜 계정. 사장님이 고른 값은 제대로 저장돼 있었다
 * imageManagementTab 은 초기 복원 때 그 순간 로드된(낡은) 계정의 값을 localStorage 에 도장 찍고,
 * costAndAutoGen 은 localStorage 를 먼저 읽는다. fullAutoFlow 는 부팅 때 그려진 formData 를 읽는다.
 * 2026-08-25 · 09-01 두 수정은 "비어 있으면 config 로" 였다 — 오늘 값은 비어 있지 않고 틀렸다.
 * P1(텍스트 모델 라벨, reconcileProviderWithModel) 과 같은 부류이고 같은 실수다: 빈 값만 막았다.
 *
 * 그래서 화면·localStorage·formData 를 믿지 않는다. 지금 이 순간 읽은 config 가 SSOT 다.
 * config 가 비어 있을 때만 화면값을 쓰고, 둘 다 비면 빈 값을 돌려 검사가 "선택되지 않음" 을
 * 말하게 둔다 — 기본값을 지어내지 않는다. 어긋나 맞췄으면 corrected=true 와 reason 을 돌려주고
 * 호출자가 경고를 찍는다. 조용히 하지 않는다.
 */
export interface OpenaiImageModelReconciliation {
  readonly model: string;
  readonly corrected: boolean;
  readonly reason?: string;
}

export function reconcileOpenaiImageModelSelection(
  screenModel: unknown,
  configModel: unknown,
): OpenaiImageModelReconciliation {
  const screen = String(screenModel ?? '').trim();
  const config = String(configModel ?? '').trim();

  if (!config) return { model: screen, corrected: false };
  if (!screen || screen === config) return { model: config, corrected: false };

  return {
    model: config,
    corrected: true,
    reason: `화면/저장소가 든 OpenAI 이미지 모델 '${screen}' 이 현재 계정 설정 '${config}' 와 어긋남 — 설정값으로 맞춤`,
  };
}
