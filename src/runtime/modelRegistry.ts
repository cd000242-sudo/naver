// v2.7.45 — Model Registry SSOT (Single Source of Truth)
//
// debugger 진단(docs/diagnosis-2026-04-29/regression-summary.md):
//   "AI 모델 ID 분산 16회 fix" — Gemini/OpenAI/Claude/Imagen 모델 ID가 코드 곳곳 분산.
//   Anthropic/Google/OpenAI가 모델 deprecate 시 매번 여러 곳을 동시 수정해야 함.
//
// 본 모듈은 모든 검증된 모델 ID를 단일 지점에서 관리한다. 변경 시 여기서만 갱신.
// 호출자는 이 모듈에서 가져와 사용 (직접 문자열 리터럴 금지).

/**
 * 에이전트 모드 — 사용자 본인 PC의 codex/claude CLI를 본인 구독으로 호출하는 글생성 엔진.
 *   API 모델 ID가 아니라 글로벌 엔진 셀렉터(primaryGeminiTextModel)의 provider 값이다.
 *   'agent-codex' → ChatGPT 구독(codex), 'agent-claude' → Claude 구독(claude CLI).
 *   SSOT: 렌더러 매핑·메인 라우팅·콘텐츠 분기가 모두 이 목록/헬퍼를 참조한다.
 */
import {
  GEMINI_TEXT_MODELS,
  normalizeGeminiTextModelId,
} from './geminiTextModelNormalization.js';

export {
  GEMINI_TEXT_MODELS,
  normalizeGeminiTextModelId,
} from './geminiTextModelNormalization.js';

export const AGENT_TEXT_PROVIDERS = ['agent-codex', 'agent-claude'] as const;

export type AgentTextProvider = (typeof AGENT_TEXT_PROVIDERS)[number];

/** primaryGeminiTextModel/provider 값이 에이전트 모드인지 판별. */
export function isAgentTextProvider(value: unknown): value is AgentTextProvider {
  return value === 'agent-codex' || value === 'agent-claude';
}

/** 에이전트 provider 값 → agentCli 서비스 provider('codex'|'claude'). */
export function agentTextProviderToCli(value: AgentTextProvider): 'codex' | 'claude' {
  return value === 'agent-codex' ? 'codex' : 'claude';
}

/**
 * Anthropic Claude (2026-04 기준 검증)
 *   Source: docs.claude.com / console.anthropic.com models
 */
export const CLAUDE_MODELS = {
  /** Premium: most capable generally available Claude model. */
  FABLE: 'claude-fable-5',
  /** Legacy property retained so older call sites select the same premium tier. */
  OPUS: 'claude-fable-5',
  /** Balanced: latest speed/intelligence model. */
  SONNET: 'claude-sonnet-5',
  /** 가성비 — Haiku 4.5 (정식 ID, 날짜 suffix 포함) */
  HAIKU: 'claude-haiku-4-5-20251001',
} as const;

/**
 * Google Gemini Text (2026-04 기준 검증)
 *   Source: ai.google.dev/gemini-api/docs/models
 */
/**
 * Google Gemini Image (2026-07 공식 모델 문서 기준)
 *   Nano Banana 2/Pro의 preview ID는 2026-06-25 종료되었다.
 *   안정 ID를 기본으로 사용하고, 접근 불가 시 STANDARD로 안전 폴백한다.
 */
export const GEMINI_IMAGE_MODELS = {
  /** 나노바나나 (구버전) — 정식 GA, 모든 사용자 작동 (이미지 퀄 좋음, 한글 텍스트 약함) */
  STANDARD: 'gemini-2.5-flash-image',
  /** Value: latest stable Nano Banana image model. */
  NANO_BANANA_LITE: 'gemini-3.1-flash-lite-image',
  /** 나노바나나2 — Gemini 3.1 Flash Image (적정 가격, 한글 텍스트 가능) */
  NANO_BANANA_2: 'gemini-3.1-flash-image',
  /** 나노바나나 프로 — Gemini 3 Pro Image (최고 품질·한글 최강, 고가) */
  NANO_BANANA_PRO: 'gemini-3-pro-image',
} as const;

/**
 * Google Imagen (2026-04 기준 검증)
 */
