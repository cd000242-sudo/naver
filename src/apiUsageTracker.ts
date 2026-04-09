/**
 * ✅ [2026-03-19] 통합 API 사용량 추적 모듈
 * - 모든 유료 API 제공자(Gemini, OpenAI, Claude, Perplexity, DeepInfra, Leonardo AI)의
 *   누적 비용을 실시간 추적
 * - Gemini의 기존 trackGeminiUsage 패턴을 전체 제공자로 확장
 * - 메모리 내 누적 → 디바운스 flush → config 영구 저장
 */

import { loadConfig, saveConfig } from './configManager.js';

// ==================== 타입 정의 ====================

export type ApiProvider = 'gemini' | 'openai' | 'openai-image' | 'claude' | 'perplexity' | 'deepinfra' | 'leonardoai';

/** ✅ 모든 제공자 목록 (DRY - 단일 진실 소스) */
export const ALL_PROVIDERS: ApiProvider[] = ['gemini', 'openai', 'openai-image', 'claude', 'perplexity', 'deepinfra', 'leonardoai'];

export interface ProviderUsageData {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalImages: number;
  estimatedCostUSD: number;
  lastUpdated: string;  // ISO date
  firstTracked: string; // ISO date
}

export interface TrackingInput {
  inputTokens?: number;
  outputTokens?: number;
  images?: number;
  model?: string;
  costOverride?: number; // 고정비용 직접 지정 시
}

// ==================== 가격 테이블 (공식 2026-03 기준) ====================

/** OpenAI 텍스트 모델 가격 ($/1M tokens) */
const OPENAI_TEXT_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-5.4':         { input: 2.50, output: 10.00 },
  'gpt-4.1':         { input: 2.00, output: 8.00 },
  'gpt-4.1-mini':    { input: 0.40, output: 1.60 },
  'gpt-4.1-nano':    { input: 0.10, output: 0.40 },
  'gpt-4o':          { input: 2.50, output: 10.00 },
  'gpt-4o-mini':     { input: 0.15, output: 0.60 },
  'default':         { input: 2.50, output: 10.00 }, // 안전 폴백
};

/** OpenAI 이미지 모델 가격 ($/장) */
const OPENAI_IMAGE_PRICING: Record<string, number> = {
  'gpt-image-1':     0.04,  // low quality
  'gpt-image-1-hd':  0.08,  // high quality
  'dall-e-3':        0.04,
  'dall-e-3-hd':     0.08,
  'default':         0.04,
};

/** Claude (Anthropic) 모델 가격 ($/1M tokens) — Active 모델만 */
// 매칭은 substring 기반(matchPricingKey). 더 구체적인 키를 위에 두어야 정확히 매칭됨.
const CLAUDE_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6':         { input: 15.00, output: 75.00 },
  'claude-opus-4-5':         { input: 15.00, output: 75.00 },
  'claude-opus-4-1':         { input: 15.00, output: 75.00 },
  'claude-opus-4':           { input: 15.00, output: 75.00 },
  'claude-sonnet-4-6':       { input: 3.00,  output: 15.00 },
  'claude-sonnet-4-5':       { input: 3.00,  output: 15.00 },
  'claude-sonnet-4':         { input: 3.00,  output: 15.00 },
  'claude-haiku-4-5':        { input: 1.00,  output: 5.00 },
  'default':                 { input: 3.00,  output: 15.00 },
};

/** Perplexity 모델 가격 ($/1M tokens) + 검색비용 */
const PERPLEXITY_PRICING: Record<string, { input: number; output: number; searchCostPerReq: number }> = {
  'sonar':        { input: 1.00, output: 1.00, searchCostPerReq: 0.005 },
  'sonar-pro':    { input: 3.00, output: 15.00, searchCostPerReq: 0.005 },
  'sonar-deep-research': { input: 2.00, output: 8.00, searchCostPerReq: 0.005 },
  'default':      { input: 1.00, output: 1.00, searchCostPerReq: 0.005 },
};

/** DeepInfra 이미지 모델 가격 ($/장) */
const DEEPINFRA_PRICING: Record<string, number> = {
  'FLUX-1-schnell':  0.003,
  'FLUX-1-dev':      0.025,
  'FLUX-2-dev':      0.025,
  'FLUX-1-Redux':    0.025,
  'default':         0.025,
};

/** Leonardo AI 가격 ($/장, 모델별 크레딧 소비 기반 추정) */
const LEONARDOAI_PRICING: Record<string, number> = {
  'seedream-4.5':     0.04,
  'phoenix-1.0':      0.02,
  'ideogram-3.0':     0.06,
  'nano-banana-pro':  0.02,
  'default':          0.04,
};

// ==================== 가격 계산 헬퍼 ====================

