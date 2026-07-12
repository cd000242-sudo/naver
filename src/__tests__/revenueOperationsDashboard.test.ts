// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';

import { buildRevenueDashboard, type RevenueEntry } from '../analytics/revenueOperations';
import { renderRevenueOperationsDashboard } from '../renderer/modules/revenueOperationsDashboard';

function setupDashboardDom(): void {
  document.body.innerHTML = `
    <span id="revenue-proof-badge"></span>
    <span id="revenue-proof-reason"></span>
    <div id="revenue-warning"></div>
    <div id="revenue-kpi-grid"></div>
    <input id="revenue-monthly-target">
    <div id="revenue-month-evidence"></div>
    <ol id="revenue-actions"></ol>
    <table><tbody id="revenue-channel-rows"></tbody></table>
    <table><tbody id="revenue-content-rows"></tbody></table>
    <table><tbody id="revenue-entry-rows"></tbody></table>
  `;
}

function entry(): RevenueEntry {
  return {
    id: 'actual-1',
    occurredOn: '2026-07-10',
    channel: 'shopping-connect',
    grossRevenue: 1_200_000,
    cost: 200_000,
    clicks: 100,
    conversions: 8,
    title: '<img src=x onerror=alert(1)> 실제 후기',
    postUrl: 'https://blog.naver.com/example/1',
    category: '리빙',
    accountId: 'main',
    note: '',
    createdAt: '2026-07-10T12:00:00.000Z',
    updatedAt: '2026-07-10T12:00:00.000Z',
  };
}

describe('revenueOperationsDashboard rendering', () => {
  beforeEach(setupDashboardDom);

  it('separates forecast from actual values and renders user text without HTML execution', () => {
    const dashboard = buildRevenueDashboard(
      [entry()],
      { monthlyNetTarget: 5_000_000, currency: 'KRW' },
      new Date('2026-07-13T12:00:00+09:00'),
    );

    renderRevenueOperationsDashboard(dashboard);

    const metrics = document.getElementById('revenue-kpi-grid');
    expect(metrics?.textContent).toContain('이번 달 실매출');
    expect(metrics?.textContent).toContain('월말 예상 순이익');
    expect(metrics?.textContent).toContain('예측값');
    expect(document.querySelector('#revenue-content-rows img')).toBeNull();
    expect(document.getElementById('revenue-content-rows')?.textContent).toContain('<img src=x onerror=alert(1)> 실제 후기');
  });

  it('shows an honest no-data state instead of a viability claim', () => {
    const dashboard = buildRevenueDashboard(
      [],
      { monthlyNetTarget: 5_000_000, currency: 'KRW' },
      new Date('2026-07-13T12:00:00+09:00'),
    );

    renderRevenueOperationsDashboard(dashboard);

    expect(document.getElementById('revenue-proof-badge')?.textContent).toBe('실적 없음');
    expect(document.getElementById('revenue-entry-rows')?.textContent).toContain('정산 내역이 없습니다');
  });
});