export const IMAGEN_MODELS = {
  /** Imagen 4 (Tier 1+ 작동 확인) */
  V4: 'imagen-4.0-generate-001',
  /** Imagen 3.5 (ImageFX 내부) */
  V35_FX: 'imagen-3.5-imagefx',
} as const;

/**
 * OpenAI Image
 *   gpt-image-1.5: 균형형 (저비용). 사용자 메뉴 기본값.
 *   gpt-image-2: 고품질 (덕트테이프).
 *   dall-e-3: 2026-05-12 deprecation 예정 — 폴백 또는 비상용으로만.
 *   gpt-image-1: 호환용
 */
export const OPENAI_IMAGE_MODELS = {
  /** gpt-image-1.5 (균형형, 저비용, 사용자 메뉴 기본값) */
  GPT_IMAGE_1_5: 'gpt-image-1.5',
  /** gpt-image-2 (덕트테이프, 고품질) */
  GPT_IMAGE_2: 'gpt-image-2',
  /** gpt-image-1 (호환) */
  GPT_IMAGE_1: 'gpt-image-1',
  /** DALL-E 3 (2026-05-12 sunset 예정 — 폴백 전용) */
  DALL_E_3: 'dall-e-3',
} as const;

/**
 * OpenAI Text (gpt-4o/gpt-4o-mini는 2026-03-31 sunset → gpt-4.1 계열로 교체됨)
 */
export const OPENAI_TEXT_MODELS = {
  /** Value: current cost-sensitive GPT-5.6 model. */
  LUNA: 'gpt-5.6-luna',
  /** Balanced: current GPT-5.6 model. */
  TERRA: 'gpt-5.6-terra',
  /** Premium: current flagship GPT-5.6 model. */
  SOL: 'gpt-5.6-sol',
  /** Legacy properties retained for secondary call sites. */
  GPT_41: 'gpt-5.6-terra',
  GPT_41_MINI: 'gpt-5.6-luna',
} as const;

export type TextModelTier = 'value' | 'balanced' | 'premium';
export type ApiTextVendor = 'gemini' | 'openai' | 'claude' | 'perplexity' | 'agent';
export type OpenAiReasoningEffort = 'medium' | 'high';

export interface TextModelProfile {
  selector: string;
  vendor: ApiTextVendor;
  tier: TextModelTier;
  model: string;
  displayName: string;
  reasoningEffort?: OpenAiReasoningEffort;
}

/** Claude models with adaptive thinking reject legacy sampling controls. */
export function supportsClaudeTemperature(modelId: unknown): boolean {
  const model = String(modelId || '').trim().toLowerCase();
  if (/^claude-(?:fable|sonnet)-5(?:-|$)/.test(model)) return false;

  const claude4 = model.match(/^claude-(?:opus|sonnet)-4-(\d+)(?:-|$)/);
  if (claude4 && Number(claude4[1]) >= 7) return false;

  const laterMajor = model.match(/^claude-(?:opus|sonnet)-(\d+)(?:-|$)/);
  return !laterMajor || Number(laterMajor[1]) < 5;
}

const profile = (
  selector: string,
  vendor: ApiTextVendor,
  tier: TextModelTier,
  model: string,
  displayName: string,
  reasoningEffort?: OpenAiReasoningEffort,
): TextModelProfile => ({
  selector,
  vendor,
  tier,
  model,
  displayName,
  ...(reasoningEffort ? { reasoningEffort } : {}),
});

