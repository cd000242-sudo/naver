import { isAgentTextProvider, resolveTextModelProfile } from '../runtime/modelRegistry.js';

/**
 * Reconciles the renderer's provider label with the model the config actually selects.
 *
 * [2026-09-02 실측 4회] TEXT_MODEL_PROVIDER_MISMATCH: expected=claude, selected=openai-gpt41
 *
 * 부팅이 lastActiveUserId(낡은 계정)를 먼저 복원하고, 렌더러는 그 계정의 config 로
 * 라디오·hidden 을 그린다(settingsModal restoreTextModelRadio, priceInfoModal 초기 동기화).
 * 그 뒤 진짜 계정으로 바뀌어도 렌더러에 알리는 이벤트가 없어 화면은 옛 값을 든 채
 * generator='claude' 를 보내고, main 은 새 계정의 primaryGeminiTextModel(openai-gpt41)로
 * 모델을 고른다. 벤더가 어긋나 던진다. 같은 부류가 2026-06-30(에이전트) · 08-19(라디오
 * 복원)에 이어 세 번째다 — 화면의 이름표를 고치는 수정은 늘 한 곳을 남겼다.
 *
 * 그래서 이름표를 믿지 않는다. 어떤 모델이 돌지는 primaryGeminiTextModel 이 정한다
 * (그것이 SSOT 이고, 벤더 단언도 그 값으로 검사한다). provider 는 그 모델의 벤더여야만
 * 뜻이 있다. 둘이 어긋나면 모델은 그대로 두고 provider 를 모델 쪽으로 맞춘다.
 *
 * 이것은 자동 폴백이 아니다 — 사용자가 고른 모델이 그대로 돈다. 바뀌는 것은
 * 그 모델을 어느 엔진 코드가 호출하느냐는 라우팅 라벨뿐이다. 조용히 하지 않는다:
 * corrected=true 와 reason 을 돌려주고 호출자가 경고를 찍는다.
 *
 * 에이전트 provider(agent-*)는 손대지 않는다. 사용자가 명시로 고른 0과금 경로이고,
 * 그것을 API 로 바꾸면 2026-06-30 과금 사고가 돌아온다.
 */
export interface ProviderReconciliation {
  readonly provider: string;
  readonly corrected: boolean;
  readonly reason?: string;
}

const PLAIN_VENDORS = new Set(['gemini', 'openai', 'claude', 'perplexity']);

export function reconcileProviderWithModel(
  rendererProvider: string | undefined,
  primaryTextModel: string | undefined,
): ProviderReconciliation {
  const provider = String(rendererProvider || '').trim();
  const model = String(primaryTextModel || '').trim();

  // 렌더러가 아무것도 안 보냈거나 에이전트 경로면 그대로 — 판단할 근거가 없거나 손대면 안 되는 자리다.
  if (!provider || isAgentTextProvider(provider)) return { provider, corrected: false };
  // 이름표가 알려진 API 벤더가 아니면(커스텀 등) 건드리지 않는다.
  if (!PLAIN_VENDORS.has(provider)) return { provider, corrected: false };
  if (!model) return { provider, corrected: false };

  let modelVendor: string;
  try {
    modelVendor = resolveTextModelProfile(model).vendor;
  } catch {
    // 모델을 못 풀면 벤더 단언이 뒤에서 제 몫을 한다. 여기서 추측하지 않는다.
    return { provider, corrected: false };
  }
  if (modelVendor === 'agent') return { provider, corrected: false };
  if (modelVendor === provider) return { provider, corrected: false };

  return {
    provider: modelVendor,
    corrected: true,
    reason: `렌더러 엔진 라벨 '${provider}' 이 선택된 모델 '${model}'(${modelVendor})와 어긋남 — 모델은 그대로 두고 라벨을 ${modelVendor} 로 맞춤`,
  };
}
