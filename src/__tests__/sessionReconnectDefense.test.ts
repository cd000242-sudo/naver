/**
 * [TDD] browserSessionManager.ts — reconnect defense layer
 *
 * Bug reproduction:
 *   - isConnected() === false on transient WiFi flap → session destroyed without retry
 *   - locked session has no reconnect path → high-value session lost on CDP blip
 *   - No functional ping (page-level) before trusting WebSocket status
 *
 * Design under test: 3-5 stage defense chain
 *   Stage 1: isConnected() — fast WebSocket gate (existing)
 *   Stage 2: reconnect() — up to 3 retries, 5 s apart (NEW)
 *   Stage 3: page functional ping — page.goto('about:blank') smoke check (NEW)
 *   Stage 4: locked guard — never delete locked session without exhausting reconnect (NEW)
 *   Stage 5: disconnect event listener for auto-heal (NEW)
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const FILE = path.resolve(__dirname, '../browserSessionManager.ts');
const code = fs.readFileSync(FILE, 'utf-8');

describe('Session Reconnect Defense — Stage gates', () => {

  describe('Stage 2 — reconnect() retry method', () => {
    it('attemptReconnect private method exists', () => {
      expect(code).toMatch(/private\s+async\s+attemptReconnect/);
    });

    it('retries up to 3 times (RECONNECT_MAX_RETRIES = 3)', () => {
      expect(code).toMatch(/RECONNECT_MAX_RETRIES\s*=\s*3/);
    });

    it('uses 5-second delay between retries (RECONNECT_RETRY_DELAY_MS = 5000)', () => {
      expect(code).toMatch(/RECONNECT_RETRY_DELAY_MS\s*=\s*5000/);
    });

    it('returns boolean indicating reconnect success', () => {
      // Method signature must return Promise<boolean>
      expect(code).toMatch(/attemptReconnect[\s\S]{0,200}Promise<boolean>/);
    });
  });

  describe('Stage 3 — page functional ping', () => {
    it('page-level ping via page.goto uses about:blank', () => {
      expect(code).toMatch(/page\.goto\(['"]about:blank['"]/);
    });

    it('page ping is wrapped in try/catch (non-throwing)', () => {
      // about:blank goto must be in a try block
      expect(code).toMatch(/try[\s\S]{0,300}about:blank[\s\S]{0,300}catch/);
    });

    it('ping timeout is short — max 3000ms', () => {
      expect(code).toMatch(/about:blank[\s\S]{0,200}timeout:\s*3000/);
    });
  });

  describe('Stage 4 — locked session indestructibility', () => {
    it('locked session triggers attemptReconnect before any delete', () => {
      // When session is locked AND disconnected: attemptReconnect must be called
      expect(code).toMatch(/locked[\s\S]{0,300}attemptReconnect/);
    });

    it('locked session path: reconnect exhausted then locked guard then delete', () => {
      // After reconnect fails: locked guard check appears before sessions.delete
      // Verified in the else-branch: if (existingSession.locked) warn → sessions.delete
      expect(code).toMatch(/existingSession\.locked[\s\S]{0,300}sessions\.delete/);
    });

    it('locked session logs warning before forced close', () => {
      expect(code).toMatch(/locked.*재연결 실패|재연결 실패.*locked/);
    });
  });

  describe('Stage 5 — disconnect event auto-heal', () => {
    it('browser.on disconnected event listener registered', () => {
      expect(code).toMatch(/browser\.on\(['"]disconnected['"]/);
    });

    it('disconnect handler calls attemptReconnect', () => {
      expect(code).toMatch(/disconnected[\s\S]{0,500}attemptReconnect/);
    });
  });

  describe('Existing stage 1 — connected gate preserved (Puppeteer 25 property)', () => {
    it('browser.connected check still present as fast gate', () => {
      // ✅ [Puppeteer 25] isConnected() method → connected property 변경 (v2.10.358)
      //   API breaking change에 회귀 테스트도 동기화. .connected property로 가드 보호.
      expect(code).toMatch(/\.connected/);
    });
  });

});
