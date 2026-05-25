/**
 * stealthAndIsolationGuards.test.ts — Phase B T3·T4·T5 회귀 방지 테스트
 *
 * 목적: 자동화의 핵심 anti-bot invariant가 회귀로 깨지지 않게 보호.
 * - T3: stealth plugin이 navigator.webdriver evasion 포함 + import 살아있음
 * - T4: userDataDir 계정별 격리 — 다른 accountId는 다른 디렉토리
 * - T5: isAccountBackedOff(accountId) === true인 계정은 발행 차단 신호 정확
 *
 * 설계: Puppeteer/E2E 불필요 — 정적 파일 검증 + 순수 함수 단위.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { recordBotBackoff, isAccountBackedOff, clearBotBackoff, getBotBackoff } from '../utils/botBackoff';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const BSM_PATH = path.join(PROJECT_ROOT, 'src/browserSessionManager.ts');
const NBA_PATH = path.join(PROJECT_ROOT, 'src/naverBlogAutomation.ts');

const readSrc = (p: string) => fs.readFileSync(p, 'utf-8');

// ═══════════════════════════════════════════════════════════════════
// T3: stealth plugin + navigator.webdriver evasion 보호
// ═══════════════════════════════════════════════════════════════════
describe('T3: stealth plugin navigator.webdriver evasion', () => {
  it('browserSessionManager.ts가 puppeteer-extra-plugin-stealth를 import해야 함', () => {
    const src = readSrc(BSM_PATH);
    expect(src).toMatch(/import\s+\w+\s+from\s+['"]puppeteer-extra-plugin-stealth['"]/);
  });

  it('stealthPlugin.enabledEvasions.add(\'navigator.webdriver\') 호출이 있어야 함', () => {
    const src = readSrc(BSM_PATH);
    // 명시적 등록 또는 default enabled 모두 안전. 명시적 보호 패턴 검증.
    expect(src).toMatch(/enabledEvasions\.add\(['"]navigator\.webdriver['"]\)/);
  });

  it('puppeteer.use(stealthPlugin) 호출이 단일 위치(browserSessionManager)에만 존재', () => {
    const bsmSrc = readSrc(BSM_PATH);
    const nbaSrc = readSrc(NBA_PATH);
    // browserSessionManager: 활성 puppeteer.use(stealthPlugin) 있어야
    expect(bsmSrc).toMatch(/puppeteer\.use\(stealthPlugin\)/);
    // naverBlogAutomation: 활성 puppeteer.use(...) 없어야 (주석 처리 OK — v2.10.357 fix)
    const activeUse = nbaSrc.split('\n').filter((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('//')) return false;
      return /puppeteer\.use\(StealthPlugin\(\)\)/.test(line);
    });
    expect(activeUse).toHaveLength(0);
  });

  it('--disable-blink-features=AutomationControlled launch arg 보호', () => {
    const src = readSrc(BSM_PATH);
    expect(src).toMatch(/disable-blink-features=AutomationControlled/);
  });

  it('navigator.webdriver = undefined 수동 보완 코드 보호', () => {
    const src = readSrc(BSM_PATH) + readSrc(NBA_PATH);
    // evaluateOnNewDocument 또는 직접 정의로 webdriver=undefined 보장
    expect(src).toMatch(/navigator\.webdriver|webdriver.*undefined|Object\.defineProperty.*webdriver/);
  });
});

// ═══════════════════════════════════════════════════════════════════
// T4: userDataDir 계정별 격리
// ═══════════════════════════════════════════════════════════════════
/**
 * browserSessionManager의 hashAccountId 동일 로직 (테스트용 추출).
 * private 메서드라 직접 호출 불가 — 알고리즘 일치 검증으로 격리 보장.
 */
