/**
 * Flow + AdsPower 연동 단위 테스트.
 *
 * R4 사전 방지 — 자동 검증 가능 영역:
 *   - adsPowerGet HTTP 헬퍼 (200 / 4xx / timeout / refused)
 *   - 토글 state (setFlowAdsPowerEnabled / isFlowAdsPowerEnabled / Session disabled)
 *
 * 자동화 불가 영역(chromium.connectOverCDP, Google 로그인)은 manual 시나리오로 검증.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { adsPowerGet } from '../image/flowAdsPowerConnect';
import {
  setFlowAdsPowerEnabled,
  isFlowAdsPowerEnabled,
  isFlowAdsPowerSessionDisabled,
  markFlowAdsPowerSessionDisabled,
} from '../image/flowGenerator';

const origFetch = global.fetch;

afterEach(() => {
  global.fetch = origFetch;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('adsPowerGet — HTTP 헬퍼', () => {
  it('정상 200 응답 → JSON 반환', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 0, data: { ws: { puppeteer: 'ws://example' } } }),
    }) as any;

    const result = await adsPowerGet('/api/v1/user/list?page=1');
    expect(result).toEqual({ code: 0, data: { ws: { puppeteer: 'ws://example' } } });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://local.adspower.com:50325/api/v1/user/list?page=1',
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('HTTP 404 → FLOW_ADSPOWER_HTTP_404 throw', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}),
    }) as any;

    await expect(adsPowerGet('/api/v1/missing')).rejects.toThrow(/FLOW_ADSPOWER_HTTP_404/);
  });

  it('HTTP 500 → FLOW_ADSPOWER_HTTP_500 throw', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    }) as any;

    await expect(adsPowerGet('/status')).rejects.toThrow(/FLOW_ADSPOWER_HTTP_500/);
  });

  it('AbortError (8초 타임아웃) → FLOW_ADSPOWER_TIMEOUT throw', async () => {
    const abortErr = new Error('aborted');
    abortErr.name = 'AbortError';
    global.fetch = vi.fn().mockRejectedValue(abortErr) as any;

    await expect(adsPowerGet('/status')).rejects.toThrow(/FLOW_ADSPOWER_TIMEOUT/);
  });

  it('ECONNREFUSED 등 네트워크 에러 → 원본 에러 전파', async () => {
    const netErr = new Error('connect ECONNREFUSED 127.0.0.1:50325');
    global.fetch = vi.fn().mockRejectedValue(netErr) as any;

    await expect(adsPowerGet('/status')).rejects.toThrow(/ECONNREFUSED/);
  });
});

describe('Flow AdsPower 토글 state', () => {
  beforeEach(() => {
    // 매 테스트 격리 — 이전 테스트의 state 영향 차단
    setFlowAdsPowerEnabled(false);
  });

  it('setFlowAdsPowerEnabled(true) → isFlowAdsPowerEnabled true', () => {
    expect(isFlowAdsPowerEnabled()).toBe(false);
    setFlowAdsPowerEnabled(true);
    expect(isFlowAdsPowerEnabled()).toBe(true);
  });

  it('setFlowAdsPowerEnabled(false) → SessionDisabled 플래그도 리셋', () => {
    setFlowAdsPowerEnabled(true);
    markFlowAdsPowerSessionDisabled();
    expect(isFlowAdsPowerSessionDisabled()).toBe(true);

    setFlowAdsPowerEnabled(false);
    expect(isFlowAdsPowerEnabled()).toBe(false);
    expect(isFlowAdsPowerSessionDisabled()).toBe(false); // 토글 OFF가 disabled 플래그 리셋
  });

  it('markFlowAdsPowerSessionDisabled → 본 세션 비활성화 유지', () => {
    setFlowAdsPowerEnabled(true);
    expect(isFlowAdsPowerSessionDisabled()).toBe(false);

    markFlowAdsPowerSessionDisabled();
    expect(isFlowAdsPowerSessionDisabled()).toBe(true);
    expect(isFlowAdsPowerEnabled()).toBe(true); // 사용자 설정값은 변경 안 됨

    // 두 번 호출해도 idempotent
    markFlowAdsPowerSessionDisabled();
    expect(isFlowAdsPowerSessionDisabled()).toBe(true);
  });

  it('토글 OFF 상태에서는 본 세션 비활성화 플래그가 영향 없음', () => {
    expect(isFlowAdsPowerEnabled()).toBe(false);
    markFlowAdsPowerSessionDisabled();
    expect(isFlowAdsPowerSessionDisabled()).toBe(true);

    // 토글 ON 후 한 번 OFF 하면 disabled 리셋됨 (다음 ON 시점에 깨끗한 상태)
    setFlowAdsPowerEnabled(true);
    expect(isFlowAdsPowerSessionDisabled()).toBe(true); // ON만으로는 리셋 안 됨
    setFlowAdsPowerEnabled(false);
    expect(isFlowAdsPowerSessionDisabled()).toBe(false);
  });
});
