/**
 * licenseFallback.ts — 라이선스 검증 이중화 시스템
 *
 * 다중 서버 폴백, 오프라인 그레이스 기간, 헬스체크를 제공한다.
 * 주 서버(Google Apps Script) 장애 시에도 앱 사용을 보장한다.
 */

import fs from 'fs/promises';
import path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServerConfig {
  readonly url: string;
  readonly name: string;
  readonly priority: number;
  readonly timeoutMs: number;
}

export interface LicenseResult {
  readonly valid: boolean;
  readonly tier: string;
  readonly expiresAt?: string;
  readonly serverUsed: string;
  readonly verifiedAt: string;
}

export interface OfflineGraceResult {
  readonly allowed: boolean;
  readonly remainingMs: number;
  readonly lastVerifiedAt: string | null;
  readonly cachedTier: string | null;
}

export interface HealthCheckResult {
  readonly healthy: boolean;
  readonly latencyMs: number;
  readonly error?: string;
}

interface ServerStatusEntry {
  readonly url: string;
  readonly healthy: boolean;
  readonly lastCheck: string;
  readonly avgLatency: number;
}

export interface ServerStatusReport {
  readonly servers: ReadonlyArray<ServerStatusEntry>;
}

interface LicenseCache {
  readonly verifiedAt: string;
  readonly tier: string;
  readonly expiresAt?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OFFLINE_GRACE_MS = 24 * 60 * 60 * 1000; // 24시간
const CACHE_FILE_NAME = 'license-cache.json';
const DEFAULT_HEALTH_TIMEOUT_MS = 3000;
const MAX_LATENCY_SAMPLES = 10;

// ---------------------------------------------------------------------------
// Internal state (immutable-style — replaced, never mutated)
// ---------------------------------------------------------------------------

let healthHistory: ReadonlyMap<string, ReadonlyArray<HealthCheckResult>> = new Map();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getUserDataPath(): string {
  try {
     
    const { app } = require('electron');
    if (app && typeof app.getPath === 'function') {
      return app.getPath('userData');
    }
  } catch {
    // Electron이 아닌 환경 — 폴백
  }

  const fallback =
    process.env.APPDATA ??
    process.env.HOME ??
    process.env.USERPROFILE ??
    '.';
  return path.join(fallback, 'better-life-naver');
}

function getCachePath(): string {
  return path.join(getUserDataPath(), CACHE_FILE_NAME);
}

function sortByPriority(servers: ReadonlyArray<ServerConfig>): ReadonlyArray<ServerConfig> {
  return [...servers].sort((a, b) => a.priority - b.priority);
}

async function ensureCacheDir(): Promise<void> {
  const dir = path.dirname(getCachePath());
  await fs.mkdir(dir, { recursive: true });
}

// ---------------------------------------------------------------------------
// Server list builder
// ---------------------------------------------------------------------------

export function buildServerList(
  primaryUrl?: string,
  fallbackUrl?: string,
): ReadonlyArray<ServerConfig> {
  const servers: ServerConfig[] = [];

  const primary =
    primaryUrl ??
    process.env.LICENSE_PRIMARY_URL ??
    process.env.LICENSE_SERVER_URL;

  if (primary) {
    servers.push({
      url: primary,
      name: 'primary-gas',
      priority: 1,
      timeoutMs: 10_000,
    });
  }

  const fallback = fallbackUrl ?? process.env.LICENSE_FALLBACK_URL;

  if (fallback) {
    servers.push({
      url: fallback,
      name: 'fallback-1',
      priority: 2,
      timeoutMs: 8_000,
    });
  }

  return servers;
}

// ---------------------------------------------------------------------------
// Core: verifyWithFallback
// ---------------------------------------------------------------------------

export async function verifyWithFallback(
  code: string,
  deviceId: string,
  servers: ReadonlyArray<ServerConfig>,
): Promise<LicenseResult> {
  const sorted = sortByPriority(servers);
  const errors: Array<{ server: string; error: string }> = [];

  for (const server of sorted) {
    try {
      const result = await verifySingleServer(code, deviceId, server);
      // 성공 시 캐시 저장 (fire-and-forget)
      saveVerificationSuccess(result).catch((err) =>
        console.error('[LicenseFallback] 캐시 저장 실패:', err),
      );
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ server: server.name, error: message });
      console.warn(
        `[LicenseFallback] ${server.name} 실패: ${message}`,
      );
    }
  }

  // 모든 서버 실패 → 오프라인 그레이스 체크
  console.warn(
    '[LicenseFallback] 모든 서버 실패, 오프라인 그레이스 확인 중...',
  );
  const grace = await checkOfflineGrace();

  if (grace.allowed && grace.cachedTier) {
    return {
      valid: true,
      tier: grace.cachedTier,
      serverUsed: 'offline-grace',
      verifiedAt: grace.lastVerifiedAt ?? new Date().toISOString(),
    };
  }

  const serverNames = errors.map((e) => `${e.server}: ${e.error}`).join('; ');
  throw new Error(
    `모든 라이선스 서버 검증 실패 (${serverNames}). 오프라인 그레이스도 만료됨.`,
  );
}

