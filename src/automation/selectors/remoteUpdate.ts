/**
 * 셀렉터 원격 업데이트 모듈
 *
 * 네이버 UI 변경 시 앱 업데이트 없이 셀렉터를 원격으로 갱신한다.
 * 패치는 런타임에만 적용되며, 원본 셀렉터 파일은 수정하지 않는다.
 */
import type { SelectorEntry, SelectorMap } from './types';
import { getFailureReports, clearFailureReports } from './selectorUtils';
import {
  LOGIN_SELECTORS,
  EDITOR_SELECTORS,
  PUBLISH_SELECTORS,
  IMAGE_SELECTORS,
  CTA_SELECTORS,
} from './index';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RemoteSelectorPatch {
  readonly version: string;
  readonly timestamp: string;
  readonly patches: readonly SelectorPatchEntry[];
}

export interface SelectorPatchEntry {
  readonly category: 'login' | 'editor' | 'publish' | 'image' | 'cta';
  readonly key: string;
  readonly primary?: string;
  readonly addFallbacks?: readonly string[];
  readonly removeFallbacks?: readonly string[];
}

export interface ApplyResult {
  readonly applied: number;
  readonly skipped: number;
  readonly errors: readonly string[];
}

type CategoryName = SelectorPatchEntry['category'];

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

/** 런타임 mutable 복사본 (원본은 readonly로 보호) */
const runtimeSelectors: Record<CategoryName, Record<string, SelectorEntry>> = {
  login: { ...LOGIN_SELECTORS },
  editor: { ...EDITOR_SELECTORS },
  publish: { ...PUBLISH_SELECTORS },
  image: { ...IMAGE_SELECTORS },
  cta: { ...CTA_SELECTORS },
};

let periodicTimer: ReturnType<typeof setInterval> | null = null;
let currentPatchVersion: string | null = null;

const FETCH_TIMEOUT_MS = 5000;
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

