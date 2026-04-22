/**
 * ✅ [v1.4.79] Keep-alive 18건 결함 교정 회귀 방지 매트릭스
 *
 * 10명 에이전트(Opus 메인 + 9 Sonnet)가 합의한 결함 전부 봉쇄:
 *
 * CRITICAL
 * - D1: closeSession locked 보호 (force 플래그)
 * - D2: 리다이렉트 감지로 서버 세션 만료 판정
 * - R-01/Bug 1: Ping URL 풀 (www.naver.com/blog.naver.com/nid API)
 *
 * HIGH
 * - Bug 2: try/finally로 루프 영구 사망 방지
 * - Bug 3: ensureServerSession 발행 직전 gate
 * - Bug 4: restoreCookies 반환값 확인
 * - Bug 5: Chrome throttle 플래그 3개
 * - Bug 6: 복원 성공 시 isLoggedIn=true 동기화
 * - Bug 7: setLoggedIn(false) 시 locked 해제
 * - Bug 8: closeAllSessions에서 isPinging 대기
 * - Bug 9: 프록시 변경 closeSession(force=true)
 *
 * MEDIUM
 * - Bug 10: activeAccountId === ping skip (경쟁 방지)
 * - Bug 12: page.isClosed() 시 newPage 재생성
 * - Bug R-04: 지터 ±5분 확대
 * - Bug R-05: 15% skip 확률
 * - Bug S9: 신규 세션 생성 시 쿠키 자동 복원
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const FILE = path.resolve(__dirname, '../browserSessionManager.ts');
const code = fs.readFileSync(FILE, 'utf-8');

describe('v1.4.79 — 18건 결함 봉쇄 (Opus+9 Sonnet 합의)', () => {
  describe('D1: closeSession locked 보호', () => {
    it("closeSession이 force 파라미터 지원", () => {
      expect(code).toMatch(/closeSession\(accountId:\s*string,\s*force:\s*boolean\s*=\s*false\)/);
    });

    it("locked=true && !force면 session.delete 건너뜀", () => {
      expect(code).toMatch(/session\.locked\s*&&\s*!force[\s\S]{0,200}?closeSession 보호/);
    });

    it("프록시 변경 시 closeSession(force=true) 명시 호출", () => {
      // 프록시 변경 블록 내에 closeSession(accountId, true) 존재
      expect(code).toMatch(/프록시 변경[\s\S]{0,500}?closeSession\(accountId,\s*true\)/);
    });
  });

  describe('D2: 리다이렉트 감지로 서버 만료 판정', () => {
    it("pingSingleSession이 응답 URL에서 nidlogin 검사", () => {
      expect(code).toMatch(/nidlogin\\\.login\|nid\\\.naver\\\.com\\\/nidlogin/);
    });

    it("리다이렉트 감지 시 isLoggedIn=false + loginVerifiedAt=0", () => {
      expect(code).toMatch(/서버 세션 만료 감지[\s\S]{0,200}?session\.isLoggedIn\s*=\s*false/);
    });
  });

  describe('R-01: Ping URL 풀', () => {
    it("KEEPALIVE_URL_POOL 배열 존재 (최소 3개)", () => {
      expect(code).toMatch(/KEEPALIVE_URL_POOL\s*=\s*\[[\s\S]{0,500}?'https:\/\/www\.naver\.com\/'/);
      expect(code).toMatch(/KEEPALIVE_URL_POOL[\s\S]{0,500}?'https:\/\/blog\.naver\.com\/'/);
    });

    it("인증 필수 API 포함 (bascls/token)", () => {
      expect(code).toMatch(/bascls\/token/);
    });

    it("ping 시 랜덤 선택", () => {
      expect(code).toMatch(/KEEPALIVE_URL_POOL\[Math\.floor\(Math\.random\(\)\s*\*/);
    });
  });

  describe('Bug 2: try/finally로 루프 영구 사망 방지', () => {
    it("setTimeout 콜백에 try/finally 존재", () => {
      expect(code).toMatch(/setTimeout\(async \(\) => \{[\s\S]{0,500}?try\s*\{[\s\S]{0,200}?runKeepalivePing[\s\S]{0,200}?finally\s*\{[\s\S]{0,100}?scheduleNext/);
    });
  });

  describe('Bug 3: ensureServerSession 발행 직전 gate', () => {
    it("ensureServerSession 메서드 존재 (public async)", () => {
      expect(code).toMatch(/async\s+ensureServerSession\(accountId:\s*string\):\s*Promise<boolean>/);
    });

    it("실제 에디터 페이지 fetch로 서버 검증", () => {
      expect(code).toMatch(/PostWriteForm\.naver/);
    });
  });

  describe('Bug 4: restoreCookies 반환값 확인', () => {
    it("restored 변수로 반환값 캡처", () => {
      expect(code).toMatch(/const\s+restored\s*=\s*await\s+restoreCookies/);
    });

    it("restored=false일 때 loginVerifiedAt=0 설정", () => {
      expect(code).toMatch(/if\s*\(restored\)[\s\S]{0,400}?else[\s\S]{0,200}?loginVerifiedAt\s*=\s*0/);
    });
  });

  describe('Bug 5: Chrome throttle 플래그', () => {
    it("--disable-background-timer-throttling 추가", () => {
      expect(code).toMatch(/--disable-background-timer-throttling/);
    });

    it("--disable-renderer-backgrounding 추가", () => {
      expect(code).toMatch(/--disable-renderer-backgrounding/);
    });

    it("--disable-backgrounding-occluded-windows 추가", () => {
      expect(code).toMatch(/--disable-backgrounding-occluded-windows/);
    });
  });

  describe('Bug 6: 복원 성공 시 isLoggedIn 동기화', () => {
    it("restored=true 분기에 session.isLoggedIn = true", () => {
      expect(code).toMatch(/if\s*\(restored\)[\s\S]{0,300}?session\.isLoggedIn\s*=\s*true/);
    });
  });

  describe('Bug 7: setLoggedIn(false) 시 locked 해제', () => {
    it("!isLoggedIn && session.locked 분기에서 locked=false", () => {
      expect(code).toMatch(/if\s*\(!isLoggedIn\s*&&\s*session\.locked\)[\s\S]{0,200}?session\.locked\s*=\s*false/);
    });
  });

  describe('Bug 8: closeAllSessions isPinging 대기', () => {
    it("isPinging flag 필드 존재", () => {
      expect(code).toMatch(/isPinging\s*=\s*false/);
    });

    it("closeAllSessions에서 isPinging 완료 대기 루프", () => {
      expect(code).toMatch(/closeAllSessions[\s\S]{0,800}?this\.isPinging[\s\S]{0,200}?setTimeout/);
    });
  });

  describe('Bug 10: 발행 중 ping 경쟁 방지', () => {
    it("activeAccountId 일치 계정은 ping skip", () => {
      expect(code).toMatch(/accountId === this\.activeAccountId[\s\S]{0,200}?ping skip/);
    });
  });

  describe('Bug 12: page.isClosed() 시 newPage 재생성', () => {
    it("page.isClosed() 검사 후 browser.newPage()", () => {
      expect(code).toMatch(/page\.isClosed\(\)[\s\S]{0,300}?browser\.newPage\(\)/);
    });
  });

  describe('R-04/R-05: 지터 확대 + skip 확률', () => {
    it("KEEPALIVE_JITTER_MS는 5분으로 확대 (이전 2분)", () => {
      expect(code).toMatch(/KEEPALIVE_JITTER_MS\s*=\s*5\s*\*\s*60\s*\*\s*1000/);
    });

    it("KEEPALIVE_SKIP_PROB = 0.15 (15% skip)", () => {
      expect(code).toMatch(/KEEPALIVE_SKIP_PROB\s*=\s*0\.15/);
    });

    it("Math.random() < KEEPALIVE_SKIP_PROB 분기", () => {
      expect(code).toMatch(/Math\.random\(\)\s*<\s*this\.KEEPALIVE_SKIP_PROB/);
    });
  });

  describe('Bug S9: 신규 세션 생성 시 쿠키 자동 복원', () => {
    it("sessions.set 직후 restoreCookies 자동 호출", () => {
      expect(code).toMatch(/this\.sessions\.set\(accountId[\s\S]{0,500}?restoreCookies\(page,\s*accountId\)/);
    });

    it("앱 재시작 연속성 로그", () => {
      expect(code).toMatch(/앱 재시작 연속성/);
    });
  });

  describe('R-02: IP당 ping 집중 완화 (계정 수 비례 간격)', () => {
    it("minGapMs = 계정 수 * 3000 이상", () => {
      expect(code).toMatch(/Math\.max\(5000,\s*accountIds\.length\s*\*\s*3000\)/);
    });
  });

  describe('v1.4.79 종합 — 불변식', () => {
    it("SESSION_MAX_AGE는 여전히 무기한 (이전 수정 유지)", () => {
      expect(code).toMatch(/SESSION_MAX_AGE\s*=\s*Number\.MAX_SAFE_INTEGER/);
    });

    it("잠긴 세션은 TTL 체크 생략 유지", () => {
      expect(code).toMatch(/if\s*\(session\.locked\)\s*\{[\s\S]{0,100}?return\s+true/);
    });

    it("단일 ping URL 'user2/help/idpw' 고정 호출이 제거됨", () => {
      // 이전 v1.4.78에서 고정이었던 URL이 URL POOL에 들어있지 않음
      const poolMatch = code.match(/KEEPALIVE_URL_POOL\s*=\s*\[[\s\S]{0,500}?\]/)?.[0] || '';
      expect(poolMatch).not.toMatch(/user2\/help\/idpw/);
    });
  });
});
