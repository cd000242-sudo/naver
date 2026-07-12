import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const electronMock = vi.hoisted(() => {
  const handlers = new Map<string, (...args: any[]) => Promise<any>>();
  return {
    handlers,
    handle: vi.fn((channel: string, handler: (...args: any[]) => Promise<any>) => {
      handlers.set(channel, handler);
    }),
  };
});

vi.mock('./mocks/electron', () => ({
  app: { getPath: () => process.env.REVENUE_OPERATIONS_TEST_DIR || os.tmpdir() },
  ipcMain: { handle: electronMock.handle },
}));

import { registerRevenueOperationsHandlers } from '../main/ipc/revenueOperationsHandlers';

let directory = '';

function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

describe('revenue operations IPC handlers', () => {
  beforeAll(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'revenue-ipc-test-'));
    process.env.REVENUE_OPERATIONS_TEST_DIR = directory;
    registerRevenueOperationsHandlers();
  });

  afterAll(() => {
    delete process.env.REVENUE_OPERATIONS_TEST_DIR;
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('registers the complete four-channel contract', () => {
    expect([...electronMock.handlers.keys()].sort()).toEqual([
      'revenue:addEntry',
      'revenue:getDashboard',
      'revenue:removeEntry',
      'revenue:updateSettings',
    ]);
  });

  it('returns safe validation failures and a refreshed dashboard after mutations', async () => {
    const add = electronMock.handlers.get('revenue:addEntry')!;
    const get = electronMock.handlers.get('revenue:getDashboard')!;
    const remove = electronMock.handlers.get('revenue:removeEntry')!;
    const update = electronMock.handlers.get('revenue:updateSettings')!;

    const invalid = await add({}, {
      occurredOn: 'invalid', channel: 'adpost', grossRevenue: 100, cost: 0,
    });
    expect(invalid.success).toBe(false);
    expect(invalid.message).toContain('YYYY-MM-DD');

    const settings = await update({}, { monthlyNetTarget: 1_000_000 });
    expect(settings.success).toBe(true);
    expect(settings.dashboard.settings.monthlyNetTarget).toBe(1_000_000);

    const added = await add({}, {
      occurredOn: todayLocal(), channel: 'service', grossRevenue: 500_000, cost: 100_000,
    });
    expect(added.success).toBe(true);
    expect(added.dashboard.currentMonth.netProfit).toBe(400_000);

    const dashboard = await get({});
    expect(dashboard.success).toBe(true);
    expect(dashboard.dashboard.entries).toHaveLength(1);

    const removed = await remove({}, added.entry.id);
    expect(removed.success).toBe(true);
    expect(removed.dashboard.entries).toHaveLength(0);

    const missing = await remove({}, 'missing-id');
    expect(missing).toMatchObject({ success: false });
  });
});
