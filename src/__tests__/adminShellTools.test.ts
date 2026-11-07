import { describe, expect, it } from 'vitest';

// Browser-safe helper loaded by admin/index.html (same pattern as keyword-briefing-tools).
const tools = require('../../admin/shell-tools.js') as {
  escapeHtml(v: unknown): string;
  formatWon(v: unknown): string;
  kstDateKey(v: unknown): string;
  pendingCount(list: unknown): number | null;
  trialExpiring(codes: unknown, now: Date, days?: number): number | null;
  ordersByDay(orders: unknown, now: Date, n?: number): { days: { key: string; label: string; count: number; isToday: boolean }[]; truncated: boolean };
  summarize(src: Record<string, unknown>, now: Date): any;
  renderKpis(k: unknown): string;
  renderTodo(t: unknown): string;
  renderBars(b: unknown): string;
  renderRecent(r: unknown): string;
};

// 2026-11-07 14:00 KST (Saturday).
const NOW = new Date('2026-11-07T05:00:00Z');
const ago = (days: number, hours = 0) => new Date(NOW.getTime() - days * 86400e3 - hours * 3600e3).toISOString();
const inDays = (days: number) => new Date(NOW.getTime() + days * 86400e3).toISOString();

const order = (id: string, name: string, method: string, days: number, hours = 0, amount = 1000) =>
  ({ orderId: id, productName: name, method, amount, createdAt: ago(days, hours) });

const monthOrders = [
  order('a', '상품A', 'Toss', 0, 1, 330000), order('b', '상품B', '계좌이체', 0, 2, 49000),
  order('c', '<img src=x onerror=alert(1)>', 'Toss', 1), order('d', '상품D', 'Toss', 1, 3),
  order('e', '상품E', 'Toss', 3), order('f', '상품F', 'Toss', 5),
];
const full = () => ({
  today: { sales: { orders: 2, revenue: 379000 }, visitors: { unique: 312, internalPageviews: 4 }, recentOrders: monthOrders.slice(0, 2) },
  month: { sales: { orders: 6, revenue: 2318000 }, recentOrders: monthOrders },
  trial: [{ registeredAt: ago(0, 1) }, { registeredAt: ago(0, 2) }, { registeredAt: ago(4) }, { registeredAt: 'garbage' }],
  bank: [{ status: 'pending' }, { status: 'pending' }, { status: 'approved' }, { status: 'rejected' }],
  reviews: [{ status: 'pending' }, { status: 'pending' }, { status: 'approved' }],
  income: [{ status: 'pending' }, { status: 'pending' }, { status: 'pending' }, { status: 'approved' }],
  tips: [{ status: 'pending' }, { status: 'approved' }],
  codes: [
    { type: 'TRIAL7', used: true, expiresAt: inDays(2) }, { type: 'TRIAL7', used: true, expiresAt: inDays(-1) },
    { type: 'TRIAL7', used: false, expiresAt: inDays(1) }, { type: 'LIFE', used: true, expiresAt: '' },
    { type: 'TRIAL7', used: true, expiresAt: inDays(9) },
  ],
});