function isValidPatch(data: unknown): data is RemoteSelectorPatch {
  if (typeof data !== 'object' || data === null) return false;

  const obj = data as Record<string, unknown>;
  if (typeof obj.version !== 'string') return false;
  if (typeof obj.timestamp !== 'string') return false;
  if (!Array.isArray(obj.patches)) return false;

  const validCategories = new Set<string>(['login', 'editor', 'publish', 'image', 'cta']);

  for (const entry of obj.patches) {
    if (typeof entry !== 'object' || entry === null) return false;
    const e = entry as Record<string, unknown>;
    if (typeof e.category !== 'string' || !validCategories.has(e.category)) return false;
    if (typeof e.key !== 'string') return false;
    if (e.primary !== undefined && typeof e.primary !== 'string') return false;
    if (e.addFallbacks !== undefined && !isStringArray(e.addFallbacks)) return false;
    if (e.removeFallbacks !== undefined && !isStringArray(e.removeFallbacks)) return false;
  }

  return true;
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

// ---------------------------------------------------------------------------
// 1. fetchRemoteSelectors
// ---------------------------------------------------------------------------

/**
 * 원격 URL에서 셀렉터 패치 JSON을 다운로드한다.
 * 타임아웃 5초, 스키마 검증 후 반환. 실패 시 null (fail-safe).
 */
export async function fetchRemoteSelectors(url: string): Promise<RemoteSelectorPatch | null> {
  try {
    // ✅ [v2.7.63 SEC-V2-H4] HTTPS 강제 — 중간자 공격 차단
    if (!url.startsWith('https://')) {
      console.error(`[RemoteUpdate] 🛡️ HTTPS 외 프로토콜 차단: ${url}`);
      return null;
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[RemoteUpdate] fetch 실패: HTTP ${response.status}`);
      return null;
    }

    // ✅ [v2.7.63 SEC-V2-H4] HMAC-SHA256 무결성 검증
    //   서버가 X-Selector-Signature 헤더에 base64(HMAC-SHA256(body, RELEASE_HMAC_KEY)) 포함
    //   비대칭 키 인프라 부담 회피 + 키는 release 시점에만 회전
    const bodyText = await response.text();
    const signature = response.headers.get('x-selector-signature') || '';
    const hmacKey = process.env.SELECTOR_HMAC_KEY || '';
    if (signature && hmacKey) {
      try {
        const crypto = await import('node:crypto');
        const expected = crypto.createHmac('sha256', hmacKey).update(bodyText).digest('base64');
        if (expected !== signature) {
          console.error('[RemoteUpdate] 🛡️ HMAC 서명 불일치 — 패치 거부 (변조 의심)');
          return null;
        }
      } catch (e) {
        console.warn('[RemoteUpdate] HMAC 검증 오류, 안전 폴백 → 패치 거부:', e);
        return null;
      }
    }
    // 서명 헤더가 없는 경우 — HMAC 키 미배포 단계에서도 호환 (기본 동작)

    const data: unknown = JSON.parse(bodyText);

    if (!isValidPatch(data)) {
      console.warn('[RemoteUpdate] 스키마 검증 실패 — 패치 무시');
      return null;
    }

    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[RemoteUpdate] 원격 셀렉터 다운로드 실패: ${message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 2. applyPatch
// ---------------------------------------------------------------------------

/**
 * 패치를 런타임 셀렉터에 머지한다.
 * 카테고리별/키별 선택적 업데이트. primary 또는 fallbacks만 개별 교체 가능.
 */
export function applyPatch(patch: RemoteSelectorPatch): ApplyResult {
  let applied = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const entry of patch.patches) {
    const categoryMap = runtimeSelectors[entry.category];
    const existing = categoryMap[entry.key];

    if (!existing) {
      skipped++;
      errors.push(`[${entry.category}.${entry.key}] 존재하지 않는 셀렉터 키 — 건너뜀`);
      continue;
    }

    try {
      const newPrimary = entry.primary ?? existing.primary;

      let newFallbacks = [...existing.fallbacks];

      // 폴백 제거
      if (entry.removeFallbacks && entry.removeFallbacks.length > 0) {
        const removeSet = new Set(entry.removeFallbacks);
        newFallbacks = newFallbacks.filter((fb) => !removeSet.has(fb));
      }

      // 폴백 추가 (중복 방지)
      if (entry.addFallbacks && entry.addFallbacks.length > 0) {
        const existingSet = new Set(newFallbacks);
        for (const fb of entry.addFallbacks) {
          if (!existingSet.has(fb)) {
            newFallbacks.push(fb);
          }
        }
      }

      // 새 SelectorEntry 생성 (immutable)
      const updated: SelectorEntry = {
        primary: newPrimary,
        fallbacks: newFallbacks,
        description: existing.description,
      };

      categoryMap[entry.key] = updated;
      applied++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`[${entry.category}.${entry.key}] 적용 실패: ${message}`);
      skipped++;
    }
  }

  if (applied > 0) {
    currentPatchVersion = patch.version;
    console.log(
      `[RemoteUpdate] 패치 v${patch.version} 적용 완료: ${applied}개 업데이트, ${skipped}개 건너뜀`,
    );
  }

  return { applied, skipped, errors };
}

// ---------------------------------------------------------------------------
// 3. schedulePeriodicCheck
// ---------------------------------------------------------------------------

/**
 * 주기적으로 원격 셀렉터 패치를 확인하고 자동 적용한다.
 * 앱 시작 시 1회 즉시 확인 후, intervalMs 간격으로 반복.
 */
export function schedulePeriodicCheck(
  url: string,
  intervalMs: number = DEFAULT_INTERVAL_MS,
): void {
  // 기존 타이머가 있으면 먼저 정리
  stopPeriodicCheck();

  // 즉시 1회 확인
  checkAndApply(url);

  periodicTimer = setInterval(() => {
    checkAndApply(url);
  }, intervalMs);

  console.log(`[RemoteUpdate] 주기적 확인 시작 (간격: ${Math.round(intervalMs / 60000)}분)`);
}

// ---------------------------------------------------------------------------
// 4. reportFailureTelemetry
// ---------------------------------------------------------------------------

/**
 * 수집된 셀렉터 실패 보고를 원격 서버로 전송한다.
 * 전송 후 로컬 보고를 클리어한다.
 */
export async function reportFailureTelemetry(endpoint: string): Promise<void> {
  const failures = getFailureReports();

  if (failures.length === 0) {
    return;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const body = JSON.stringify({
      failures,
      appVersion: getAppVersion(),
      timestamp: new Date().toISOString(),
    });

    const response = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[RemoteUpdate] 텔레메트리 전송 실패: HTTP ${response.status}`);
      return;
    }

    clearFailureReports();
    console.log(`[RemoteUpdate] 셀렉터 실패 보고 ${failures.length}건 전송 완료`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[RemoteUpdate] 텔레메트리 전송 오류: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// 5. stopPeriodicCheck
// ---------------------------------------------------------------------------

/**
 * 주기적 원격 확인을 중지한다.
 */
export function stopPeriodicCheck(): void {
  if (periodicTimer !== null) {
    clearInterval(periodicTimer);
    periodicTimer = null;
    console.log('[RemoteUpdate] 주기적 확인 중지');
  }
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * 런타임 셀렉터 맵을 반환한다 (패치가 적용된 상태).
 * 외부에서 이 함수를 통해 최신 셀렉터를 조회해야 한다.
 */
export function getRuntimeSelectors(): Readonly<Record<CategoryName, Readonly<SelectorMap>>> {
  return {
    login: { ...runtimeSelectors.login } as SelectorMap,
    editor: { ...runtimeSelectors.editor } as SelectorMap,
    publish: { ...runtimeSelectors.publish } as SelectorMap,
    image: { ...runtimeSelectors.image } as SelectorMap,
    cta: { ...runtimeSelectors.cta } as SelectorMap,
  };
}

/**
 * 현재 적용된 패치 버전을 반환한다. 패치 미적용 시 null.
 */
export function getCurrentPatchVersion(): string | null {
  return currentPatchVersion;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function checkAndApply(url: string): Promise<void> {
  try {
    const patch = await fetchRemoteSelectors(url);

    if (!patch) {
      return;
    }

    // 이미 같은 버전이 적용됐으면 건너뜀
    if (currentPatchVersion === patch.version) {
      return;
    }

    const result = applyPatch(patch);

    if (result.errors.length > 0) {
      console.warn('[RemoteUpdate] 패치 적용 중 경고:', result.errors);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[RemoteUpdate] 자동 업데이트 확인 실패: ${message}`);
  }
}

function getAppVersion(): string {
  try {
    // Electron 환경에서 앱 버전 가져오기
     
    const { app } = require('electron');
    return app.getVersion();
  } catch {
    return 'unknown';
  }
}