// ---------------------------------------------------------------------------
// Single server verification
// ---------------------------------------------------------------------------

async function verifySingleServer(
  code: string,
  deviceId: string,
  server: ServerConfig,
): Promise<LicenseResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), server.timeoutMs);

  try {
    const response = await fetch(server.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'verify',
        licenseCode: code,
        deviceId,
      }),
      signal: controller.signal,
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (!data || typeof data.success === 'undefined') {
      throw new Error('서버 응답 형식 오류');
    }

    if (!data.success) {
      throw new Error(data.message ?? '라이선스 검증 실패');
    }

    return {
      valid: true,
      tier: data.licenseType ?? data.tier ?? 'standard',
      expiresAt: data.expiresAt,
      serverUsed: server.name,
      verifiedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Offline grace
// ---------------------------------------------------------------------------

export async function checkOfflineGrace(): Promise<OfflineGraceResult> {
  try {
    const raw = await fs.readFile(getCachePath(), 'utf-8');
    const cache: LicenseCache = JSON.parse(raw);

    if (!cache.verifiedAt) {
      return { allowed: false, remainingMs: 0, lastVerifiedAt: null, cachedTier: null };
    }

    const elapsed = Date.now() - new Date(cache.verifiedAt).getTime();
    const remaining = OFFLINE_GRACE_MS - elapsed;

    if (remaining > 0) {
      return {
        allowed: true,
        remainingMs: remaining,
        lastVerifiedAt: cache.verifiedAt,
        cachedTier: cache.tier,
      };
    }

    return {
      allowed: false,
      remainingMs: 0,
      lastVerifiedAt: cache.verifiedAt,
      cachedTier: cache.tier,
    };
  } catch {
    // 캐시 파일이 없거나 파싱 실패
    return { allowed: false, remainingMs: 0, lastVerifiedAt: null, cachedTier: null };
  }
}

// ---------------------------------------------------------------------------
// Cache persistence
// ---------------------------------------------------------------------------

export async function saveVerificationSuccess(
  result: LicenseResult,
): Promise<void> {
  await ensureCacheDir();

  const cache: LicenseCache = {
    verifiedAt: result.verifiedAt,
    tier: result.tier,
    expiresAt: result.expiresAt,
  };

  await fs.writeFile(getCachePath(), JSON.stringify(cache, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

export async function healthCheck(
  serverUrl: string,
  timeoutMs: number = DEFAULT_HEALTH_TIMEOUT_MS,
): Promise<HealthCheckResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  try {
    const response = await fetch(serverUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'health' }),
      signal: controller.signal,
      redirect: 'follow',
    });

    const latencyMs = Date.now() - start;

    if (!response.ok) {
      const result: HealthCheckResult = {
        healthy: false,
        latencyMs,
        error: `HTTP ${response.status}`,
      };
      recordHealthResult(serverUrl, result);
      return result;
    }

    const result: HealthCheckResult = { healthy: true, latencyMs };
    recordHealthResult(serverUrl, result);
    return result;
  } catch (err) {
    const latencyMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    const result: HealthCheckResult = {
      healthy: false,
      latencyMs,
      error: message,
    };
    recordHealthResult(serverUrl, result);
    return result;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Health history tracking (immutable replacement)
// ---------------------------------------------------------------------------

function recordHealthResult(url: string, result: HealthCheckResult): void {
  const existing = healthHistory.get(url) ?? [];
  const updated = [...existing, result].slice(-MAX_LATENCY_SAMPLES);

  const next = new Map(healthHistory);
  next.set(url, updated);
  healthHistory = next;
}

// ---------------------------------------------------------------------------
// Server status report
// ---------------------------------------------------------------------------

export function getServerStatus(): ServerStatusReport {
  const servers: ServerStatusEntry[] = [];

  for (const [url, results] of healthHistory) {
    if (results.length === 0) continue;

    const latest = results[results.length - 1];
    const avgLatency =
      results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length;

    servers.push({
      url,
      healthy: latest.healthy,
      lastCheck: new Date().toISOString(),
      avgLatency: Math.round(avgLatency),
    });
  }

  return { servers };
}

// ---------------------------------------------------------------------------
// Reset (테스트용)
// ---------------------------------------------------------------------------

export function _resetHealthHistory(): void {
  healthHistory = new Map();
}
