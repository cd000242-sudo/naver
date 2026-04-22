/**
 * ✅ [v1.4.79 P0] 프록시 100% 보장 강화 — WebRTC 차단 + 게이트 + SOCKS 지원 회귀 방지
 *
 * 이전 "95% 보장"에서 빠뜨린 3개 핵심 수정:
 *   P0-WebRTC: Chrome launch arg + JS 레벨 RTCPeerConnection 차단 (실제 IP 노출 경로 봉쇄)
 *   P0-Gate:   enforceProxyAppliedOrThrow — 발행 전 Chrome 내부 IP 검증 강제
 *   P0-Scheme: HTTP/HTTPS/SOCKS4/SOCKS5 스킴 지원
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

describe('v1.4.79 P0 — 프록시 100% 보장 강화', () => {
  describe('P0-WebRTC: 실제 IP 누출 차단', () => {
    const code = read('browserSessionManager.ts');

    it('Chrome launch arg에 --force-webrtc-ip-handling-policy 추가', () => {
      expect(code).toMatch(/--force-webrtc-ip-handling-policy=disable_non_proxied_udp/);
    });

    it('WebRtcHideLocalIpsWithMdns 비활성화', () => {
      expect(code).toMatch(/--disable-features=WebRtcHideLocalIpsWithMdns/);
    });

    it('JS 레벨 RTCPeerConnection 덮어쓰기 스텁 존재', () => {
      expect(code).toMatch(/window as any\)\.RTCPeerConnection\s*=\s*FakePC/);
    });

    it('webkitRTCPeerConnection, mozRTCPeerConnection도 차단', () => {
      expect(code).toMatch(/webkitRTCPeerConnection\s*=\s*FakePC/);
      expect(code).toMatch(/mozRTCPeerConnection\s*=\s*FakePC/);
    });

    it('mediaDevices.enumerateDevices가 빈 배열 반환하도록 스텁', () => {
      expect(code).toMatch(/enumerateDevices\s*=\s*\(\)\s*=>\s*Promise\.resolve\(\[\]\)/);
    });
  });

  describe('P0-Gate: 발행 전 Chrome 내부 IP 강제 검증', () => {
    const code = read('browserSessionManager.ts');

    it('enforceProxyAppliedOrThrow 메서드 존재', () => {
      expect(code).toMatch(/async\s+enforceProxyAppliedOrThrow\(accountId:\s*string,\s*expectedHost\?:\s*string\)/);
    });

    it('프록시 OFF면 게이트 스킵 (false-positive 방지)', () => {
      expect(code).toMatch(/if\s*\(!isProxyEnabled\(\)\)[\s\S]{0,200}?게이트 스킵/);
    });

    it('IP 불일치 시 throw (발행 차단)', () => {
      expect(code).toMatch(/actualIp\s*===\s*targetHost[\s\S]{0,600}?throw new Error/);
    });

    it('SmartProxy rotating(동적 풀)은 IP 매칭 스킵', () => {
      expect(code).toMatch(/IP 매칭 스킵/);
    });
  });

  describe('P0-Scheme: HTTP/HTTPS/SOCKS 지원', () => {
    const code = read('crawler/utils/proxyManager.ts');

    it('ProxyScheme 타입 정의 (4종)', () => {
      expect(code).toMatch(/export type ProxyScheme\s*=\s*'http'\s*\|\s*'https'\s*\|\s*'socks4'\s*\|\s*'socks5'/);
    });

    it('ManualProxyConfig에 scheme 필드', () => {
      expect(code).toMatch(/scheme\?:\s*ProxyScheme/);
    });

    it('getProxyUrl이 스킴별 URL 생성 (http:///https:///socks5://)', () => {
      expect(code).toMatch(/\$\{scheme\}:\/\/\$\{auth\}\$\{manual\.host\}:\$\{manual\.port\}/);
    });

    it('verifyProxy가 SOCKS4/SOCKS5는 TCP 도달성만 확인 (조기 반환)', () => {
      expect(code).toMatch(/scheme\s*===\s*'socks4'\s*\|\|\s*scheme\s*===\s*'socks5'/);
    });

    it('setManualProxy 저장 시 scheme 필드 함께 저장', () => {
      expect(code).toMatch(/scheme:\s*config\.scheme\s*\|\|\s*'http'/);
    });

    it('loadManualProxy가 유효하지 않은 scheme은 http로 폴백', () => {
      expect(code).toMatch(/validSchemes\.includes\(rawScheme as ProxyScheme\)\s*\?\s*rawScheme\s*:\s*'http'/);
    });
  });

  describe('UI 연결 — preload / settingsModal', () => {
    const preload = read('preload.ts');
    const settingsModal = read('renderer/utils/settingsModal.ts');

    it('preload에 enforceProxyGate API 노출', () => {
      expect(preload).toMatch(/enforceProxyGate:\s*\(accountId:\s*string,\s*expectedHost\?:\s*string\)/);
    });

    it('settingsModal이 scheme select 값을 저장 시 전달', () => {
      expect(settingsModal).toMatch(/scheme:\s*\(manualSchemeSelect\?\.value\s*\|\|\s*'http'\)/);
    });

    it('settingsModal이 verify 호출 시 scheme 포함', () => {
      expect(settingsModal).toMatch(/verifyProxy\?\.\([\s\S]{0,300}?scheme:\s*manualSchemeSelect\?\.value/);
    });
  });

  describe('통합 — verifyProxy 결과 타입에 diagnostics 포함', () => {
    const code = read('crawler/utils/proxyManager.ts');

    it('VerifyProxyResult에 diagnostics 배열 포함', () => {
      expect(code).toMatch(/diagnostics:\s*string\[\]/);
    });

    it('4단계 진단: TCP/본인IP/프록시IP/네이버도달', () => {
      expect(code).toMatch(/\[0\/4\] TCP 연결 테스트/);
      expect(code).toMatch(/\[1\/4\] 본인 IP 조회 중/);
      expect(code).toMatch(/\[2\/4\] 프록시 CONNECT 터널/);
      expect(code).toMatch(/\[4\/4\] 네이버 도달성 테스트/);
    });

    it('407 (인증 필요) 에러 구체 메시지', () => {
      expect(code).toMatch(/407:\s*프록시 인증 필요/);
    });

    it('403 (IP 인증 미등록) 에러 구체 메시지', () => {
      expect(code).toMatch(/403:\s*프록시 접근 거부.*IP 인증 미등록/);
    });
  });
});
