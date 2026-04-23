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
  // Anthropic prompt caching: cache writes cost 1.25x base input, cache reads
  // cost 0.1x base input. Passed separately so we do not double-count them.
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
}

// ==================== 가격 테이블 (공식 2026-04 기준 — v1.4.77 전면 교정) ====================

/** OpenAI 텍스트 모델 가격 ($/1M tokens) — source: openai.com/api/pricing 2026-04
 *  cachedInput은 prompt caching 자동 적용 시 실효 단가 (gpt-5.x: 90% off, gpt-4.1: 75% off, gpt-4o: 50% off)
 *  Batch API 사용 시 input/output 모두 0.5x 할인 추가 적용 가능 (별도 계산)
 *  ⚠️ SUNSET 2026-03-31: gpt-4o / gpt-4o-mini (API 제거 예정 — 사용 금지)
 *  API 유지: gpt-4.1 계열 (ChatGPT 2026-02-13 은퇴했지만 API는 유지)
 */
const OPENAI_TEXT_PRICING: Record<string, { input: number; cachedInput: number; output: number }> = {
  // 현역 플래그십 (gpt-5.x) — 2026-04 기준 공식 권장
  'gpt-5.4':         { input: 2.50, cachedInput: 0.25,  output: 15.00 },
  'gpt-5.4-mini':    { input: 0.75, cachedInput: 0.075, output: 4.50 },
  'gpt-5.4-nano':    { input: 0.20, cachedInput: 0.020, output: 1.25 },
  // API 유지 (ChatGPT만 2026-02-13 은퇴)
  'gpt-4.1':         { input: 2.00, cachedInput: 0.50,  output: 8.00 },
  'gpt-4.1-mini':    { input: 0.40, cachedInput: 0.10,  output: 1.60 },
  'gpt-4.1-nano':    { input: 0.10, cachedInput: 0.025, output: 0.40 },
  // ⚠️ 2026-03-31 API 제거 예정 — 호환용으로만 유지 (호출 금지)
  'gpt-4o':          { input: 2.50, cachedInput: 1.25,  output: 10.00 },
  'gpt-4o-mini':     { input: 0.15, cachedInput: 0.075, output: 0.60 },
  'default':         { input: 2.50, cachedInput: 0.25,  output: 15.00 }, // gpt-5.4 기준 안전 폴백
};

/** OpenAI 이미지 모델 가격 ($/장) — 2026-04 공식 기준
 *  gpt-image-1은 토큰 기반 과금이라 품질/사이즈마다 장당 비용이 15배까지 차이남.
 *  이전 코드는 DALL-E 3 구가격($0.04/$0.08)을 잘못 적용해 low는 264% 과대, high는 52% 과소 계상이었음.
 *  source: openai.com/api/pricing (text input $5/1M, image output $32/1M 토큰 기반 환산)
 */
const OPENAI_IMAGE_PRICING: Record<string, number> = {
  // gpt-image-1 — 1024x1024 정사각 (현역 기본)
  'gpt-image-1-low':       0.011,  // low quality
  'gpt-image-1-medium':    0.042,  // medium quality (네이버 블로그 권장)
  'gpt-image-1-high':      0.167,  // high quality
  // gpt-image-1 — 1024x1536 / 1536x1024 세로·가로 확장
  'gpt-image-1-low-wide':    0.016,
  'gpt-image-1-medium-wide': 0.063,
  'gpt-image-1-high-wide':   0.250,
  // 코드 호환 — quality 미지정 시 medium으로 추정
  'gpt-image-1':     0.042,  // quality: 'auto' 평균 추정치 (medium 수준)
  'gpt-image-1-hd':  0.167,  // high quality (이전 -hd suffix 호환)
  // gpt-image-1.5 — 차세대 (DALL-E 3 대체, 2026-04 이미 가용)
  'gpt-image-1.5-low':    0.015,
  'gpt-image-1.5-medium': 0.050,
  'gpt-image-1.5-high':   0.180,
  // ✅ [v1.5.5] gpt-image-2 — "덕트테이프", ChatGPT Images 2.0 (2026-04-21 출시)
  //   Nano Banana 저격 포지션. 12단어+ 완벽 텍스트, 다국어 렌더링 최강.
  //   가격은 초기 공식 발표 확인 전까지 gpt-image-1.5 기준으로 가정 (소폭 상승 추정).
  'gpt-image-2-low':      0.018,  // low quality
  'gpt-image-2-medium':   0.055,  // medium (기본 권장)
  'gpt-image-2-high':     0.200,  // high (고품질 썸네일)
  'gpt-image-2':          0.055,  // quality 미지정 시 medium
  'gpt-image-2-hd':       0.200,  // -hd 접미사 호환
  // ✅ [v1.4.80] Flow (Nano Banana Pro) — labs.google/flow 경유 무료 쿼터
  'flow-nano-banana-pro': 0,
  'flow-nano-banana-2':   0,  // ✅ [v1.5.4] 표기 업데이트
  'imagen-3.5-imagefx':   0,  // ImageFX (기존, 무료)
  // ⚠️ DALL-E 3 — 2026-05-12 API 제거 예정. 새 호출 금지, 호환용 가격표만 유지
  'dall-e-3':        0.04,
  'dall-e-3-hd':     0.08,
  'default':         0.042,
};

