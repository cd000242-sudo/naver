// Fake Google Apps Script answers for the admin e2e harness. Shapes follow the live GAS handlers
// (list, analytics-dashboard, trial-list, bank-list, get-*-admin, get-leads-admin).
const DAY = 86400e3;

export function buildFixtures(now = new Date()) {
  const at = (days, hours = 0) => new Date(now.getTime() - days * DAY - hours * 3600e3).toISOString();
  const order = (id, productName, amount, method, days, hours = 0) => ({ orderId: id, email: id + '@example.com', productName, amount, method, createdAt: at(days, hours) });

  const monthOrders = [
    order('T-05', 'Better Life Naver 1년', 330000, 'Toss', 0, 1),
    order('T-04', 'LEWORD 월 이용', 49000, 'Toss', 0, 2),
    order('B-03', 'Better Life Naver 평생', 590000, '계좌이체', 1),
    order('T-02', 'LEWORD 1년', 390000, 'Toss', 1, 3),
    order('T-01', '<img src=x onerror=alert(1)> 시험상품', 68000, 'Toss', 3),
    order('T-00', 'LEWORD 월 이용', 49000, 'Toss', 5),
  ];
  const todayOrders = monthOrders.slice(0, 2);
  const code = (c, type, used, expiresInDays) => ({
    code: c, platform: 'ALL', type, used, userId: used ? 'user-' + c : '', userPassword: used ? 'pw-fake' : '',
    usedAt: used ? at(1) : '', expiresAt: expiresInDays == null ? '' : new Date(now.getTime() + expiresInDays * DAY).toISOString(),
  });
  const codes = [
    code('BLN-0001', 'YEAR1', true, 200), code('BLN-0002', 'LIFE', true, null), code('TRL-0003', 'TRIAL7', true, 2),
    code('TRL-0004', 'TRIAL7', true, -1), code('BLN-0005', 'MONTH1', false, 30), code('BLN-0006', 'MONTH3', true, 40),
  ];
  const users = [
    { email: 'a@example.com', nickname: 'a', phone: '010-0000-0001', blocked: 'false', registeredAt: at(0, 1), lastActiveAt: at(0, 1), totalActivations: 1 },
    { email: 'b@example.com', nickname: 'b', phone: '010-0000-0002', blocked: 'false', registeredAt: at(0, 2), lastActiveAt: at(0, 2), totalActivations: 2 },
    { email: 'c@example.com', nickname: 'c', phone: '010-0000-0003', blocked: 'true', registeredAt: at(4), lastActiveAt: at(3), totalActivations: 1 },
  ];
  const bank = ['pending', 'pending', 'approved', 'rejected'].map((status, i) => ({ orderId: 'BK-' + i, name: 'Kim', email: 'k' + i + '@example.com', product: 'LEWORD', amount: 49000, status, createdAt: at(i) }));
  const reviews = ['pending', 'pending', 'approved'].map((status, i) => ({ timestamp: at(i), author: 'r' + i, rating: 5, summary: 'good', detail: 'good', hidden: false, status }));
  const income = ['pending', 'pending', 'pending', 'approved'].map((status, i) => ({ id: 'inc-' + i, timestamp: at(i), emoji: '💰', amount: '10만원', author: 'i' + i, date: '11.0' + i, desc: 'desc', tags: '', status }));
  const tips = ['pending', 'approved'].map((status, i) => ({ timestamp: at(i), author: 't' + i, title: 'tip', detail: 'tip', hidden: false, status }));
  const leads = [
    { id: 'L1', email: 'lead1@example.com', source: 'download', productInterest: 'LEWORD', timestamp: at(0, 3).slice(0, 19), notes: '' },
    { id: 'L2', email: '"><script>window.__xss=1</script>@example.com', source: '<b>x</b>', productInterest: 'Orbit', timestamp: at(1).slice(0, 19), notes: '' },
    { id: 'L3', email: 'lead3@example.com', source: 'popup', productInterest: '', timestamp: at(2).slice(0, 19), notes: '' },
  ];

  function respond(action, body = {}) {
    switch (action) {
      case 'list': return { ok: true, data: codes };
      case 'analytics-dashboard':
        if (body.period === 'month') return { ok: true, success: true, period: 'month', sales: { revenue: 2318000, orders: monthOrders.length }, visitors: { unique: 4000, pageviews: 5000, internalPageviews: 9 }, recentOrders: monthOrders, updatedAt: now.toISOString() };
        return { ok: true, success: true, period: 'today', sales: { revenue: 379000, orders: 2 }, visitors: { unique: 312, pageviews: 400, internalPageviews: 4 }, recentOrders: todayOrders, updatedAt: now.toISOString() };
      case 'trial-list': return { ok: true, total: users.length, users };
      case 'bank-list': return { ok: true, orders: bank };
      case 'get-reviews-admin': return { success: true, reviews };
      case 'get-income-admin': return { success: true, income };
      case 'get-tips-admin': return { success: true, tips };
      case 'get-leads-admin': return { success: true, leads };
      case 'get-notices': return { success: true, notices: [], revision: 1 };
      case 'site-content': return { success: true, ok: true, content: {} };
      default: return { ok: true, success: true };
    }
  }
  return { respond, codes, users, bank, reviews, income, tips, leads, monthOrders, todayOrders, now };
}
