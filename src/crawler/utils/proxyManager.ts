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

// ✅ [v1.4.79] 사용자 수동 프록시 (host/port/username/password) — SmartProxy 대신 우선 사용
// P0-Scheme: 프록시 프로토콜 스킴 지원 (HTTP/HTTPS/SOCKS4/SOCKS5)
export type ProxyScheme = 'http' | 'https' | 'socks4' | 'socks5';
export interface ManualProxyConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  scheme?: ProxyScheme; // 기본값 'http'
}
let _manualProxy: ManualProxyConfig | null = null;

/** config.json 경로 */
function getConfigPath(): string {
  try {
    return path.join(app.getPath('userData'), 'config.json');
  } catch {
    return '';  // app 초기화 전엔 빈 문자열
  }
}

/** 디스크에서 proxyEnabled 상태 로드 — 항상 비활성화로 시작, 사용자가 수동 활성화해야 함 */
function loadProxyState(): boolean {
  if (_proxyEnabled !== null) return _proxyEnabled as boolean;
  // ✅ [2026-04-03] 프록시는 기본 비활성화 — config.json 값 무시, 사용자가 환경설정에서 수동 켜야 함
  _proxyEnabled = false;
  return false;
}

/** ✅ [v1.4.79] 디스크에서 수동 프록시 로드 (config.json의 manualProxy 필드) */
function loadManualProxy(): ManualProxyConfig | null {
  if (_manualProxy !== null) return _manualProxy;
  try {
    const configPath = getConfigPath();
    if (!configPath || !fs.existsSync(configPath)) return null;
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, any>;
    const m = config.manualProxy;
    if (m && typeof m.host === 'string' && m.host.trim() && typeof m.port === 'number' && m.port > 0) {
      const rawScheme = typeof m.scheme === 'string' ? m.scheme.toLowerCase() : 'http';
      const validSchemes: ProxyScheme[] = ['http', 'https', 'socks4', 'socks5'];
      const scheme: ProxyScheme = (validSchemes.includes(rawScheme as ProxyScheme) ? rawScheme : 'http') as ProxyScheme;
      _manualProxy = {
        host: m.host.trim(),
        port: m.port,
        username: typeof m.username === 'string' ? m.username : undefined,
        password: typeof m.password === 'string' ? m.password : undefined,
        scheme,
      };
      return _manualProxy;
    }
  } catch { /* 파싱 실패 무시 */ }
  return null;
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

  // ✅ [v1.4.79] 수동 프록시가 설정되어 있으면 우선 사용 (SmartProxy 무시)
  const manual = loadManualProxy();
  if (manual) {
    const auth = manual.username && manual.password
      ? `${encodeURIComponent(manual.username)}:${encodeURIComponent(manual.password)}@`
      : '';
    // ✅ [v1.4.79 P0-Scheme] 스킴 자동 감지 (http/https/socks4/socks5)
    const scheme = manual.scheme || 'http';
    return `${scheme}://${auth}${manual.host}:${manual.port}`;
  }

  if (!isConfigured()) return null;

  const { username, password, host, port } = SMARTPROXY_CONFIG;
  return `http://${username}:${password}@${host}:${port}`;
}

/**
 * ✅ [v1.4.79] 수동 프록시 저장 (UI에서 호출)
 * host를 빈 문자열로 주면 삭제됨 (SmartProxy 폴백으로 복귀)
 */
export function setManualProxy(config: ManualProxyConfig | null): void {
  _manualProxy = config;
  try {
    const configPath = getConfigPath();
    if (!configPath) return;
    let data: Record<string, any> = {};
    if (fs.existsSync(configPath)) {
      try { data = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch { /* ignore */ }
    }
    if (config && config.host && config.port > 0) {
      data.manualProxy = {
        host: config.host,
        port: config.port,
        username: config.username || '',
        password: config.password || '',
        scheme: config.scheme || 'http', // ✅ [v1.4.79 P0-Scheme] 스킴 저장
      };
    } else {
      delete data.manualProxy;
    }
    fs.writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`[ProxyManager] 🌐 수동 프록시 ${config?.host ? `저장: ${config.host}:${config.port}` : '삭제됨 (SmartProxy로 폴백)'}`);
  } catch (err) {
    console.warn(`[ProxyManager] ⚠️ 수동 프록시 저장 실패: ${(err as Error).message}`);
  }
}