/** Claude (Anthropic) 모델 가격 ($/1M tokens) — source: anthropic.com/pricing 2026-04
 *  매칭은 substring 기반(matchPricingKey). 더 구체적인 키를 위에 두어야 정확히 매칭됨.
 *  2025-11-24 Opus 4.5 출시와 함께 Opus 전체 67% 가격 인하 ($15/$75 → $5/$25). Opus 4.6/4.7도 동일.
 *  Opus 4.1 / 4.0은 레거시 단가($15/$75) 유지.
 */
const CLAUDE_PRICING: Record<string, { input: number; output: number }> = {
  // Latest tier (현행 플래그십)
  'claude-opus-4-7':         { input: 5.00,  output: 25.00 },  // 2026-04-16 출시
  'claude-sonnet-4-6':       { input: 3.00,  output: 15.00 },  // 2026-02-17 출시
  'claude-haiku-4-5':        { input: 1.00,  output: 5.00 },
  'claude-haiku-4-5-20251001': { input: 1.00, output: 5.00 },  // snapshot
  // Legacy tier (여전히 API 가용)
  'claude-opus-4-6':         { input: 5.00,  output: 25.00 },
  'claude-opus-4-5':         { input: 5.00,  output: 25.00 },  // 2025-11-24 67% 인하
  'claude-opus-4-5-20251101': { input: 5.00, output: 25.00 },
  'claude-opus-4-1':         { input: 15.00, output: 75.00 },
  'claude-opus-4-1-20250805': { input: 15.00, output: 75.00 },
  'claude-sonnet-4-5':       { input: 3.00,  output: 15.00 },
  'claude-sonnet-4-5-20250929': { input: 3.00, output: 15.00 },
  // Deprecated 2026-06-15 — alias는 '-0' 필수, 무접미사는 존재하지 않음
  'claude-opus-4-0':         { input: 15.00, output: 75.00 },
  'claude-opus-4-20250514':  { input: 15.00, output: 75.00 },
  'claude-sonnet-4-0':       { input: 3.00,  output: 15.00 },
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
  'default':                 { input: 3.00,  output: 15.00 },
};

/** Perplexity 모델 가격 ($/1M tokens) + 검색비용 — source: docs.perplexity.ai/pricing 2026-04
 *  2026년 기준 sonar/sonar-pro는 citation 토큰 과금 폐지.
 *  sonar-reasoning-pro(2025-12-15)가 기존 sonar-reasoning을 대체하여 현재 활성 모델은 4종(sonar / sonar-pro / sonar-reasoning-pro / sonar-deep-research).
 */
const PERPLEXITY_PRICING: Record<string, { input: number; output: number; searchCostPerReq: number }> = {
  'sonar':                { input: 1.00, output: 1.00,  searchCostPerReq: 0.005 },
  'sonar-pro':            { input: 3.00, output: 15.00, searchCostPerReq: 0.005 },
  'sonar-reasoning-pro':  { input: 2.00, output: 8.00,  searchCostPerReq: 0.005 },  // 2025-12-15 sonar-reasoning 대체
  'sonar-deep-research':  { input: 2.00, output: 8.00,  searchCostPerReq: 0.005 },
  'default':              { input: 1.00, output: 1.00,  searchCostPerReq: 0.005 },
};

/** DeepInfra 이미지 모델 가격 ($/장, 1024×1024 = 1MP 기준) — source: deepinfra.com/pricing 2026-04 */
const DEEPINFRA_PRICING: Record<string, number> = {
  'FLUX-1-schnell':  0.003,
  'FLUX-1-dev':      0.025,
  'FLUX-2-dev':      0.012,   // ← 수정: 0.025 → 0.012 (공식 pay-per-MP 기준)
  'FLUX-2-max':      0.07,    // ← 신규: 첫 MP $0.07 + 추가 $0.03/MP
  'FLUX-1-Redux':    0.025,
  'default':         0.025,
};

