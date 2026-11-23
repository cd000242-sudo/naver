import { describe, expect, it, vi } from 'vitest';
import { dailyGenerationStopRecord } from '../main/services/dailyGenerationStop.js';
import { createDailyPublishingRuntime } from '../main/services/dailyPublishingRuntime.js';

const NOW = new Date(2026, 10, 24, 3, 0).getTime();
const plan = { accountId: 'acc1', generator: 'agent-codex', imageSource: 'codex-image' } as never;
const job = { key: 'job-1' } as never;

describe('매일 자동발행: 창을 띄울 수 없는 멈춤 기록', () => {
  it('코덱스 한도 초과(이미지)는 기록이 된다. 엔진은 계획의 이미지 엔진', () => {
    const record = dailyGenerationStopRecord({ plan, job, now: NOW,
      message: '이미지 생성 실패: Codex 생성 실패 (원인 코드: rate_limited). 11월 24일 15시 20분 이후 다시 시도' });
    expect(record).toMatchObject({ kind: 'daily', stage: 'image', cause: 'limit', engine: 'codex-image', accountId: 'acc1', jobKey: 'job-1' });
    expect(record?.summary).toBe('이미지 생성이 멈췄어요 · 코덱스 한도 초과 · 초기화 오후 3:20');
  });

  it('글 쓰기 로그인 만료는 글 엔진으로 기록된다', () => {
    const record = dailyGenerationStopRecord({ plan, job, now: NOW, message: 'Codex 생성 실패 (원인 코드: not_logged_in). 글 생성 실패' });
    expect(record).toMatchObject({ stage: 'text', cause: 'login', engine: 'agent-codex' });
  });

  it('발행 결과를 모르는 실패·네이버 계정 멈춤은 생성 멈춤이 아니므로 기록하지 않는다', () => {
    expect(dailyGenerationStopRecord({ plan, job, now: NOW, message: '실제 완료 결과를 확인하지 못했습니다.' })).toBeNull();
    expect(dailyGenerationStopRecord({ plan, job, now: NOW, message: '[LOGIN_REQUIRED] 네이버 로그인이 필요합니다' })).toBeNull();
    expect(dailyGenerationStopRecord({ plan, job, now: NOW, message: '' })).toBeNull();
  });
});

describe('매일 자동발행 실행기에 연결', () => {
  function runtimeWith(message: string, extra: Record<string, unknown> = {}) {
    const recordStop = vi.fn(async () => undefined);
    const notify = vi.fn();
    const runtime = createDailyPublishingRuntime({
      storagePath: () => '.', availability: async () => ({ ready: true, paid: true, label: '' }), safety: () => ({ paused: false, busy: false, label: '' }),
      busy: () => false, notify, recordStop, readConfig: async () => ({}), readAccount: async () => ({ id: 'acc1' }),
      resolveCategory: async () => ({ categoryName: 'x' }), reserveSource: async () => true, publish: async () => ({ success: false, results: [{ accountId: 'acc1', message }] }),
      ...extra,
    } as never);
    return { runtime, recordStop, notify };
  }

  it('기록 저장 훅이 없으면 기존 동작 그대로(예외 없음)', () => {
    expect(() => runtimeWith('x', { recordStop: undefined })).not.toThrow();
  });
});
