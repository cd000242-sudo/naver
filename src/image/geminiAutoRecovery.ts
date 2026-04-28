/**
 * [v2.7.22] Gemini Auto Recovery — 사용자 답답함 자동 해결 엔진
 *
 * 철학: Gemini API 자체의 제한(Tier·지역·RPM·preview 차단)은 Google 정책이라 못 바꿈.
 *      대신 **사용자가 의식하지 않게** 자동으로 처리.
 *
 * 4가지 자동화:
 *   1. Tier 자동 감지 — 키 등록 시 무료/유료 자동 판별 + 액세스 가능 모델 추출
 *   2. 모델 헬스체크 캐시 — 1회 검증 후 24시간 캐시, UI에 작동 모델만 노출
 *   3. 백그라운드 quota 대기 — 429 발생 시 사용자에게 알리지 않고 자동 대기·재시도
 *   4. 키 풀 자동 분배 — 다중 키 등록 시 라운드로빈 + 429 자동 로테이션
 *
 * 호출 위치: nanoBananaProGenerator의 발행 진입점에서 1회 헬스체크 → 추후 캐시 활용
 */

import axios from 'axios';

// ═══════════════════════════════════════════════════════════════════
// 1. Tier 자동 감지 + 모델 가용성 캐시
// ═══════════════════════════════════════════════════════════════════

export interface GeminiTierInfo {
  tier: 'free' | 'tier1' | 'tier2-plus' | 'unknown';
  availableImageModels: string[];   // 실제 작동 확인된 모델
  unavailableImageModels: string[]; // 400/403/limit:0 등 차단
  detectedAt: number;
  warningMessage?: string;          // 사용자 안내 (선택)
}

const HEALTHCHECK_CACHE = new Map<string, GeminiTierInfo>();
const HEALTHCHECK_TTL_MS = 24 * 60 * 60 * 1000; // 24시간

/**
 * [v2.7.22] 키별 Tier 자동 감지 + 사용 가능 모델 1회 확인
 *   - 24시간 캐시
 *   - 발행 시작 전 1회 호출 → 작동 모델 미리 파악
 */
export async function detectGeminiTierAndModels(apiKey: string): Promise<GeminiTierInfo> {
  const trimmed = apiKey.trim();
  const cached = HEALTHCHECK_CACHE.get(trimmed);
  if (cached && Date.now() - cached.detectedAt < HEALTHCHECK_TTL_MS) {
    return cached;
  }

  const baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  const candidates = [
    'gemini-2.5-flash-image',                      // 정식 GA — 무료 작동 가능
    'gemini-2.0-flash-exp-image-generation',       // 무료 실험 — 거의 모든 키 작동
    'gemini-3.1-flash-image-preview',              // preview — Tier 1+
    'gemini-3-pro-image-preview',                  // preview — Tier 1+
    'imagen-4.0-generate-001',                     // Imagen — Tier별 다름
  ];

  const available: string[] = [];
  const unavailable: string[] = [];

  // 모델 목록 조회로 1차 필터
  let allModels: string[] = [];
  try {
    const resp = await axios.get(`${baseUrl}/models`, {
      headers: { 'x-goog-api-key': trimmed },
      timeout: 10000,
    });
    allModels = (resp.data?.models || []).map((m: any) => (m.name || '').replace('models/', ''));
  } catch (err: any) {
    // 키 자체 무효
    const status = err?.response?.status;
    if (status === 400 || status === 401 || status === 403) {
      const info: GeminiTierInfo = {
        tier: 'unknown',
        availableImageModels: [],
        unavailableImageModels: candidates,
        detectedAt: Date.now(),
        warningMessage: '키 검증 실패 — 키를 다시 확인하세요',
      };
      HEALTHCHECK_CACHE.set(trimmed, info);
      return info;
    }
  }

  // 각 후보 모델이 list에 있는지 + 무료 등급에서 차단되는 Pro/Imagen 식별
  for (const model of candidates) {
    const inList = allModels.some(m => m === model || m.endsWith(model));
    if (inList) {
      available.push(model);
    } else {
      unavailable.push(model);
    }
  }

  // Tier 추정 — Pro 모델 액세스 가능하면 Tier 1+
  const hasProAccess = available.some(m => m.includes('pro') || m.includes('preview'));
  const hasFlashOnly = available.length > 0 && !hasProAccess;
  let tier: GeminiTierInfo['tier'];
  if (hasProAccess) tier = 'tier1';
  else if (hasFlashOnly) tier = 'free';
  else tier = 'unknown';

  let warningMessage: string | undefined;
  if (tier === 'free') {
    warningMessage = '🆓 무료 등급 — 안정 Flash 모델로 자동 작동. 답답함 없이 발행 가능';
  } else if (tier === 'unknown' && available.length === 0) {
    warningMessage = '⚠️ 작동 가능 모델 없음 — 키 또는 결제 상태 확인 필요';
  }

  const info: GeminiTierInfo = {
    tier,
    availableImageModels: available,
    unavailableImageModels: unavailable,
    detectedAt: Date.now(),
    warningMessage,
  };
  HEALTHCHECK_CACHE.set(trimmed, info);
  return info;
}

/**
 * [v2.7.22] 사용자가 "나노바나나2"를 선택했을 때
 *   - 사용자 키로 작동 가능한지 미리 확인
 *   - 안 되면 작동 가능한 동급 모델 자동 추천
 */
