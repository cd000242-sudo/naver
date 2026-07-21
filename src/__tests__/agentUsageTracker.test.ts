/**
 * [v2.11.135] 에이전트 5시간 창 사용량 가시화 잠금.
 *
 * 구독 CLI는 잔여 쿼터 조회를 제공하지 않는다(로컬 claude 실측:
 * .credentials.json에 subscriptionType/rateLimitTier만 존재). 따라서
 * (1) 앱 자체 호출 기록 + (2) rate limit 메시지의 리셋 시각 파싱이
 * 정직한 최선이며, 이 배선이 회귀로 사라지지 않도록 잠근다.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseRateLimitReset, AGENT_USAGE_WINDOW_MS } from '../agentCli/usageTracker';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

describe('parseRateLimitReset — CLI 메시지에서 리셋 시각 추출', () => {
  const NOW = new Date('2026-07-21T10:00:00').getTime();

  it('상대 시간("try again in 2 hours 30 minutes")을 파싱한다', () => {
    const reset = parseRateLimitReset('rate limit reached, try again in 2 hours 30 minutes', NOW);
    expect(reset).toBe(NOW + (2 * 60 + 30) * 60 * 1000);
  });

  it('절대 시각("resets 3pm")을 오늘/내일로 해석한다', () => {
    const reset = parseRateLimitReset('5-hour limit reached ∙ resets 3pm', NOW);
    expect(new Date(reset!).getHours()).toBe(15);
    expect(reset!).toBeGreaterThan(NOW);
  });

  it('이미 지난 시각은 다음 날로 넘긴다', () => {
    const reset = parseRateLimitReset('resets at 9:00', NOW); // NOW는 10:00
    expect(reset!).toBeGreaterThan(NOW);
    expect(new Date(reset!).getHours()).toBe(9);
  });

  it('파싱 불가 메시지는 undefined (숫자 날조 금지)', () => {
    expect(parseRateLimitReset('quota exhausted', NOW)).toBeUndefined();
    expect(parseRateLimitReset('', NOW)).toBeUndefined();
  });

  it('창 크기는 5시간이다', () => {
    expect(AGENT_USAGE_WINDOW_MS).toBe(5 * 60 * 60 * 1000);
  });
});

describe('사용량 가시화 배선 잠금', () => {
  it('generateWithAgent가 성공 시 기록하고 rate_limited 시 리셋을 저장한다', () => {
    const code = read('agentCli/index.ts');
    expect(code).toMatch(/recordAgentCall\(provider\)/);
    expect(code).toMatch(/recordAgentRateLimit\(provider/);
  });

  it('agent:usage IPC와 preload 노출이 존재한다', () => {
    expect(read('main/ipc/agentHandlers.ts')).toMatch(/ipcMain\.handle\('agent:usage'/);
    expect(read('preload.ts')).toMatch(/ipcRenderer\.invoke\('agent:usage'/);
  });

  it('상태 카드가 5시간 사용량과 리셋 시각을 표시한다 (정직한 표기 — 앱 기록임을 명시)', () => {
    // priceInfoModal은 한글을 \uXXXX 이스케이프로 저장하므로 식별자 기준으로 잠근다.
    const ui = read('renderer/modules/priceInfoModal.ts');
    expect(ui).toMatch(/agentUsage\?\.\(t\.provider\)/);
    expect(ui).toMatch(/\$\{usage\.callsInWindow\}/);
    expect(ui).toMatch(/rateLimitResetAt/);
    expect(ui).toMatch(/rateLimitSuffix/);
  });
});
