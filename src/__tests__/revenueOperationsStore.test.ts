import fs from 'fs';
import fsPromises from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RevenueOperationsStore } from '../analytics/revenueOperationsStore';

let directory = '';
let filePath = '';

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'revenue-operations-'));
  filePath = path.join(directory, 'revenue-operations.json');
});

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(directory, { recursive: true, force: true });
  });

describe('RevenueOperationsStore', () => {
  it('persists settings and actual ledger entries across instances', async () => {
    const first = new RevenueOperationsStore(filePath);
    await first.updateSettings({ monthlyNetTarget: 4_000_000 });
    const saved = await first.addEntry({
      occurredOn: '2026-07-10', channel: 'shopping-connect',
      grossRevenue: 700_000, cost: 100_000, conversions: 7, clicks: 70,
      title: '수익 글', postUrl: 'https://blog.naver.com/test/123',
    });

    const second = new RevenueOperationsStore(filePath);
    const dashboard = await second.getDashboard(new Date('2026-07-13T12:00:00+09:00'));
    expect(dashboard.settings.monthlyNetTarget).toBe(4_000_000);
    expect(dashboard.entries[0].id).toBe(saved.id);
    expect(dashboard.currentMonth.netProfit).toBe(600_000);
  });

  it('serializes concurrent writes without dropping entries', async () => {
    const store = new RevenueOperationsStore(filePath);
    await Promise.all(Array.from({ length: 12 }, (_, index) => store.addEntry({
      occurredOn: '2026-07-10', channel: 'adpost', grossRevenue: 10_000 + index, cost: 0,
    })));

    const dashboard = await store.getDashboard(new Date('2026-07-13T12:00:00+09:00'));
    expect(dashboard.entries).toHaveLength(12);
  });

  it('quarantines malformed storage and reports recovery instead of fabricating data', async () => {
    fs.writeFileSync(filePath, '{broken json', 'utf8');
    const store = new RevenueOperationsStore(filePath);
    const dashboard = await store.getDashboard(new Date('2026-07-13T12:00:00+09:00'));

    expect(dashboard.entries).toEqual([]);
    expect(dashboard.warnings.some((warning) => warning.includes('손상'))).toBe(true);
    expect(fs.readdirSync(directory).some((name) => name.includes('.corrupt-'))).toBe(true);
  });

  it('deletes only the requested ledger entry', async () => {
    const store = new RevenueOperationsStore(filePath);
    const first = await store.addEntry({ occurredOn: '2026-07-10', channel: 'adpost', grossRevenue: 1, cost: 0 });
    const second = await store.addEntry({ occurredOn: '2026-07-11', channel: 'service', grossRevenue: 2, cost: 0 });
    await store.removeEntry(first.id);
    const dashboard = await store.getDashboard(new Date('2026-07-13T12:00:00+09:00'));
    expect(dashboard.entries.map((item) => item.id)).toEqual([second.id]);
  });

  it('deduplicates repeated warnings from the same invalid stored entry', async () => {
    fs.writeFileSync(filePath, JSON.stringify({
      version: 1,
      settings: { monthlyNetTarget: 0, currency: 'KRW' },
      entries: [{ id: 'invalid' }],
    }), 'utf8');
    const store = new RevenueOperationsStore(filePath);

    await store.getDashboard(new Date('2026-07-13T12:00:00+09:00'));
    const dashboard = await store.getDashboard(new Date('2026-07-13T12:00:00+09:00'));

    expect(dashboard.warnings.filter((warning) => warning.includes('1건')).length).toBe(1);
  });

  it('recovers the last valid backup when the primary ledger is missing', async () => {
    const backupEntry = {
      id: 'backup-entry',
      occurredOn: '2026-07-12',
      channel: 'adpost',
      grossRevenue: 500_000,
      cost: 50_000,
      clicks: 10,
      conversions: 1,
      title: '백업에서 복구한 글',
      postUrl: '',
      category: '',
      accountId: '',
      note: '',
      createdAt: '2026-07-12T12:00:00.000Z',
      updatedAt: '2026-07-12T12:00:00.000Z',
    };
    fs.writeFileSync(`${filePath}.bak`, JSON.stringify({
      version: 1,
      settings: { monthlyNetTarget: 1_000_000, currency: 'KRW' },
      entries: [backupEntry],
    }), 'utf8');

    const store = new RevenueOperationsStore(filePath);
    const dashboard = await store.getDashboard(new Date('2026-07-13T12:00:00+09:00'));

    expect(dashboard.entries.map((item) => item.id)).toEqual(['backup-entry']);
    expect(dashboard.warnings.some((warning) => warning.includes('백업'))).toBe(true);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('propagates access errors without quarantining or overwriting the ledger', async () => {
    const original = JSON.stringify({
      version: 1,
      settings: { monthlyNetTarget: 0, currency: 'KRW' },
      entries: [],
    });
    fs.writeFileSync(filePath, original, 'utf8');
    const accessError = Object.assign(new Error('locked'), { code: 'EACCES' });
    vi.spyOn(fsPromises, 'readFile').mockRejectedValueOnce(accessError);

    const store = new RevenueOperationsStore(filePath);
    await expect(store.addEntry({
      occurredOn: '2026-07-13', channel: 'adpost', grossRevenue: 1, cost: 0,
    })).rejects.toMatchObject({ code: 'EACCES' });

    expect(fs.readFileSync(filePath, 'utf8')).toBe(original);
    expect(fs.readdirSync(directory).some((name) => name.includes('.corrupt-'))).toBe(false);
  });

  it('restores the primary ledger when replacing it fails after backup rotation', async () => {
    const store = new RevenueOperationsStore(filePath);
    const existing = await store.addEntry({
      occurredOn: '2026-07-12', channel: 'adpost', grossRevenue: 100, cost: 0,
    });
    const originalRename = fsPromises.rename.bind(fsPromises);
    let renameCount = 0;
    vi.spyOn(fsPromises, 'rename').mockImplementation(async (oldPath, newPath) => {
      renameCount += 1;
      if (renameCount === 2) throw Object.assign(new Error('locked target'), { code: 'EPERM' });
      return originalRename(oldPath, newPath);
    });

    await expect(store.addEntry({
      occurredOn: '2026-07-13', channel: 'service', grossRevenue: 200, cost: 0,
    })).rejects.toMatchObject({ code: 'EPERM' });

    vi.restoreAllMocks();
    const recovered = await store.getDashboard(new Date('2026-07-13T12:00:00+09:00'));
    expect(recovered.entries.map((entry) => entry.id)).toEqual([existing.id]);
  });

  it('blocks an exact duplicate settlement from inflating the dashboard', async () => {
    const store = new RevenueOperationsStore(filePath);
    const input = {
      occurredOn: '2026-07-13',
      channel: 'shopping-connect',
      grossRevenue: 300_000,
      cost: 50_000,
      title: '중복 방지 글',
      postUrl: 'https://blog.naver.com/example/duplicate',
    } as const;
    await store.addEntry(input);

    await expect(store.addEntry(input)).rejects.toThrow('동일한 정산');
    const dashboard = await store.getDashboard(new Date('2026-07-13T12:00:00+09:00'));
    expect(dashboard.entries).toHaveLength(1);
    expect(dashboard.currentMonth.netProfit).toBe(250_000);
  });
});
