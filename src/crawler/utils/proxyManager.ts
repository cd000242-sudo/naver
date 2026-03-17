/**
 * SmartProxy 유료 프록시 매니저
 * @module crawler/utils/proxyManager
 * 
 * ✅ [2026-03-16] SmartProxy Residential Proxy 연동
 * - 개발자가 월 구독 → 모든 사용자가 주거용 IP로 크롤링
 * - 요청마다 자동으로 다른 IP 할당 (Rotating Proxy)
 * - 성공률 99%+ (주거용 IP = 실제 가정용 인터넷)
 * - 네이버/쿠팡 등 IP 차단 우회
 */

// ═══════════════════════════════════════════════════
// SmartProxy 설정
// ═══════════════════════════════════════════════════

/**
 * SmartProxy 자격증명
 * 가입: https://smartproxy.com → Residential Proxies 구독
 * Dashboard → Proxy Setup → Username/Password 확인
 */
const SMARTPROXY_CONFIG = {
  host: 'gate.decodo.com',
  port: 10001,
  username: 'user-sproqjsqtg-country-kr',
  password: 'tT3=bhH71lailX8bWj',
};

// ═══════════════════════════════════════════════════
// 상태
// ═══════════════════════════════════════════════════

let _proxyEnabled = true;  // ✅ 유료 프록시 = 기본 활성

// ═══════════════════════════════════════════════════
// 공개 API
// ═══════════════════════════════════════════════════

/**
 * 프록시 활성/비활성 설정
 */
export function setProxyEnabled(enabled: boolean): void {
  _proxyEnabled = enabled;
  console.log(`[ProxyManager] 🌐 프록시 ${enabled ? '✅ 활성' : '❌ 비활성'}`);
}

/**
 * 프록시 활성 상태 확인
 */
export function isProxyEnabled(): boolean {
  return _proxyEnabled;
}

/**
 * SmartProxy 자격증명이 설정되었는지 확인
 */
function isConfigured(): boolean {
  return (
    SMARTPROXY_CONFIG.username !== 'SMARTPROXY_USER' &&
    SMARTPROXY_CONFIG.password !== 'SMARTPROXY_PASS' &&
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
  if (!_proxyEnabled) return null;
  
  if (!isConfigured()) {
    // 자격증명 미설정 시 프록시 없이 진행 (경고만)
    return null;
  }

  const { username, password, host, port } = SMARTPROXY_CONFIG;
  return `http://${username}:${password}@${host}:${port}`;
}

/**
 * 프록시 사용 실패 보고
 * SmartProxy는 자동 로테이션이므로 별도 처리 불필요
 * (로깅만 수행)
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
    enabled: _proxyEnabled,
    configured: isConfigured(),
    provider: 'SmartProxy Residential',
    endpoint: `${SMARTPROXY_CONFIG.host}:${SMARTPROXY_CONFIG.port}`,
  };
}
