/**
 * SmartProxy 유료 프록시 매니저
 * @module crawler/utils/proxyManager
 * 
 * ✅ [2026-03-16] SmartProxy Residential Proxy 연동
 * ✅ [2026-03-27] 자격증명 환경변수 분리 + 상태 영속화
 * - 개발자가 월 구독 → 모든 사용자가 주거용 IP로 크롤링
 * - 요청마다 자동으로 다른 IP 할당 (Rotating Proxy)
 * - 네이버/쿠팡 등 IP 차단 우회
 * - 블로그 자동화(로그인/발행)에서는 사용하지 않음 (직접 연결)
 */
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

// ═══════════════════════════════════════════════════
// SmartProxy 설정 — 환경변수 우선, 기본값 폴백
// ═══════════════════════════════════════════════════
const SMARTPROXY_CONFIG = {
  host: process.env.SMARTPROXY_HOST || 'gate.decodo.com',
  port: parseInt(process.env.SMARTPROXY_PORT || '10001', 10),
  username: process.env.SMARTPROXY_USER || 'user-sproqjsqtg-country-kr',
  password: process.env.SMARTPROXY_PASS || 'tT3=bhH71lailX8bWj',
};

// ═══════════════════════════════════════════════════
// 상태 (영속화: config 파일에서 복원)
// ═══════════════════════════════════════════════════

let _proxyEnabled: boolean | null = null;  // null = 아직 로드 안 됨

/** config.json 경로 */
function getConfigPath(): string {
  try {
    return path.join(app.getPath('userData'), 'config.json');
  } catch {
    return '';  // app 초기화 전엔 빈 문자열
  }
}

/** 디스크에서 proxyEnabled 상태 로드 (최초 1회) */
function loadProxyState(): boolean {
  if (_proxyEnabled !== null) return _proxyEnabled as boolean;
  try {
    const configPath = getConfigPath();
    if (configPath && fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (typeof config.proxyEnabled === 'boolean') {
        _proxyEnabled = config.proxyEnabled;
        return _proxyEnabled as boolean;
      }
    }
  } catch { /* 파일 읽기 실패 시 기본값 사용 */ }
  _proxyEnabled = true;
  return _proxyEnabled as boolean;
}

/** 디스크에 proxyEnabled 상태 저장 */
function saveProxyState(enabled: boolean): void {
  try {
    const configPath = getConfigPath();
    if (!configPath) return;
    let config: Record<string, any> = {};
    try {
      if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      }
    } catch { /* 파싱 실패 시 빈 객체로 시작 */ }
    config.proxyEnabled = enabled;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err) {
    console.warn(`[ProxyManager] ⚠️ 프록시 상태 저장 실패: ${(err as Error).message}`);
  }
}

// ═══════════════════════════════════════════════════
// 공개 API
// ═══════════════════════════════════════════════════

/**
 * 프록시 활성/비활성 설정 (영속화됨 — 앱 재시작 후에도 유지)
 */
export function setProxyEnabled(enabled: boolean): void {
  _proxyEnabled = enabled;
  saveProxyState(enabled);
  console.log(`[ProxyManager] 🌐 프록시 ${enabled ? '✅ 활성' : '❌ 비활성'} (저장됨)`);
}

/**
 * 프록시 활성 상태 확인
 */
export function isProxyEnabled(): boolean {
  return loadProxyState();
}

/**
 * SmartProxy 자격증명이 설정되었는지 확인
 */
function isConfigured(): boolean {
  return (
    SMARTPROXY_CONFIG.username.length > 0 &&
    SMARTPROXY_CONFIG.password.length > 0
  );
}

/**
 * 프록시 URL 반환 (--proxy-server 형식)
 * SmartProxy Rotating: 매 요청마다 자동으로 다른 IP
 * 
 * @returns "http://user:pass@gate.smartproxy.com:10001" 또는 null
 */
export async function getProxyUrl(): Promise<string | null> {
  if (!isProxyEnabled()) return null;
  
  if (!isConfigured()) {
    return null;
  }

  const { username, password, host, port } = SMARTPROXY_CONFIG;
  return `http://${username}:${password}@${host}:${port}`;
}

/**
 * 프록시 사용 실패 보고
 */
export function reportProxyFailed(proxyUrl: string): void {
  console.warn(`[ProxyManager] ⚠️ 프록시 요청 실패 (다음 요청 시 자동 IP 변경): ${proxyUrl.replace(/:[^:]+@/, ':***@')}`);
}

/**
 * 프록시 사용 성공 보고
 */
export function reportProxySuccess(proxyUrl: string): void {
  console.log(`[ProxyManager] ✅ 프록시 성공: ${proxyUrl.replace(/:[^:]+@/, ':***@')}`);
}

/**
 * 프록시 상태 조회
 */
export function getPoolStatus(): {
  enabled: boolean;
  configured: boolean;
  provider: string;
  endpoint: string;
} {
  return {
    enabled: isProxyEnabled(),
    configured: isConfigured(),
    provider: 'SmartProxy Residential',
    endpoint: `${SMARTPROXY_CONFIG.host}:${SMARTPROXY_CONFIG.port}`,
  };
}

/**
 * ✅ [2026-03-27] SmartProxy 설정값 조회 (main process 전용)
 * systemHandlers에서 Sticky Session 자동 세팅에 사용
 */
export function getSmartProxyConfig(): {
  host: string;
  port: number;
  username: string;
  password: string;
} {
  return { ...SMARTPROXY_CONFIG };
}