/** Leonardo AI 가격 ($/장) — source: leonardo.ai/pricing + Google Gemini 3 Pro Image API 2026-04
 *  Nano Banana Pro는 Google 공식 Gemini 3 Pro Image — 해상도별 차등 (Leonardo 경유 시 플랫폼 마진 추가)
 */
const LEONARDOAI_PRICING: Record<string, number> = {
  'seedream-4.5':          0.04,
  'phoenix-1.0':           0.02,
  'ideogram-3.0':          0.15,   // ← 수정: 0.06 → 0.15 (Balanced 기준, Quality 시 $0.23)
  'nano-banana-pro':       0.134,  // ← 수정: 0.02 → 0.134 (2K 기준, 6.7배 과소 계상 버그)
  'nano-banana-pro-1k':    0.039,  // ← 신규: 1024×1024
  'nano-banana-pro-4k':    0.24,   // ← 신규: 4K
  'default':               0.04,
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
      // ✅ [v1.4.77] 공식 2026-04 단가로 전면 교정 (이전 구 2.0 시절 단가 → Flash output 6.25배 과소 계상 버그)
      // source: ai.google.dev/gemini-api/docs/pricing
      // 200K 토큰 초과 시 Pro 계열은 2배 요금 (>200K 분기 적용)
      const lower = model.toLowerCase();
      const totalTokens = inTok + outTok;
      const isLongContext = totalTokens > 200_000;
      let pInput: number, pOutput: number;
      if (lower.includes('gemini-3') || lower.includes('3.1-pro') || lower.includes('3.1-flash')) {
        // Gemini 3.1 Pro / Flash (2026-02-19 출시, 3-pro-preview는 2026-03-26 shutdown됨)
        if (lower.includes('flash')) {
          pInput = isLongContext ? 0.60 : 0.30;
          pOutput = isLongContext ? 5.00 : 2.50;
        } else {
          pInput = isLongContext ? 4.00 : 2.00;
          pOutput = isLongContext ? 18.00 : 12.00;
        }
      } else if (lower.includes('flash-lite') || lower.includes('flash_lite')) {
        pInput = 0.10;   // ← 수정: 0.025 → 0.10 (4배 과소)
        pOutput = 0.40;  // ← 수정: 0.10 → 0.40 (4배 과소)
      } else if (lower.includes('pro')) {
        pInput = isLongContext ? 2.50 : 1.25;
        pOutput = isLongContext ? 15.00 : 10.00;  // ← 수정: 5 → 10 (2배 과소)
      } else {
        // Flash (기본)
        pInput = 0.30;   // ← 수정: 0.10 → 0.30 (3배 과소)
        pOutput = 2.50;  // ← 수정: 0.40 → 2.50 (6.25배 과소)
      }
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
      const cacheCreate = input.cacheCreationTokens || 0;
      const cacheRead = input.cacheReadTokens || 0;
      // Anthropic multipliers: write = 1.25x input, read = 0.1x input
      const base = (inTok / 1_000_000) * p.input + (outTok / 1_000_000) * p.output;
      const cacheCost = (cacheCreate / 1_000_000) * p.input * 1.25
                      + (cacheRead / 1_000_000) * p.input * 0.10;
      return base + cacheCost;
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
  // Cache read/write tokens also count as model-processed tokens for the
  // dashboard's "total input" figure, even though they are priced differently.
  pending.inputTokens += (input.inputTokens || 0)
                        + (input.cacheCreationTokens || 0)
                        + (input.cacheReadTokens || 0);
  pending.outputTokens += input.outputTokens || 0;
  pending.images += input.images || 0;
  pending.costUSD += cost;

  const label = provider.toUpperCase();
  const tokenInfo = (input.inputTokens || input.outputTokens)
    ? ` ${input.inputTokens || 0}in/${input.outputTokens || 0}out`
    : '';
  const cacheInfo = (input.cacheCreationTokens || input.cacheReadTokens)
    ? ` cache:+${input.cacheCreationTokens || 0}w/${input.cacheReadTokens || 0}r`
    : '';
  const imgInfo = input.images ? ` ${input.images}장` : '';
  console.log(`[UsageTracker] 📊 ${label}:${tokenInfo}${cacheInfo}${imgInfo} $${cost.toFixed(6)} | 대기: ${pending.calls}건 $${pending.costUSD.toFixed(4)}`);

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
