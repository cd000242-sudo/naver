import { describe, expect, it } from 'vitest';

import {
  buildRevenueDashboard,
  validateRevenueEntryInput,
  type RevenueEntry,
  type RevenueSettings,
} from '../analytics/revenueOperations';

const settings: RevenueSettings = {
  monthlyNetTarget: 5_000_000,
  currency: 'KRW',
};

function entry(overrides: Partial<RevenueEntry> = {}): RevenueEntry {
  return {
    id: 'entry-1',
    occurredOn: '2026-07-10',
    channel: 'shopping-connect',
    grossRevenue: 1_200_000,
    cost: 200_000,
    clicks: 120,
    conversions: 12,
    title: '여름 가전 구매 기준',
    postUrl: 'https://blog.naver.com/test/123',
    category: 'living',
    accountId: 'main',
    note: '',
    createdAt: '2026-07-10T12:00:00.000Z',
    updatedAt: '2026-07-10T12:00:00.000Z',
    ...overrides,
  };
}

describe('revenueOperations validation', () => {
  it('normalizes valid actual revenue input', () => {
    const normalized = validateRevenueEntryInput({
      occurredOn: '2026-07-10',
      channel: 'adpost',
      grossRevenue: '120000',
      cost: '20000',
      clicks: '10',
      conversions: '2',
      postUrl: 'https://blog.naver.com/test/123',
    });

    expect(normalized.grossRevenue).toBe(120_000);
    expect(normalized.cost).toBe(20_000);
    expect(normalized.channel).toBe('adpost');
  });

  it('treats blank optional click and conversion counts as zero', () => {
    const normalized = validateRevenueEntryInput({
      occurredOn: '2026-07-10',
      channel: 'adpost',
      grossRevenue: 120_000,
      cost: 0,
      clicks: '',
      conversions: '   ',
    });

    expect(normalized.clicks).toBe(0);
    expect(normalized.conversions).toBe(0);
  });

  it('rejects negative money, invalid dates, and unsupported URLs', () => {
    expect(() => validateRevenueEntryInput({
      occurredOn: '2026-02-31', channel: 'adpost', grossRevenue: -1, cost: 0,
    })).toThrow();
    expect(() => validateRevenueEntryInput({
      occurredOn: '2026-07-10', channel: 'adpost', grossRevenue: 1, cost: -1,
    })).toThrow();
    expect(() => validateRevenueEntryInput({
      occurredOn: '2026-07-10', channel: 'adpost', grossRevenue: 1, cost: 0, postUrl: 'javascript:alert(1)',
    })).toThrow();
  });
});

describe('buildRevenueDashboard', () => {
  const now = new Date('2026-07-13T12:00:00+09:00');

  it('does not claim full-time viability without actual data', () => {
    const result = buildRevenueDashboard([], settings, now);
    expect(result.proof.status).toBe('no_data');
    expect(result.currentMonth.netProfit).toBe(0);
    expect(result.currentMonth.forecastNetProfit).toBe(0);
    expect(result.actions[0]).toContain('실제 정산');
  });

  it('calculates actual gross, cost, net profit, ROI, and target pace', () => {
    const result = buildRevenueDashboard([
      entry(),
      entry({ id: 'entry-2', channel: 'adpost', grossRevenue: 300_000, cost: 0, clicks: 0, conversions: 0 }),
    ], settings, now);

    expect(result.currentMonth.grossRevenue).toBe(1_500_000);
    expect(result.currentMonth.cost).toBe(200_000);
    expect(result.currentMonth.netProfit).toBe(1_300_000);
    expect(result.currentMonth.targetAttainmentPct).toBe(26);
    expect(result.currentMonth.forecastNetProfit).toBeGreaterThan(result.currentMonth.netProfit);
    expect(result.channels[0].netProfit).toBeGreaterThanOrEqual(result.channels[1].netProfit);
  });

  it('requires three completed target months and reasonable channel diversification', () => {
    const history: RevenueEntry[] = [];
    for (const month of ['04', '05', '06']) {
      history.push(entry({
        id: `${month}-affiliate`, occurredOn: `2026-${month}-10`, channel: 'affiliate',
        grossRevenue: 3_000_000, cost: 250_000,
      }));
      history.push(entry({
        id: `${month}-service`, occurredOn: `2026-${month}-20`, channel: 'service',
        grossRevenue: 3_000_000, cost: 750_000,
      }));
    }

    const result = buildRevenueDashboard(history, settings, now);
    expect(result.proof.status).toBe('validated');
    expect(result.proof.consecutiveTargetMonths).toBe(3);
    expect(result.proof.highestChannelSharePct).toBeLessThanOrEqual(80);
  });

  it('keeps a three-month target result in scaling status when one channel dominates', () => {
    const history = ['04', '05', '06'].map((month, index) => entry({
      id: `single-${index}`, occurredOn: `2026-${month}-15`, channel: 'sponsorship',
      grossRevenue: 5_500_000, cost: 200_000,
    }));

    const result = buildRevenueDashboard(history, settings, now);
    expect(result.proof.status).toBe('scaling');
    expect(result.proof.highestChannelSharePct).toBe(100);
    expect(result.actions.some((action) => action.includes('편중'))).toBe(true);
  });

  it('includes an entry from today in the trailing 90-day total before noon', () => {
    const earlyMorning = new Date('2026-07-13T02:00:00+09:00');
    const result = buildRevenueDashboard([entry({ occurredOn: '2026-07-13' })], settings, earlyMorning);

    expect(result.trailing90Days.netProfit).toBe(1_000_000);
  });

  it('does not call a thin current-month sample a high-confidence forecast', () => {
    const history = Array.from({ length: 30 }, (_, index) => entry({
      id: `history-${index}`,
      occurredOn: `2026-${String((index % 3) + 4).padStart(2, '0')}-${String((index % 20) + 1).padStart(2, '0')}`,
    }));
    const result = buildRevenueDashboard(
      [...history, entry({ id: 'current-only' })],
      settings,
      new Date('2026-07-13T12:00:00+09:00'),
    );

    expect(result.currentMonth.forecastConfidence).toBe('low');
  });

  it('describes the proof as an input-based threshold, not external certification', () => {
    const history: RevenueEntry[] = [];
    for (const month of ['04', '05', '06']) {
      history.push(entry({ id: `${month}-a`, occurredOn: `2026-${month}-10`, channel: 'affiliate', grossRevenue: 3_000_000, cost: 0 }));
      history.push(entry({ id: `${month}-b`, occurredOn: `2026-${month}-20`, channel: 'service', grossRevenue: 3_000_000, cost: 0 }));
    }

    const result = buildRevenueDashboard(history, settings, now);
    expect(result.proof.label).toContain('기준 달성');
    expect(result.proof.reason).toContain('입력된 실제 정산');
  });
});