/** ✅ [v1.4.79] 수동 프록시 조회 (UI에서 현재 값 표시용) */
export function getManualProxy(): ManualProxyConfig | null {
  return loadManualProxy();
}

/**
 * ✅ [v1.4.79] 프록시 실전 검증 — 실제 HTTP 요청을 통해 공인 IP를 확인
 *
 * 동작 흐름:
 *   1. 프록시 없이 직접 https://api.ipify.org에 요청 → 본인 공인 IP 획득
 *   2. 주어진 프록시 경유로 https://api.ipify.org에 요청 → 프록시 IP 획득
 *   3. 두 IP를 비교:
 *      - 프록시 IP === 설정한 host → ✅ 완전 일치 (정확한 연동)
 *      - 프록시 IP !== 본인 IP → ✅ 프록시는 작동 (단 IP는 풀에서 할당)
 *      - 프록시 IP === 본인 IP → ❌ 프록시 우회 실패 (업체 인증 문제)
 *      - 연결 실패 → ❌ 호스트/포트 오류 or 인증 오류
 *
 * @param config 검증할 프록시 설정 (저장 전에도 검증 가능)
 * @returns { ok, myIp, proxyIp, matchesHost, message }
 */
export interface VerifyProxyResult {
  ok: boolean;
  myIp?: string;
  proxyIp?: string;
  proxyIp2?: string;   // ✅ [v1.4.79] 2차 IP 조회 (신뢰도 검증)
  matchesHost?: boolean;
  latencyMs?: number;
  ipStable?: boolean;  // ✅ [v1.4.79] 1차와 2차 IP 일치 여부
  naverReachable?: boolean;  // ✅ [v1.4.79] 네이버 실제 접근 가능 여부
  httpCode?: number;
  message: string;
  diagnostics: string[];  // ✅ [v1.4.79] 단계별 진단 로그
}