/** Resolve UI/config selectors to the one API model that is actually called. */
export function resolveTextModelProfile(value: unknown): TextModelProfile {
  const selector = String(value || '').trim();

  if (!selector) {
    return profile(selector, 'gemini', 'value', GEMINI_TEXT_MODELS.FLASH_LITE, 'Gemini 3.1 Flash-Lite');
  }

  if (selector === GEMINI_TEXT_MODELS.FLASH_LITE || selector === 'gemini-2.5-flash-lite') {
    return profile(selector, 'gemini', 'value', GEMINI_TEXT_MODELS.FLASH_LITE, 'Gemini 3.1 Flash-Lite');
  }
  if (selector.startsWith('gemini-')) {
    const model = normalizeGeminiTextModelId(selector);
    const tier: TextModelTier = model === GEMINI_TEXT_MODELS.FLASH_LITE
      ? 'value'
      : 'balanced';
    const displayName = tier === 'value'
      ? 'Gemini 3.1 Flash-Lite'
      : 'Gemini 3.5 Flash';
    return profile(selector, 'gemini', tier, model, displayName);
  }

  if (selector === 'openai-gpt4o-mini' || selector === 'openai-gpt56-luna' || selector === OPENAI_TEXT_MODELS.LUNA) {
    return profile(selector, 'openai', 'value', OPENAI_TEXT_MODELS.LUNA, 'GPT-5.6 Luna', 'medium');
  }
  if (selector === 'openai-gpt41' || selector === 'openai-gpt56-terra' || selector === OPENAI_TEXT_MODELS.TERRA) {
    return profile(selector, 'openai', 'balanced', OPENAI_TEXT_MODELS.TERRA, 'GPT-5.6 Terra', 'medium');
  }
  if (selector === 'openai-gpt4o' || selector === 'openai-gpt56-sol' || selector === OPENAI_TEXT_MODELS.SOL) {
    return profile(selector, 'openai', 'premium', OPENAI_TEXT_MODELS.SOL, 'GPT-5.6 Sol', 'medium');
  }
  if (selector === 'openai-gpt4o-search') {
    return profile(selector, 'openai', 'balanced', OPENAI_TEXT_MODELS.TERRA, 'GPT-5.6 Terra + Web Search', 'medium');
  }
  if (selector.startsWith('gpt-')) {
    const explicitModel = selector;
    const tier: TextModelTier = /(?:mini|nano|luna)/i.test(explicitModel) ? 'value' : 'balanced';
    return profile(selector, 'openai', tier, explicitModel, explicitModel, explicitModel.startsWith('gpt-5.6-') ? 'medium' : undefined);
  }
  if (selector.startsWith('openai-')) {
    throw new Error(`UNSUPPORTED_TEXT_MODEL_SELECTOR: ${selector}`);
  }

  if (selector === 'claude-haiku' || selector === CLAUDE_MODELS.HAIKU) {
    return profile(selector, 'claude', 'value', CLAUDE_MODELS.HAIKU, 'Claude Haiku 4.5');
  }
  if (selector === 'claude-opus' || selector === 'claude-fable' || selector === CLAUDE_MODELS.FABLE) {
    return profile(selector, 'claude', 'premium', CLAUDE_MODELS.FABLE, 'Claude Fable 5');
  }
  if (selector === 'claude-sonnet' || selector === CLAUDE_MODELS.SONNET) {
    return profile(selector, 'claude', 'balanced', CLAUDE_MODELS.SONNET, 'Claude Sonnet 5');
  }
  if (selector.startsWith('claude-')) {
    const tier: TextModelTier = /haiku/i.test(selector)
      ? 'value'
      : /(?:opus|fable)/i.test(selector) ? 'premium' : 'balanced';
    return profile(selector, 'claude', tier, selector, selector);
  }

  if (selector === 'perplexity-sonar') {
    return profile(selector, 'perplexity', 'balanced', 'sonar', 'Perplexity Sonar');
  }
  if (isAgentTextProvider(selector)) {
    return profile(selector, 'agent', 'premium', selector, selector === 'agent-codex' ? 'Codex Agent' : 'Claude Agent');
  }

  throw new Error(`UNSUPPORTED_TEXT_MODEL_SELECTOR: ${selector}`);
}

/** Resolve an intentional provider default, but never cross providers silently. */
export function resolveTextModelProfileForVendor(
  value: unknown,
  expectedVendor: ApiTextVendor,
  defaultSelector: string,
  explicitOverride?: unknown,
): TextModelProfile {
  const overrideSelector = String(explicitOverride || '').trim();
  const selector = overrideSelector || String(value || '').trim() || defaultSelector;
  const resolved = resolveTextModelProfile(selector);
  if (resolved.vendor !== expectedVendor) {
    throw new Error(
      `TEXT_MODEL_PROVIDER_MISMATCH: expected=${expectedVendor}, selected=${selector}, actual=${resolved.vendor}`,
    );
  }
  return resolved;
}