function matchPricingKey(model: string, table: Record<string, any>): string {
  const lower = model.toLowerCase();
  for (const key of Object.keys(table)) {
    if (key === 'default') continue;
    if (lower.includes(key.toLowerCase())) return key;
  }
  return 'default';
}

function calculateCost(provider: ApiProvider, input: TrackingInput): number {
  if (input.costOverride !== undefined) return input.costOverride;

  const model = input.model || '';
  const inTok = input.inputTokens || 0;
  const outTok = input.outputTokens || 0;

  switch (provider) {
    case 'gemini': {
      // Gemini는 gemini.ts의 기존 GEMINI_PRICING 사용 — 여기서도 호환 처리
      const lower = model.toLowerCase();
      let pInput = 0.10, pOutput = 0.40; // Flash 기본
      if (lower.includes('pro')) { pInput = 1.25; pOutput = 5.00; }
      else if (lower.includes('flash-lite') || lower.includes('flash_lite')) { pInput = 0.025; pOutput = 0.10; }
      return (inTok / 1_000_000) * pInput + (outTok / 1_000_000) * pOutput;
    }

    case 'openai': {
      const key = matchPricingKey(model, OPENAI_TEXT_PRICING);
      const p = OPENAI_TEXT_PRICING[key];
      return (inTok / 1_000_000) * p.input + (outTok / 1_000_000) * p.output;
    }

    case 'openai-image': {
      const key = matchPricingKey(model, OPENAI_IMAGE_PRICING);
      return OPENAI_IMAGE_PRICING[key] * (input.images || 1);
    }

    case 'claude': {
      const key = matchPricingKey(model, CLAUDE_PRICING);
      const p = CLAUDE_PRICING[key];
      return (inTok / 1_000_000) * p.input + (outTok / 1_000_000) * p.output;
    }

    case 'perplexity': {
      const key = matchPricingKey(model, PERPLEXITY_PRICING);
      const p = PERPLEXITY_PRICING[key];
      const tokenCost = (inTok / 1_000_000) * p.input + (outTok / 1_000_000) * p.output;
      // ✅ [2026-03-19 FIX] 검색비용은 sonar 모델일 때만 가산 (비-sonar 호출 시 0)
      const searchCost = model.toLowerCase().includes('sonar') ? p.searchCostPerReq : 0;
      return tokenCost + searchCost;
    }

    case 'deepinfra': {
      const key = matchPricingKey(model, DEEPINFRA_PRICING);
      return DEEPINFRA_PRICING[key] * (input.images || 1);
    }

    case 'leonardoai': {
      const key = matchPricingKey(model, LEONARDOAI_PRICING);
      return LEONARDOAI_PRICING[key] * (input.images || 1);
    }

    default:
      return 0;
  }
}

// ==================== 메모리 누적기 ====================

const _pendingByProvider: Map<ApiProvider, {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  images: number;
  costUSD: number;
}> = new Map();

let _flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_DEBOUNCE_MS = 3000;

function ensurePending(provider: ApiProvider) {
  if (!_pendingByProvider.has(provider)) {
    _pendingByProvider.set(provider, {
      calls: 0, inputTokens: 0, outputTokens: 0, images: 0, costUSD: 0,
    });
  }
  return _pendingByProvider.get(provider)!;
}

// ==================== 공개 API ====================

/**
 * API 사용량을 메모리에 누적 (동기, 즉시 반환)
 * 모든 API 호출 성공 시 호출해야 함
 */
export function trackApiUsage(provider: ApiProvider, input: TrackingInput): void {
  const cost = calculateCost(provider, input);
  const pending = ensurePending(provider);

  pending.calls += 1;
  pending.inputTokens += input.inputTokens || 0;
  pending.outputTokens += input.outputTokens || 0;
  pending.images += input.images || 0;
  pending.costUSD += cost;

  const label = provider.toUpperCase();
  const tokenInfo = (input.inputTokens || input.outputTokens)
    ? ` ${input.inputTokens || 0}in/${input.outputTokens || 0}out`
    : '';
  const imgInfo = input.images ? ` ${input.images}장` : '';
  console.log(`[UsageTracker] 📊 ${label}:${tokenInfo}${imgInfo} $${cost.toFixed(6)} | 대기: ${pending.calls}건 $${pending.costUSD.toFixed(4)}`);

  // 디바운스 flush
  if (_flushTimer) clearTimeout(_flushTimer);
  _flushTimer = setTimeout(() => { flushAllApiUsage().catch(() => {}); }, FLUSH_DEBOUNCE_MS);
}

/**
 * 메모리 누적분을 config에 저장 (앱 종료/할당량 조회 시 호출)
 */
