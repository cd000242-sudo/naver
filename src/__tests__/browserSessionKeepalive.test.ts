/**
 * ✅ [v1.4.78] 브라우저 세션 keep-alive 회귀 방지
 *
 * 목적:
 *   - SESSION_MAX_AGE가 사실상 무한(Number.MAX_SAFE_INTEGER)으로 유지되는지 검증
 *   - startKeepalive / stopKeepalive / runKeepalivePing 메서드 존재 검증
 *   - keep-alive 인터벌 설정값(15분 ± 2분 지터) 범위 검증
 *   - 첫 세션 생성 시 자동으로 startKeepalive() 호출 여부
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const FILE = path.resolve(__dirname, '../browserSessionManager.ts');
const code = fs.readFileSync(FILE, 'utf-8');

describe('v1.4.78 — 브라우저 세션 keep-alive', () => {
  describe('SESSION_MAX_AGE 무한화', () => {
    it("SESSION_MAX_AGE가 Number.MAX_SAFE_INTEGER (무기한)", () => {
      expect(code).toMatch(/SESSION_MAX_AGE\s*=\s*Number\.MAX_SAFE_INTEGER/);
    });

    it("이전 4시간 하드 상한이 제거됨", () => {
      // 4 * 60 * 60 * 1000 = 14400000 패턴이 SESSION_MAX_AGE 라인에 없어야 함
      expect(code).not.toMatch(/SESSION_MAX_AGE\s*=\s*4\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
    });
  });

  describe('Keep-alive 설정값', () => {
    it("KEEPALIVE_INTERVAL_MS는 15분 (900,000ms)", () => {
      expect(code).toMatch(/KEEPALIVE_INTERVAL_MS\s*=\s*15\s*\*\s*60\s*\*\s*1000/);
    });

    it("KEEPALIVE_JITTER_MS는 5분 (v1.4.79에서 2분→5분 확대)", () => {
      expect(code).toMatch(/KEEPALIVE_JITTER_MS\s*=\s*5\s*\*\s*60\s*\*\s*1000/);
    });

    it("keepaliveTimer 싱글톤 필드 존재 (중복 실행 방지)", () => {
      expect(code).toMatch(/keepaliveTimer:\s*NodeJS\.Timeout\s*\|\s*null/);
    });
  });

  describe('필수 메서드 존재', () => {
    it("startKeepalive 메서드 존재", () => {
      expect(code).toMatch(/startKeepalive\(\):\s*void/);
    });

    it("stopKeepalive 메서드 존재", () => {
      expect(code).toMatch(/stopKeepalive\(\):\s*void/);
    });

    it("runKeepalivePing 프라이빗 메서드 존재", () => {
      expect(code).toMatch(/private\s+async\s+runKeepalivePing/);
    });

    it("중복 실행 방지 가드 (이미 실행 중이면 skip)", () => {
      expect(code).toMatch(/Keep-alive 이미 실행 중/);
    });
  });

  describe('자동 시작 / 종료 연결', () => {
    it("첫 세션 생성 직후 startKeepalive() 자동 호출", () => {
      // v1.4.79: sessions.set 이후 쿠키 복원 추가됨, startKeepalive는 그 뒤
      expect(code).toMatch(/this\.sessions\.set\(accountId[\s\S]{0,1500}?this\.startKeepalive\(\)/);
    });

    it("closeAllSessions에서 stopKeepalive() 먼저 호출", () => {
      expect(code).toMatch(/closeAllSessions[\s\S]{0,300}?this\.stopKeepalive\(\)/);
    });
  });

  describe('ping 전략', () => {
    it("ping은 네이버 도메인(nid.naver.com)으로 fetch", () => {
      expect(code).toMatch(/nid\.naver\.com/);
    });

    it("credentials: 'include' — 쿠키 포함하여 서버측 TTL 리셋", () => {
      expect(code).toMatch(/credentials:\s*['"]include['"]/);
    });

    it("세션 간 ping은 계정 수 비례 랜덤 간격 (v1.4.79: min=5초, N계정이면 N*3초 이상)", () => {
      expect(code).toMatch(/Math\.max\(5000,\s*accountIds\.length\s*\*\s*3000\)/);
    });

    it("ping 실패 시 loginVerifiedAt을 0으로 리셋 (다음 발행에서 재검증 트리거)", () => {
      expect(code).toMatch(/session\.loginVerifiedAt\s*=\s*0/);
    });
  });

  describe('쿠키 자동 저장 (앱 재시작 복원용)', () => {
    it("keep-alive 성공 시 saveCookies 자동 호출", () => {
      expect(code).toMatch(/saveCookies\(session\.page,\s*accountId\)/);
    });
  });
});
