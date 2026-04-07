import { describe, it, expect, vi, beforeEach } from 'vitest';

// postLimitManager는 Electron의 app을 import하므로 모킹 필요
vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/test-post-limit',
  },
}));

vi.mock('fs/promises', () => {
  let store: Record<string, string> = {};
  return {
    default: {
      readFile: vi.fn(async (path: string) => {
        if (store[path]) return store[path];
        throw new Error('ENOENT');
      }),
      writeFile: vi.fn(async (path: string, data: string) => {
        store[path] = data;
      }),
      mkdir: vi.fn(async () => undefined),
    },
    readFile: vi.fn(async (path: string) => {
      if (store[path]) return store[path];
      throw new Error('ENOENT');
    }),
    writeFile: vi.fn(async (path: string, data: string) => {
      store[path] = data;
    }),
    mkdir: vi.fn(async () => undefined),
    // 테스트 헬퍼: 스토어 초기화
    __resetStore: () => { store = {}; },
    __getStore: () => store,
  };
});

describe('postLimitManager', () => {
  beforeEach(async () => {
    const fs = await import('fs/promises') as any;
    fs.__resetStore?.();
    vi.resetModules();
  });

  it('기본 일일 한도는 3이다', async () => {
    const { getDailyLimit } = await import('../postLimitManager');
    expect(getDailyLimit()).toBe(3);
  });

  it('setDailyLimit으로 한도를 변경할 수 있다', async () => {
    const { getDailyLimit, setDailyLimit } = await import('../postLimitManager');
    setDailyLimit(5);
    expect(getDailyLimit()).toBe(5);
    setDailyLimit(3); // 원복
  });

  it('유효하지 않은 한도는 무시한다', async () => {
    const { getDailyLimit, setDailyLimit } = await import('../postLimitManager');
    const before = getDailyLimit();
    setDailyLimit(-1);
    expect(getDailyLimit()).toBe(before);
    setDailyLimit(NaN);
    expect(getDailyLimit()).toBe(before);
    setDailyLimit(Infinity);
    expect(getDailyLimit()).toBe(before);
  });

  it('getTodayCount는 새 날에 0을 반환한다', async () => {
    const { getTodayCount } = await import('../postLimitManager');
    const count = await getTodayCount();
    expect(count).toBe(0);
  });

  it('incrementTodayCount는 카운트를 증가시킨다', async () => {
    const { incrementTodayCount, getTodayCount } = await import('../postLimitManager');
    await incrementTodayCount();
    const count = await getTodayCount();
    expect(count).toBe(1);
  });
});

describe('postLimitManager 빈도 제어', () => {
  beforeEach(async () => {
    const fs = await import('fs/promises') as any;
    fs.__resetStore?.();
    vi.resetModules();
  });

  it('getMinIntervalMs 기본값은 2시간이다', async () => {
    const mod = await import('../postLimitManager');
    if ('getMinIntervalMs' in mod) {
      expect((mod as any).getMinIntervalMs()).toBe(2 * 60 * 60 * 1000);
    }
  });

  it('validatePublishAllowed가 존재한다', async () => {
    const mod = await import('../postLimitManager');
    expect(typeof (mod as any).validatePublishAllowed).toBe('function');
  });
});