/**
 * ✅ [v2.7.62] Vision-capable 모델 (이미지 분석/관련성 평가용)
 *   reviewer 권고에 따라 SSOT에 추가 — 직접 문자열 리터럴 금지
 */
export const VISION_MODELS = {
  GEMINI_FLASH_LITE: GEMINI_TEXT_MODELS.FLASH_LITE,
  GEMINI_FLASH: GEMINI_TEXT_MODELS.FLASH,
  GEMINI_PRO: GEMINI_TEXT_MODELS.PRO,
  CLAUDE_SONNET: CLAUDE_MODELS.SONNET,
  OPENAI_41: OPENAI_TEXT_MODELS.TERRA,
  OPENAI_41_MINI: OPENAI_TEXT_MODELS.LUNA,
} as const;

/**
 * ✅ [v2.7.62] 글 생성 AI 키 → vision provider 라우팅
 *   사용자가 글 생성에 고른 AI와 동일 vendor로 이미지 추론 (사용자 요청)
 *   Perplexity는 vision 미지원 → Gemini Flash 폴백 (사용자 동의 필요)
 */
export type TextGeneratorKey =
  | 'gemini-3.1-flash-lite'
  | 'gemini-3.5-flash'
  | 'gemini-3.1-pro-preview'
  | 'gemini-2.5-flash-lite'
  | 'gemini-2.5-flash'
  | 'gemini-2.5-pro'
  | 'perplexity-sonar'
  | 'openai-gpt4o-mini'  // 레거시 키 — gpt-4.1-mini로 매핑
  | 'openai-gpt41'
  | 'claude-sonnet';

export type VisionProviderKey =
  | 'gemini-flash'
  | 'gemini-pro'
  | 'claude-sonnet'
  | 'openai-41'
  | 'openai-41-mini';

export interface VisionRouting {
  provider: VisionProviderKey;
  model: string;
  vendor: 'gemini' | 'claude' | 'openai';
  /** vision 미지원이라 폴백된 경우 */
  fellBack: boolean;
  reason?: string;
}

export function routeTextToVision(textKey: string): VisionRouting {
  switch (textKey) {
    case 'gemini-3.1-flash-lite':
      return { provider: 'gemini-flash', model: VISION_MODELS.GEMINI_FLASH_LITE, vendor: 'gemini', fellBack: false };
    case 'gemini-2.5-flash-lite':
      return { provider: 'gemini-flash', model: VISION_MODELS.GEMINI_FLASH, vendor: 'gemini', fellBack: true, reason: 'Lite는 vision 없음 → Flash로 자동' };
    case 'gemini-3.5-flash':
    case 'gemini-2.5-flash':
      return { provider: 'gemini-flash', model: VISION_MODELS.GEMINI_FLASH, vendor: 'gemini', fellBack: false };
    case 'gemini-3.1-pro-preview':
    case 'gemini-2.5-pro':
      return { provider: 'gemini-pro', model: VISION_MODELS.GEMINI_PRO, vendor: 'gemini', fellBack: false };
    case 'claude-sonnet':
      return { provider: 'claude-sonnet', model: VISION_MODELS.CLAUDE_SONNET, vendor: 'claude', fellBack: false };
    case 'claude-opus':
    case 'claude-haiku':
      // Opus/Haiku도 Anthropic vision 가능하나 어댑터는 Sonnet으로 추론 통일 (동일 vendor)
      return { provider: 'claude-sonnet', model: VISION_MODELS.CLAUDE_SONNET, vendor: 'claude', fellBack: false };
    case 'openai-gpt41':
      return { provider: 'openai-41', model: VISION_MODELS.OPENAI_41, vendor: 'openai', fellBack: false };
    case 'openai-gpt4o-mini':
      return { provider: 'openai-41-mini', model: VISION_MODELS.OPENAI_41_MINI, vendor: 'openai', fellBack: false };
    case 'openai-gpt4o':
    case 'openai-gpt4o-search':
      // 레거시 gpt-4o 계열 키 — vision은 현행 gpt-4.1로 추론 (동일 vendor)
      return { provider: 'openai-41', model: VISION_MODELS.OPENAI_41, vendor: 'openai', fellBack: false };
    case 'perplexity-sonar':
      return { provider: 'gemini-flash', model: VISION_MODELS.GEMINI_FLASH, vendor: 'gemini', fellBack: true, reason: 'Perplexity vision 미지원 → Gemini Flash 폴백' };
    default:
      return { provider: 'gemini-flash', model: VISION_MODELS.GEMINI_FLASH, vendor: 'gemini', fellBack: true, reason: `미지원 키(${textKey}) → Gemini Flash 기본` };
  }
}