function hashAccountId(accountId: string): string {
  let hash = 0;
  for (let i = 0; i < accountId.length; i++) {
    const char = accountId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

describe('T4: userDataDir 계정별 격리', () => {
  it('동일 accountId는 항상 동일 hash (안정성)', () => {
    expect(hashAccountId('user_a')).toBe(hashAccountId('user_a'));
    expect(hashAccountId('cd00242')).toBe(hashAccountId('cd00242'));
  });

  it('다른 accountId는 다른 hash (격리)', () => {
    expect(hashAccountId('user_a')).not.toBe(hashAccountId('user_b'));
    expect(hashAccountId('cd00242')).not.toBe(hashAccountId('rimi_77'));
  });

  it('빈 accountId도 hash 생성 가능 (충돌 방지 — 빈 ID는 "0"으로 폴백)', () => {
    expect(hashAccountId('')).toBe('0');
  });

  it('100개 다른 accountId가 충돌 없이 격리 (sample collision check)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const id = `account_${i}_${Math.random().toString(36).slice(2, 8)}`;
      const h = hashAccountId(id);
      expect(seen.has(h)).toBe(false); // 충돌 없음
      seen.add(h);
    }
    expect(seen.size).toBe(100);
  });

  it('browserSessionManager.ts가 getProfileDir에서 hashAccountId 사용 (격리 보장)', () => {
    const src = readSrc(BSM_PATH);
    expect(src).toMatch(/private\s+getProfileDir.*?{[\s\S]*?hashAccountId/);
  });

  it('PROFILE_BASE가 계정별 hash 디렉토리로 분리됨', () => {
    const src = readSrc(BSM_PATH);
    expect(src).toMatch(/path\.join\(this\.PROFILE_BASE,\s*hash\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════
// T5: isAccountBackedOff(accountId) 발행 차단 신호
// ═══════════════════════════════════════════════════════════════════
describe('T5: 백오프된 계정의 발행 차단 신호', () => {
  const TEST_ID = `test_account_${Date.now()}`;

  it('clean state: isAccountBackedOff === false', () => {
    clearBotBackoff(TEST_ID);
    expect(isAccountBackedOff(TEST_ID)).toBe(false);
  });

  it('recordBotBackoff(\'captcha\') 후 isAccountBackedOff === true', () => {
    clearBotBackoff(TEST_ID);
    recordBotBackoff(TEST_ID, 'captcha');
    expect(isAccountBackedOff(TEST_ID)).toBe(true);
  });

  it('getBotBackoff()는 reason과 expiresAt 객체 반환', () => {
    clearBotBackoff(TEST_ID);
    recordBotBackoff(TEST_ID, 'captcha');
    const bo = getBotBackoff(TEST_ID);
    expect(bo).not.toBeNull();
    expect(bo?.reason).toBe('captcha');
    expect(typeof bo?.expiresAt).toBe('number');
    expect(bo!.expiresAt).toBeGreaterThan(Date.now()); // 미래 시간
  });

  it('clearBotBackoff() 후 즉시 해제됨 (false 반환)', () => {
    recordBotBackoff(TEST_ID, 'captcha');
    clearBotBackoff(TEST_ID);
    expect(isAccountBackedOff(TEST_ID)).toBe(false);
    expect(getBotBackoff(TEST_ID)).toBeNull();
  });

  it('계정별 독립 — 한 계정 backoff가 다른 계정에 영향 X', () => {
    const A = `acct_a_${Date.now()}`;
    const B = `acct_b_${Date.now()}`;
    clearBotBackoff(A);
    clearBotBackoff(B);
    recordBotBackoff(A, 'captcha');
    expect(isAccountBackedOff(A)).toBe(true);
    expect(isAccountBackedOff(B)).toBe(false);
  });

  it('naverBlogAutomation.ts 백오프 체크 → throw 패턴 보호', () => {
    const src = readSrc(NBA_PATH);
    // 핵심 차단 코드 무결성 검증 — 회귀 시 throw 사라지면 즉시 fail
    expect(src).toMatch(/getBotBackoff\(accountId\)/);
    expect(src).toMatch(/이 계정은 봇 감지로 자동 발행이 일시 중단/);
  });

  it('skipBotBackoff 옵션 가드 존재 (반자동 모드 우회 보호)', () => {
    const src = readSrc(NBA_PATH);
    // v2.10.355 fix — 반자동 모드는 백오프 우회. 이 가드 자체가 회귀로 깨지면 fail
    expect(src).toMatch(/skipBotBackoff/);
  });
});