export async function flushAllApiUsage(): Promise<void> {
  // 저장할 데이터가 있는 제공자만 처리
  const providers = Array.from(_pendingByProvider.entries())
    .filter(([, p]) => p.calls > 0);

  if (providers.length === 0) return;

  // 스냅샷 복사 후 메모리 초기화
  const snapshots = new Map<ApiProvider, typeof providers[0][1]>();
  for (const [prov, data] of providers) {
    snapshots.set(prov, { ...data });
    data.calls = 0;
    data.inputTokens = 0;
    data.outputTokens = 0;
    data.images = 0;
    data.costUSD = 0;
  }

  try {
    const config = await loadConfig() as any;
    const trackers = config.apiUsageTrackers || {};
    const now = new Date().toISOString();

    for (const [prov, snap] of snapshots) {
      const existing = trackers[prov] || {
        totalCalls: 0, totalInputTokens: 0, totalOutputTokens: 0,
        totalImages: 0, estimatedCostUSD: 0,
        firstTracked: now,
      };

      existing.totalCalls += snap.calls;
      existing.totalInputTokens += snap.inputTokens;
      existing.totalOutputTokens += snap.outputTokens;
      existing.totalImages += snap.images;
      existing.estimatedCostUSD += snap.costUSD;
      existing.lastUpdated = now;

      trackers[prov] = existing;
      console.log(`[UsageTracker] 💾 ${prov} flush: ${snap.calls}건 $${snap.costUSD.toFixed(4)} → 누적 $${existing.estimatedCostUSD.toFixed(4)}`);
    }

    await saveConfig({ apiUsageTrackers: trackers } as any);
  } catch (e) {
    // flush 실패 시 데이터 복원 (손실 방지)
    for (const [prov, snap] of snapshots) {
      const pending = ensurePending(prov);
      pending.calls += snap.calls;
      pending.inputTokens += snap.inputTokens;
      pending.outputTokens += snap.outputTokens;
      pending.images += snap.images;
      pending.costUSD += snap.costUSD;
    }
    console.warn('[UsageTracker] flush 실패 (다음에 재시도):', (e as Error).message);
  }
}

/**
 * 제공자별 또는 전체 합산 사용량 스냅샷 반환 (메모리 + 디스크)
 */
export async function getApiUsageSnapshot(provider?: ApiProvider): Promise<
  Record<string, ProviderUsageData> | ProviderUsageData
> {
  const config = await loadConfig() as any;
  const savedTrackers: Record<string, ProviderUsageData> = config.apiUsageTrackers || {};

  // 메모리 pending 합산
  const mergedTrackers: Record<string, ProviderUsageData> = {};

  const allProviders = ALL_PROVIDERS;

  for (const prov of allProviders) {
    const saved = savedTrackers[prov] || {
      totalCalls: 0, totalInputTokens: 0, totalOutputTokens: 0,
      totalImages: 0, estimatedCostUSD: 0,
      firstTracked: '', lastUpdated: '',
    };
    const pending = _pendingByProvider.get(prov);

    mergedTrackers[prov] = {
      totalCalls: saved.totalCalls + (pending?.calls || 0),
      totalInputTokens: saved.totalInputTokens + (pending?.inputTokens || 0),
      totalOutputTokens: saved.totalOutputTokens + (pending?.outputTokens || 0),
      totalImages: saved.totalImages + (pending?.images || 0),
      estimatedCostUSD: saved.estimatedCostUSD + (pending?.costUSD || 0),
      lastUpdated: saved.lastUpdated || '',
      firstTracked: saved.firstTracked || '',
    };
  }

  if (provider) {
    return mergedTrackers[provider] || {
      totalCalls: 0, totalInputTokens: 0, totalOutputTokens: 0,
      totalImages: 0, estimatedCostUSD: 0,
      lastUpdated: '', firstTracked: '',
    };
  }

  return mergedTrackers;
}

/**
 * 제공자별 또는 전체 사용량 초기화
 */
export async function resetApiUsage(provider?: ApiProvider): Promise<void> {
  const config = await loadConfig() as any;
  const trackers = config.apiUsageTrackers || {};
  const now = new Date().toISOString();

  if (provider) {
    // 특정 제공자만 초기화
    trackers[provider] = {
      totalCalls: 0, totalInputTokens: 0, totalOutputTokens: 0,
      totalImages: 0, estimatedCostUSD: 0,
      firstTracked: now, lastUpdated: now,
    };
    // 메모리도 초기화
    _pendingByProvider.delete(provider);
    console.log(`[UsageTracker] 🔄 ${provider} 사용량 초기화 완료`);
  } else {
    // 전체 초기화
    const allProviders = ALL_PROVIDERS;
    for (const p of allProviders) {
      trackers[p] = {
        totalCalls: 0, totalInputTokens: 0, totalOutputTokens: 0,
        totalImages: 0, estimatedCostUSD: 0,
        firstTracked: now, lastUpdated: now,
      };
    }
    _pendingByProvider.clear();
    console.log('[UsageTracker] 🔄 전체 사용량 초기화 완료');
  }

  await saveConfig({ apiUsageTrackers: trackers } as any);
}