/**
 * Gemini 사용자 UI 모델 키 → 실제 API ID 매핑 (나노바나나 3종 분리)
 *   nanoBananaProGenerator.ts의 MODEL_MAP과 동일 의미를 유지하는 레지스트리 SSOT.
 */
export const NANO_BANANA_USER_KEY_TO_MODEL: Record<string, { model: string; resolution: string }> = {
  'gemini-3-pro-4k': { model: GEMINI_IMAGE_MODELS.NANO_BANANA_PRO, resolution: '4K' },
  'gemini-3-pro': { model: GEMINI_IMAGE_MODELS.NANO_BANANA_PRO, resolution: '1K' },
  'gemini-3-1-flash': { model: GEMINI_IMAGE_MODELS.NANO_BANANA_2, resolution: '1K' },
  'gemini-2.5-flash': { model: GEMINI_IMAGE_MODELS.STANDARD, resolution: '1K' },
  'imagen-4': { model: IMAGEN_MODELS.V4, resolution: '1K' },
};

/**
 * 가짜/미존재 모델 ID 카탈로그 (코드에 잔존하면 회귀)
 *   회귀 가드 테스트가 이 배열을 사용해 코드에서 발견 시 fail.
 *   종료된 preview ID도 포함해 실제 API 호출로 되살아나지 않도록 차단한다.
 */
export const FAKE_MODEL_IDS_BANNED = [
  // Gemini 3 image preview IDs — 2026-06-25 shutdown
  'gemini-3.1-flash-image-preview',
  'gemini-3-pro-image-preview',
  // Previous image generations — shutdown and no longer callable
  'gemini-2.5-flash-image-preview',
  'gemini-2.0-flash-preview-image-generation',
  'gemini-2.0-flash-exp-image-generation',
  'imagen-4.0-generate-preview-06-06',
  'gemini-3-flash',
  // gpt-4o*는 2026-03-31 deprecate
  'gpt-4o',
  'gpt-4o-mini',
] as const;

/**
 * 검증된 이미지 생성 모델 ID 화이트리스트 (Google 공식 문서 확인, 2026-07)
 *   회귀 가드: UI 엔진이 라우팅하는 모델 ID는 반드시 이 목록에 속해야 한다.
 *   FAKE_MODEL_IDS_BANNED 제거로 사라질 뻔한 가드를 양성 화이트리스트로 대체·강화한다.
 */
export const VERIFIED_IMAGE_MODELS = [
  'gemini-2.5-flash-image',
  'gemini-3.1-flash-lite-image',
  'gemini-3.1-flash-image',
  'gemini-3-pro-image',
  'imagen-4.0-generate-001',
  'gpt-image-1.5',
  'gpt-image-2',
] as const;

/**
 * 사용자 UI provider value → 백엔드 정규화
 *   나노바나나 3종(nano-banana / nano-banana-2 / nano-banana-pro)은 각각 별개 모델이므로
 *   더 이상 통합하지 않는다. deepinfra 계열 별칭만 정규화한다.
 */
export function normalizeImageProvider(provider: string): string {
  if (provider === 'deepinfra-flux' || provider === 'deepinfra-flux-2') return 'deepinfra';
  return provider;
}

/**
 * 모델 ID가 가짜/deprecate 목록에 포함되는지 검사 (회귀 가드용)
 */
export function isBannedModelId(id: string): boolean {
  return (FAKE_MODEL_IDS_BANNED as readonly string[]).includes(id);
}

/**
 * 모델 ID가 검증된 이미지 모델인지 검사 (Stage 4 연동 테스트용 회귀 가드)
 */
export function isVerifiedImageModel(id: string): boolean {
  return (VERIFIED_IMAGE_MODELS as readonly string[]).includes(id);
}