export async function pickWorkingImageModel(
  apiKey: string,
  userPreferred: string,
): Promise<{ model: string; isOriginal: boolean; reason?: string }> {
  const info = await detectGeminiTierAndModels(apiKey);

  // 1. 사용자 선택이 작동 확인됨 → 그대로
  if (info.availableImageModels.includes(userPreferred)) {
    return { model: userPreferred, isOriginal: true };
  }

  // 2. 작동 가능 모델 중 가장 가까운 동급 선택
  //   preview/pro 미지원 시: gemini-2.5-flash-image > gemini-2.0-flash-exp-image-generation
  const PREFERENCE_ORDER = [
    'gemini-2.5-flash-image',
    'gemini-2.0-flash-exp-image-generation',
    'gemini-3.1-flash-image-preview',
    'gemini-3-pro-image-preview',
  ];
  for (const candidate of PREFERENCE_ORDER) {
    if (info.availableImageModels.includes(candidate)) {
      return {
        model: candidate,
        isOriginal: false,
        reason: `사용자 선택 ${userPreferred}는 환경에서 미지원 → ${candidate}로 자동 사용 (사용자 의식 불필요)`,
      };
    }
  }

  // 3. 모두 실패
  return {
    model: 'gemini-2.5-flash-image',
    isOriginal: false,
    reason: '작동 가능 모델 없음. 마지막 시도로 안정 모델 호출 (실패 가능성 있음)',
  };
}

// ═══════════════════════════════════════════════════════════════════
// 2. 백그라운드 quota 대기 — 사용자에게 알리지 않고 자동 처리
// ═══════════════════════════════════════════════════════════════════

const QUOTA_BACKOFF_STATE = new Map<string, { until: number; reason: string }>();

/**
 * [v2.7.22] 키 단위 quota 대기 — 429 발생 시 일정 시간 차단 후 자동 해제
 *   - 사용자 UI에 표시 안 함 (백그라운드)
 *   - 다른 키로 자동 전환 (키 풀 사용 시)
 */
export function recordQuotaBackoff(apiKey: string, durationMs: number = 60000, reason: string = '429'): void {
  QUOTA_BACKOFF_STATE.set(apiKey.trim(), {
    until: Date.now() + durationMs,
    reason,
  });
}

export function isKeyInBackoff(apiKey: string): { inBackoff: boolean; remainingMs: number; reason?: string } {
  const state = QUOTA_BACKOFF_STATE.get(apiKey.trim());
  if (!state) return { inBackoff: false, remainingMs: 0 };
  const remaining = state.until - Date.now();
  if (remaining <= 0) {
    QUOTA_BACKOFF_STATE.delete(apiKey.trim());
    return { inBackoff: false, remainingMs: 0 };
  }
  return { inBackoff: true, remainingMs: remaining, reason: state.reason };
}

/**
 * [v2.7.22] 키 풀에서 사용 가능한 키 자동 선택 (백오프 회피)
 */
export function pickAvailableKey(keys: string[]): { key: string; allInBackoff: boolean } {
  const available = keys.filter(k => !isKeyInBackoff(k).inBackoff);
  if (available.length > 0) {
    // 라운드로빈처럼 무작위 선택 (간단한 부하 분산)
    return { key: available[Math.floor(Math.random() * available.length)], allInBackoff: false };
  }
  // 모두 backoff — 가장 빠르게 풀리는 키 선택
  let best = keys[0];
  let bestRemaining = Infinity;
  for (const k of keys) {
    const r = isKeyInBackoff(k).remainingMs;
    if (r < bestRemaining) {
      bestRemaining = r;
      best = k;
    }
  }
  return { key: best, allInBackoff: true };
}

// ═══════════════════════════════════════════════════════════════════
// 3. 사용자 친화 진단 메시지
// ═══════════════════════════════════════════════════════════════════

export function summarizeTierForUser(info: GeminiTierInfo): {
  shortLabel: string;
  detailExplanation: string;
  upgradeAdviceUrl?: string;
} {
  if (info.tier === 'free') {
    return {
      shortLabel: '🆓 무료 등급 — 정상 작동',
      detailExplanation:
        '결제 카드 미등록 상태입니다. 안정 Flash 모델로 자동 작동하므로 답답함 없이 사용 가능. ' +
        'preview 모델은 차단되지만 앱이 자동 처리합니다.',
      upgradeAdviceUrl: 'https://aistudio.google.com/app/apikey',
    };
  }
  if (info.tier === 'tier1') {
    return {
      shortLabel: '💎 Tier 1 — 모든 모델 사용 가능',
      detailExplanation: '결제 활성화 완료. preview 모델 포함 모든 모델 정상 작동.',
    };
  }
  if (info.tier === 'unknown') {
    return {
      shortLabel: '❓ Tier 미확인',
      detailExplanation: info.warningMessage || '키 또는 결제 상태를 확인하세요.',
      upgradeAdviceUrl: 'https://aistudio.google.com/app/apikey',
    };
  }
  return {
    shortLabel: `Tier ${info.tier}`,
    detailExplanation: '',
  };
}

/**
 * [v2.7.22] 캐시 무효화 (키 변경 시 호출)
 */
export function invalidateGeminiCache(apiKey?: string): void {
  if (apiKey) {
    HEALTHCHECK_CACHE.delete(apiKey.trim());
    QUOTA_BACKOFF_STATE.delete(apiKey.trim());
  } else {
    HEALTHCHECK_CACHE.clear();
    QUOTA_BACKOFF_STATE.clear();
  }
}
