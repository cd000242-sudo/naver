/**
 * ✅ [v1.4.78] 다중계정 세션 잠금 회귀 방지
 *
 * 목적:
 *   - 첫 캡차 해제 후 setLoggedIn(id, true)가 자동으로 locked=true 설정
 *   - 잠긴 세션은 SESSION_MAX_AGE / LOGIN_CACHE_TTL 체크 우회
 *   - keep-alive 실패 시 잠긴 세션은 쿠키 복원 시도, 삭제되지 않음
 *   - 잠긴 세션은 추가로 blog.naver.com도 ping (쿠키 갱신 이중화)
 *
 * 사용자 요구: 다중계정 발행 시 최초만 캡차 풀고 앱 종료 전까지 유지
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const FILE = path.resolve(__dirname, '../browserSessionManager.ts');
const code = fs.readFileSync(FILE, 'utf-8');

describe('v1.4.78 — 다중계정 세션 잠금', () => {
  describe('SessionInfo 스키마에 locked 필드 추가', () => {
    it("locked: boolean 필드 선언", () => {
      expect(code).toMatch(/locked:\s*boolean;/);
    });

    it("lockedAt: number 필드 선언 (잠금 시각 기록)", () => {
      expect(code).toMatch(/lockedAt:\s*number;/);
    });

    it("세션 초기값에서 locked=false, lockedAt=0", () => {
      expect(code).toMatch(/locked:\s*false,[\s\S]{0,100}?lockedAt:\s*0/);
    });
  });

  describe('자동 잠금 (setLoggedIn true)', () => {
    it("setLoggedIn(true) 시 locked=true 자동 설정", () => {
      expect(code).toMatch(/if\s*\(isLoggedIn\s*&&\s*!session\.locked\)[\s\S]{0,200}?session\.locked\s*=\s*true/);
    });

    it("자동 잠금 로그 메시지 (앱 종료까지 유지)", () => {
      expect(code).toMatch(/세션 잠금.*앱 종료까지 유지/);
    });
  });

  describe('명시적 lock/unlock API', () => {
    it("lockSession 메서드 존재", () => {
      expect(code).toMatch(/lockSession\(accountId:\s*string\):\s*void/);
    });

    it("unlockSession 메서드 존재", () => {
      expect(code).toMatch(/unlockSession\(accountId:\s*string\):\s*void/);
    });

    it("isSessionLocked 조회 메서드 존재", () => {
      expect(code).toMatch(/isSessionLocked\(accountId:\s*string\):\s*boolean/);
    });
  });

  describe('SESSION_MAX_AGE 우회 (잠긴 세션 강제 재사용)', () => {
    it("잠긴 세션은 sessionAge 체크 건너뜀", () => {
      expect(code).toMatch(/!existingSession\.locked\s*&&\s*sessionAge\s*>\s*this\.SESSION_MAX_AGE/);
    });
  });

  describe('isAccountLoggedIn TTL 우회', () => {
    it("잠긴 세션은 LOGIN_CACHE_TTL 체크 생략", () => {
      expect(code).toMatch(/if\s*\(session\.locked\)\s*\{[\s\S]{0,100}?return\s+true/);
    });
  });

  describe('Keep-alive 강화 — 잠긴 세션 우대', () => {
    it("URL 풀에 blog.naver.com 포함 (v1.4.79에서 단일 URL 고정 → 풀 랜덤 선택으로 변경)", () => {
      // v1.4.79: KEEPALIVE_URL_POOL에 blog.naver.com 포함되어 랜덤 선택됨
      expect(code).toMatch(/KEEPALIVE_URL_POOL[\s\S]{0,500}?'https:\/\/blog\.naver\.com\/'/);
    });

    it("잠긴 세션 ping 실패 시 restoreCookies로 자동 복원", () => {
      expect(code).toMatch(/session\.locked[\s\S]{0,400}?restoreCookies/);
    });

    it("잠긴 세션은 실패해도 세션 삭제 안 함 (복원만 시도)", () => {
      // 복원 성공 메시지 존재
      expect(code).toMatch(/쿠키 복원 성공/);
      // 잠긴 세션 경로에 sessions.delete 호출 없음
      const keepaliveBlock = code.match(/runKeepalivePing[\s\S]{0,3000}/)?.[0] || '';
      const lockedBranch = keepaliveBlock.match(/session\.locked[\s\S]{0,600}/)?.[0] || '';
      expect(lockedBranch).not.toMatch(/this\.sessions\.delete/);
    });
  });

  describe('기존 keep-alive 기능은 여전히 유지', () => {
    it("SESSION_MAX_AGE는 여전히 Number.MAX_SAFE_INTEGER (v1.4.78 앞 단계)", () => {
      expect(code).toMatch(/SESSION_MAX_AGE\s*=\s*Number\.MAX_SAFE_INTEGER/);
    });

    it("KEEPALIVE_INTERVAL_MS 15분 유지", () => {
      expect(code).toMatch(/KEEPALIVE_INTERVAL_MS\s*=\s*15\s*\*\s*60\s*\*\s*1000/);
    });
  });

  describe('다중계정 실전 시나리오', () => {
    it("시나리오: A/B/C 계정 모두 첫 로그인 후 auto-lock → keep-alive 대상", () => {
      // setLoggedIn(true)가 auto-lock하는 로직이 전체 경로에 단 1개만 있어야 함 (SSOT)
      const matches = code.match(/if\s*\(isLoggedIn\s*&&\s*!session\.locked\)/g) || [];
      expect(matches.length).toBe(1);
    });

    it("시나리오: 앱 종료 시 stopKeepalive 먼저 호출 후 closeAllSessions", () => {
      expect(code).toMatch(/closeAllSessions[\s\S]{0,200}?this\.stopKeepalive\(\)/);
    });
  });
});
