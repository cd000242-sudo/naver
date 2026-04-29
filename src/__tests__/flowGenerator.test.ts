/**
 * ✅ [v2.7.51] Flow 이미지 엔진 회귀 가드 (v2.7.x 신 구조 반영)
 *
 * 검증:
 *   - flowGenerator.ts가 launchWithStealthFallback 패턴으로 구현됨
 *   - labs.google/flow 접속 + 로그인용 + off-screen 분리
 *   - cachedContext/cachedPage 세션 캐싱 (재학습 방지)
 *   - generateWithFlow / prewarmFlow / resetFlowState export
 *   - v2.7.38 3중 가드 (--window-position=-32000,-32000 + window.moveTo)
 *   - v2.7.42 FLOW_* 메시지 한국어 친화화 적용 검증
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

// 신 구조 회귀 가드 — v2.7.51에서 신 구조에 맞게 전체 재작성
describe('Flow 이미지 엔진 v2.7.x', () => {
  describe('flowGenerator.ts 핵심 export', () => {
    const code = read('image/flowGenerator.ts');

    it('labs.google/flow 접속 경로 존재', () => {
      expect(code).toMatch(/labs\.google\/fx\/tools\/flow/);
    });

    it('generateWithFlow export 함수 존재', () => {
      expect(code).toMatch(/export async function generateWithFlow/);
    });

    it('prewarmFlow export — 앱 시작 백그라운드 브라우저 기동', () => {
      expect(code).toMatch(/export async function prewarmFlow/);
    });

    it('resetFlowState export — 종료 시 cookies flush', () => {
      expect(code).toMatch(/export async function resetFlowState/);
    });

    it('recreateFlowContext export — 세션 재생성', () => {
      expect(code).toMatch(/export async function recreateFlowContext/);
    });
  });

  describe('Stealth/launch 가드', () => {
    const code = read('image/flowGenerator.ts');

    it('launchWithStealthFallback 함수 — System Chrome/Edge/Chromium 폴백 체인', () => {
      expect(code).toMatch(/launchWithStealthFallback/);
      expect(code).toMatch(/'chrome' as const/);
      expect(code).toMatch(/'msedge' as const/);
    });

    it('STEALTH_ARGS — webdriver 자동화 플래그 위장', () => {
      expect(code).toMatch(/disable-blink-features=AutomationControlled/);
    });

    it('webdriver getter undefined 위장', () => {
      expect(code).toMatch(/Object\.defineProperty\(navigator,\s*['"]webdriver['"]/);
    });
  });

  describe('v2.7.38 게임 친화 — 창 숨김 3중 가드', () => {
    const code = read('image/flowGenerator.ts');

    it('off-screen args에 -32000,-32000 좌표', () => {
      expect(code).toMatch(/--window-position=-32000,-32000/);
    });

    it('off-screen args에 --window-size=1,1', () => {
      expect(code).toMatch(/--window-size=1,1/);
    });

    it('off-screen args에 --start-minimized', () => {
      expect(code).toMatch(/--start-minimized/);
    });

    it('window.moveTo + resizeTo 강제 적용', () => {
      expect(code).toMatch(/window\.moveTo\(-32000,\s*-32000\)/);
      expect(code).toMatch(/window\.resizeTo\(1,\s*1\)/);
    });
  });

  describe('v2.7.42 사용자 친화 메시지 (FLOW_* prefix는 유지하되 한국어 본문)', () => {
    const code = read('image/flowGenerator.ts');

    it('FLOW_LOGIN_TIMEOUT — Google 로그인 + 5분 + [Flow 로그인] 안내', () => {
      expect(code).toMatch(/FLOW_LOGIN_TIMEOUT.*Google 로그인.*5분/);
    });

    it('FLOW_NEW_PROJECT_BUTTON_NOT_FOUND — 1시간 + 다른 엔진 안내', () => {
      expect(code).toMatch(/FLOW_NEW_PROJECT_BUTTON_NOT_FOUND.*Google Flow.*다른 이미지 엔진/);
    });

    it('FLOW_ALL_FAILED — 시간당 한도 + 다른 엔진 선택 안내', () => {
      expect(code).toMatch(/FLOW_ALL_FAILED.*시간당 한도.*다른 이미지 엔진/);
    });
  });

  describe('세션 캐싱 (v2.7.x)', () => {
    const code = read('image/flowGenerator.ts');

    it('cachedContext / cachedPage 변수 존재', () => {
      expect(code).toMatch(/let cachedContext.*BrowserContext.*null/);
      expect(code).toMatch(/let cachedPage.*Page.*null/);
    });

    it('cookies flush — close() 명시 호출 (resetFlowState)', () => {
      expect(code).toMatch(/cachedContext\.close\(\)/);
    });
  });
});