describe('admin shell tools - helpers', () => {
  it('escapes every HTML-significant character', () => {
    expect(tools.escapeHtml('<a href="x">&\'')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
    expect(tools.escapeHtml(null)).toBe('');
  });
  it('formats won and falls back to a dash', () => {
    expect(tools.formatWon(447000)).toBe('₩447,000');
    expect(tools.formatWon(null)).toBe('-');
    expect(tools.formatWon('abc')).toBe('-');
  });
  it('keys dates by the Korean calendar day', () => {
    expect(tools.kstDateKey('2026-11-06T16:00:00Z')).toBe('2026-11-07');
    expect(tools.kstDateKey('not a date')).toBe('');
  });
  it('counts pending items and refuses non-arrays', () => {
    expect(tools.pendingCount([{ status: 'pending' }, { status: 'approved' }, {}])).toBe(1);
    expect(tools.pendingCount(null)).toBeNull();
    expect(tools.pendingCount({ status: 'pending' })).toBeNull();
  });
  it('counts only used trial codes that end within the window', () => {
    expect(tools.trialExpiring(full().codes, NOW, 3)).toBe(1);
    expect(tools.trialExpiring(undefined, NOW, 3)).toBeNull();
  });
});

describe('admin shell tools - order bars', () => {
  it('builds seven Korean-day buckets ending today', () => {
    const { days, truncated } = tools.ordersByDay(monthOrders, NOW, 7);
    expect(days).toHaveLength(7);
    expect(days.map((d) => d.count)).toEqual([0, 1, 0, 1, 0, 2, 2]);
    expect(days[6]).toMatchObject({ isToday: true, label: '토' });
    expect(truncated).toBe(false);
  });
  it('flags a truncated list when the server cap of 30 rows is hit inside the window', () => {
    const many = Array.from({ length: 30 }, (_, i) => order('x' + i, 'p', 'Toss', 0, i % 5));
    expect(tools.ordersByDay(many, NOW, 7).truncated).toBe(true);
  });
});

describe('admin shell tools - summarize', () => {
  it('derives every card from existing GAS data', () => {
    const s = tools.summarize(full(), NOW);
    const k = Object.fromEntries(s.kpis.map((c: any) => [c.key, c]));
    expect(k.visitors).toMatchObject({ ok: true, value: '312명' });
    expect(k.trials).toMatchObject({ ok: true, value: '2명' });
    expect(k.orders).toMatchObject({ ok: true, value: '2건' });
    expect(k.orders.sub).toContain('계좌이체 1');
    expect(k.revenue).toMatchObject({ ok: true, value: '₩379,000' });
    expect(k.revenue.sub).toContain('₩2,318,000');
    const t = Object.fromEntries(s.todo.map((x: any) => [x.key, x]));
    expect([t.bank.count, t.reviews.count, t.income.count, t.tips.count, t.trialEnd.count]).toEqual([2, 2, 3, 1, 1]);
    expect(t.bank.tab).toBe('bank');
    expect(t.trialEnd.tab).toBe('licenses');
    expect(s.recent.items).toHaveLength(5);
    expect(s.bars.ok).toBe(true);
  });

  it('degrades only the card whose source failed', () => {
    const src = { ...full(), today: null, bank: null };
    const s = tools.summarize(src, NOW);
    const k = Object.fromEntries(s.kpis.map((c: any) => [c.key, c]));
    expect(k.visitors.ok).toBe(false);
    expect(k.orders.ok).toBe(false);
    expect(k.revenue.ok).toBe(false);
    expect(k.trials.ok).toBe(true);
    const t = Object.fromEntries(s.todo.map((x: any) => [x.key, x]));
    expect(t.bank.ok).toBe(false);
    expect(t.reviews.ok).toBe(true);
    expect(tools.renderKpis(s.kpis)).toContain('불러오지 못했습니다');
    expect(tools.renderTodo(s.todo)).toContain('불러오지 못했습니다');
  });
});

describe('admin shell tools - rendering', () => {
  it('escapes server text everywhere it is drawn', () => {
    const s = tools.summarize(full(), NOW);
    const html = tools.renderRecent(s.recent) + tools.renderBars(s.bars) + tools.renderTodo(s.todo) + tools.renderKpis(s.kpis);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(html).not.toMatch(/onclick=/i);
  });
  it('makes todo tiles navigable through data-go', () => {
    const html = tools.renderTodo(tools.summarize(full(), NOW).todo);
    for (const tab of ['bank', 'reviews', 'income', 'tips', 'licenses']) expect(html).toContain(`data-go="${tab}"`);
  });
  it('shows an honest empty state when there are no recent orders', () => {
    expect(tools.renderRecent({ ok: true, items: [] })).toContain('주문이 없습니다');
    expect(tools.renderRecent({ ok: false, items: [] })).toContain('불러오지 못했습니다');
  });
});