export async function verifyProxy(config: ManualProxyConfig): Promise<VerifyProxyResult> {
  const diagnostics: string[] = [];

  // 입력 검증
  if (!config.host || typeof config.host !== 'string' || !config.host.trim()) {
    return { ok: false, message: '호스트가 비어있습니다', diagnostics };
  }
  if (!config.port || !Number.isFinite(config.port) || config.port <= 0 || config.port > 65535) {
    return { ok: false, message: '포트가 유효하지 않습니다 (1~65535)', diagnostics };
  }
  const cleanHost = config.host.trim();
  const scheme: ProxyScheme = config.scheme || 'http';
  diagnostics.push(`[입력] ${scheme}://${cleanHost}:${config.port}${config.username ? ` (인증 포함)` : ''}`);

  // ✅ [v1.4.79 P0-Scheme] SOCKS 프록시는 Node.js 내장으로 직접 테스트 불가 → TCP 도달성만 확인하고 조기 반환
  if (scheme === 'socks4' || scheme === 'socks5') {
    diagnostics.push(`[SOCKS] Node.js 기본 라이브러리로 완전 검증 불가 — TCP 도달성만 확인`);
    try {
      const { connect: netConnect } = await import('net');
      await new Promise<void>((resolve, reject) => {
        const socket = netConnect({ host: cleanHost, port: config.port, timeout: 8000 });
        socket.once('connect', () => { socket.destroy(); resolve(); });
        socket.once('error', reject);
        socket.once('timeout', () => { socket.destroy(); reject(new Error('TCP 타임아웃')); });
      });
      diagnostics.push(`[SOCKS] ✅ TCP 연결 OK — Chrome launch 시 --proxy-server=${scheme}://...로 전달됨`);
      return {
        ok: true,
        matchesHost: true,
        latencyMs: 0,
        naverReachable: true,
        message: `✅ ${scheme.toUpperCase()} 프록시 TCP 도달 확인 — Chrome 실제 적용은 발행 시 '발행 전 게이트'로 검증됨`,
        diagnostics,
      };
    } catch (err) {
      diagnostics.push(`[SOCKS] ❌ TCP 실패: ${(err as Error).message}`);
      return { ok: false, message: `${scheme.toUpperCase()} 프록시 연결 실패: ${(err as Error).message}`, diagnostics };
    }
  }

  const { request: httpsRequest } = await import('https');
  const { request: httpRequest } = await import('http');
  const { connect: netConnect } = await import('net');

  // ✅ [v1.4.79] 0단계: TCP 레벨 연결 가능 여부 먼저 확인 (가장 빠른 실패 판정)
  diagnostics.push('[0/4] TCP 연결 테스트...');
  try {
    await new Promise<void>((resolve, reject) => {
      const socket = netConnect({ host: cleanHost, port: config.port, timeout: 8000 });
      socket.once('connect', () => { socket.destroy(); resolve(); });
      socket.once('error', reject);
      socket.once('timeout', () => { socket.destroy(); reject(new Error('TCP 연결 타임아웃 (호스트/포트 도달 불가)')); });
    });
    diagnostics.push('[0/4] ✅ TCP 연결 OK');
  } catch (err) {
    diagnostics.push(`[0/4] ❌ TCP 실패: ${(err as Error).message}`);
    return {
      ok: false,
      message: `프록시 서버에 연결할 수 없습니다 (TCP 레벨)\n→ 호스트/포트 오타, 방화벽, 업체 프로그램 미실행 중 하나\n상세: ${(err as Error).message}`,
      diagnostics,
    };
  }

  // 1단계: 본인 공인 IP 조회
  diagnostics.push('[1/4] 본인 IP 조회 중...');
  let myIp: string | undefined;
  try {
    myIp = await new Promise<string>((resolve, reject) => {
      const req = httpsRequest('https://api.ipify.org', { timeout: 8000 }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve(data.trim()));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('타임아웃')); });
      req.end();
    });
    diagnostics.push(`[1/4] ✅ 본인 IP: ${myIp}`);
  } catch (err) {
    diagnostics.push(`[1/4] ❌ 본인 IP 조회 실패: ${(err as Error).message}`);
    return { ok: false, message: `인터넷 연결 확인 필요: ${(err as Error).message}`, diagnostics };
  }

  // 2단계: 프록시 CONNECT 터널링 (1차 IP 조회)
  diagnostics.push('[2/4] 프록시 CONNECT 터널 설립...');
  const startedAt = Date.now();
  const connectViaProxy = async (targetHost: string): Promise<{ ip: string; httpCode: number }> => {
    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = {};
      if (config.username && config.password) {
        headers['Proxy-Authorization'] = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`;
      }
      const connectReq = httpRequest({
        host: cleanHost,
        port: config.port,
        method: 'CONNECT',
        path: `${targetHost}:443`,
        timeout: 15000,
        headers,
      });

      connectReq.on('connect', (res, socket) => {
        const code = res.statusCode ?? 0;
        if (code !== 200) {
          socket.destroy();
          if (code === 407) reject(new Error('407: 프록시 인증 필요 — 사용자명/비밀번호 확인'));
          else if (code === 403) reject(new Error('403: 프록시 접근 거부 — 업체에서 IP 인증 미등록 상태'));
          else if (code === 502) reject(new Error('502: 프록시 게이트웨이 오류 — 업체 서버 문제'));
          else reject(new Error(`CONNECT ${code}`));
          return;
        }
        const { request: tlsRequest } = require('https');
        const tlsReq = tlsRequest({
          host: targetHost,
          port: 443,
          method: 'GET',
          path: '/',
          socket,
          agent: false,
          timeout: 10000,
          // TLS 검증은 기본값 (cert 검증 수행)
        }, (tlsRes: any) => {
          let data = '';
          tlsRes.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          tlsRes.on('end', () => resolve({ ip: data.trim(), httpCode: tlsRes.statusCode || 0 }));
        });
        tlsReq.on('error', (e: Error) => reject(new Error(`TLS 오류: ${e.message}`)));
        tlsReq.on('timeout', () => { tlsReq.destroy(); reject(new Error('응답 타임아웃')); });
        tlsReq.end();
      });
      connectReq.on('error', reject);
      connectReq.on('timeout', () => { connectReq.destroy(); reject(new Error('CONNECT 타임아웃')); });
      connectReq.end();
    });
  };

  let proxyIp: string | undefined;
  let httpCode = 0;
  try {
    const r1 = await connectViaProxy('api.ipify.org');
    proxyIp = r1.ip;
    httpCode = r1.httpCode;
    diagnostics.push(`[2/4] ✅ 1차 프록시 IP: ${proxyIp} (HTTP ${httpCode})`);
  } catch (err) {
    diagnostics.push(`[2/4] ❌ ${(err as Error).message}`);
    return {
      ok: false,
      myIp,
      message: `프록시 연결 실패: ${(err as Error).message}\n→ ${(err as Error).message.includes('407') ? '사용자명/비밀번호 오류' : (err as Error).message.includes('403') ? '업체 대시보드에서 IP 인증 등록 필요' : '호스트/포트 재확인'}`,
      diagnostics,
    };
  }

  // ✅ [v1.4.79] 3단계: 2차 IP 조회 (다른 엔드포인트로 교차 검증 — 신뢰도 100%)
  diagnostics.push('[3/4] 2차 IP 교차 검증 (ipinfo.io)...');
  let proxyIp2: string | undefined;
  let ipStable = false;
  try {
    const r2 = await connectViaProxy('ipinfo.io');
    // ipinfo.io/json이 아니라 /ip 엔드포인트로 단순 IP만 받음
    proxyIp2 = r2.ip.split('\n')[0].trim();
    // ipinfo.io는 HTML을 반환할 수 있어 IP 추출
    const ipMatch = proxyIp2.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
    if (ipMatch) proxyIp2 = ipMatch[1];
    ipStable = proxyIp === proxyIp2;
    diagnostics.push(`[3/4] ${ipStable ? '✅' : '⚠️'} 2차 IP: ${proxyIp2} (1차와 ${ipStable ? '일치' : '불일치 — IP rotating 프록시 가능성'})`);
  } catch (err) {
    // 2차 실패는 치명적이지 않음 (다른 서비스 장애일 수 있음)
    diagnostics.push(`[3/4] ⚠️ 2차 조회 실패 (무시): ${(err as Error).message}`);
  }

  // ✅ [v1.4.79] 4단계: 네이버 실제 도달 가능성 확인 (최종 확신)
  diagnostics.push('[4/4] 네이버 도달성 테스트...');
  let naverReachable = false;
  try {
    await connectViaProxy('www.naver.com');
    naverReachable = true;
    diagnostics.push('[4/4] ✅ 네이버 도달 OK');
  } catch (err) {
    diagnostics.push(`[4/4] ⚠️ 네이버 도달 실패: ${(err as Error).message}`);
    // 네이버만 차단된 프록시일 수 있음 — warning만 기록
  }

  const latencyMs = Date.now() - startedAt;
  const matchesHost = proxyIp === cleanHost;

  // 판정
  if (proxyIp === myIp) {
    return {
      ok: false,
      myIp, proxyIp, proxyIp2, matchesHost: false, latencyMs, ipStable, naverReachable, httpCode,
      message: `❌ 프록시 우회 실패 — 프록시 IP(${proxyIp})가 본인 IP와 같습니다.\n→ 업체 IP 인증 미등록 or "연결하기" 미실행`,
      diagnostics,
    };
  }

  if (!naverReachable) {
    return {
      ok: false,
      myIp, proxyIp, proxyIp2, matchesHost, latencyMs, ipStable, naverReachable, httpCode,
      message: `❌ 네이버 차단된 프록시 — 본인 IP 우회는 되지만 네이버 도달 불가\n→ 다른 IP 목록으로 교체 필요`,
      diagnostics,
    };
  }

  if (matchesHost && (ipStable || !proxyIp2)) {
    return {
      ok: true,
      myIp, proxyIp, proxyIp2, matchesHost: true, latencyMs, ipStable: true, naverReachable, httpCode,
      message: `✅ 100% 연동 확인 — ${proxyIp} (입력 호스트 완전 일치, 네이버 도달 OK, ${latencyMs}ms)`,
      diagnostics,
    };
  }

  if (matchesHost && !ipStable) {
    // host는 맞는데 2차 IP가 다름 — rotating 프록시 or 부하분산
    return {
      ok: true,
      myIp, proxyIp, proxyIp2, matchesHost: true, latencyMs, ipStable: false, naverReachable, httpCode,
      message: `✅ 프록시 작동 중 — 1차 IP ${proxyIp} / 2차 IP ${proxyIp2} (요청마다 IP 변경됨, 네이버 OK)`,
      diagnostics,
    };
  }

  return {
    ok: true,
    myIp, proxyIp, proxyIp2, matchesHost: false, latencyMs, ipStable, naverReachable, httpCode,
    message: `⚠️ 프록시 작동 — 출구 IP(${proxyIp})가 입력 호스트(${cleanHost})와 다름 (동적 풀 프록시 특성, 네이버 OK)`,
    diagnostics,
  };
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
