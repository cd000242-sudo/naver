(function attachAdminShellTools(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.AdminShellTools = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAdminShellTools() {
    'use strict';

    const DAY_MS = 86400e3;
    const KST_OFFSET_MS = 9 * 3600e3;
    const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
    const SERVER_ORDER_CAP = 30; // analytics-dashboard returns at most 30 recent orders
    const FAIL_TEXT = '불러오지 못했습니다';

    function escapeHtml(value) {
        return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
        ));
    }

    function formatWon(value) {
        if (value == null || value === '') return '-';
        const n = Number(value);
        return Number.isFinite(n) ? '₩' + n.toLocaleString('ko-KR') : '-';
    }

    function toDate(value) {
        const d = value instanceof Date ? value : new Date(value);
        return Number.isNaN(d.getTime()) ? null : d;
    }

    /** Calendar day in Korea (UTC+9) as YYYY-MM-DD, or '' when the value is not a date. */
    function kstDateKey(value) {
        const d = toDate(value);
        return d ? new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10) : '';
    }

    function kstWeekday(value) {
        const d = toDate(value);
        return d ? WEEKDAYS[new Date(d.getTime() + KST_OFFSET_MS).getUTCDay()] : '';
    }

    function pendingCount(list) {
        if (!Array.isArray(list)) return null;
        return list.filter((item) => item && item.status === 'pending').length;
    }

    function registeredOn(users, dayKey) {
        if (!Array.isArray(users)) return null;
        return users.filter((u) => u && kstDateKey(u.registeredAt) === dayKey).length;
    }

    /** Used trial codes whose expiry falls between now and now + days. */
    function trialExpiring(codes, now, days) {
        if (!Array.isArray(codes)) return null;
        const from = now.getTime();
        const to = from + (days || 3) * DAY_MS;
        return codes.filter((c) => {
            if (!c || c.used !== true || !/^TRIAL/i.test(String(c.type || ''))) return false;
            const d = toDate(c.expiresAt);
            return !!d && d.getTime() > from && d.getTime() <= to;
        }).length;
    }

    function ordersByDay(orders, now, n) {
        const span = n || 7;
        const list = Array.isArray(orders) ? orders : [];
        const days = [];
        for (let i = span - 1; i >= 0; i -= 1) {
            const at = new Date(now.getTime() - i * DAY_MS);
            days.push({ key: kstDateKey(at), label: kstWeekday(at), count: 0, isToday: i === 0 });
        }
        const byKey = Object.fromEntries(days.map((d) => [d.key, d]));
        let oldest = Infinity;
        list.forEach((o) => {
            const d = toDate(o && o.createdAt);
            if (!d) return;
            oldest = Math.min(oldest, d.getTime());
            const bucket = byKey[kstDateKey(d)];
            if (bucket) bucket.count += 1;
        });
        // Capped list whose oldest row is still inside the window: older rows may be missing.
        const truncated = list.length >= SERVER_ORDER_CAP && oldest >= new Date(days[0].key + 'T00:00:00+09:00').getTime();
        return { days, truncated };
    }

    const card = (key, label, ok, value, sub) => ({ key, label, ok, value: ok ? value : '-', sub: ok ? sub : FAIL_TEXT });

    function buildKpis(src, now) {
        const t = src.today && src.today.sales ? src.today : null;
        const todayKey = kstDateKey(now);
        const trials = registeredOn(src.trial, todayKey);
        const sales = t ? t.sales : {};
        const methods = t && Array.isArray(t.recentOrders) ? t.recentOrders : [];
        const bank = methods.filter((o) => o && o.method === '계좌이체').length;
        const monthRevenue = src.month && src.month.sales ? src.month.sales.revenue : null;
        return [
            card('visitors', '오늘 방문', !!t, (Number(t && t.visitors && t.visitors.unique) || 0).toLocaleString('ko-KR') + '명', '내 방문 제외'),
            card('trials', '오늘 체험 신청', trials !== null, (trials || 0).toLocaleString('ko-KR') + '명', '전체 ' + (Array.isArray(src.trial) ? src.trial.length : 0).toLocaleString('ko-KR') + '명'),
            card('orders', '오늘 주문', !!t, (Number(sales.orders) || 0).toLocaleString('ko-KR') + '건', '결제 ' + (methods.length - bank) + ' · 계좌이체 ' + bank),
            card('revenue', '오늘 매출', !!t, formatWon(Number(sales.revenue) || 0), monthRevenue == null ? '이번 달 -' : '이번 달 ' + formatWon(monthRevenue)),
        ];
    }

    function buildTodo(src, now) {
        const make = (key, tab, title, hint, count) => ({ key, tab, title, hint, ok: count !== null, count: count === null ? 0 : count });
        return [
            make('bank', 'bank', '계좌이체 입금 확인', '입금을 확인하고 코드를 보내 주세요', pendingCount(src.bank)),
            make('reviews', 'reviews', '후기 승인', '승인 기다리는 후기', pendingCount(src.reviews)),
            make('income', 'income', '수익 인증 승인', '승인 기다리는 수익 인증', pendingCount(src.income)),
            make('tips', 'tips', '활용 팁 승인', '승인 기다리는 활용 팁', pendingCount(src.tips)),
            make('trialEnd', 'licenses', '체험 만료 예정', '3일 안에 끝나는 체험 코드', trialExpiring(src.codes, now, 3)),
        ];
    }

    /** One pass over already-fetched GAS answers. A null source marks only its own cards as failed. */
    function summarize(src, now) {
        const month = src.month && Array.isArray(src.month.recentOrders) ? src.month : null;
        const bars = month ? ordersByDay(month.recentOrders, now, 7) : { days: [], truncated: false };
        const items = month ? month.recentOrders.slice(0, 5).map((o) => ({
            title: o.productName || o.product || '-',
            sub: [o.method || '', shortWhen(o.createdAt)].filter(Boolean).join(' · '),
            amount: formatWon(o.amount),
        })) : [];
        return {
            kpis: buildKpis(src, now),
            todo: buildTodo(src, now),
            bars: { ok: !!month, truncated: bars.truncated, days: bars.days },
            recent: { ok: !!month, items },
        };
    }

    function shortWhen(value) {
        const d = toDate(value);
        if (!d) return '';
        const k = new Date(d.getTime() + KST_OFFSET_MS).toISOString();
        return k.slice(5, 10).replace('-', '.') + ' ' + k.slice(11, 16);
    }

    function renderKpis(kpis) {
        return kpis.map((k, i) => `<div class="kpi${i === 0 ? ' kpi-hero' : ''}${k.ok ? '' : ' is-failed'}">`
            + `<span>${escapeHtml(k.label)}</span><b>${escapeHtml(k.value)}</b><small>${escapeHtml(k.sub)}</small></div>`).join('');
    }

    function renderTodo(todo) {
        return '<ul class="todo">' + todo.map((t) => {
            const num = t.ok ? `<em>${escapeHtml(t.count)}건</em>` : '<em class="is-failed">-</em>';
            const hint = t.ok ? t.hint : FAIL_TEXT;
            return `<li><button type="button" class="todo-tile${t.ok && t.count === 0 ? ' is-zero' : ''}" data-go="${escapeHtml(t.tab)}">`
                + `${num}<span class="todo-t"><b>${escapeHtml(t.title)}</b><small>${escapeHtml(hint)}</small></span><span class="arrow" aria-hidden="true">→</span></button></li>`;
        }).join('') + '</ul>';
    }

    function renderBars(bars) {
        if (!bars.ok) return `<p class="empty">${FAIL_TEXT}</p>`;
        const max = Math.max(1, ...bars.days.map((d) => d.count));
        const cols = bars.days.map((d) => `<div class="bar-col${d.isToday ? ' is-today' : ''}"><span class="bar-v">${d.count}</span>`
            + `<i style="height:${Math.max(4, Math.round((d.count / max) * 100))}%"></i><span class="bar-l">${escapeHtml(d.label)}</span></div>`).join('');
        const note = bars.truncated ? '<p class="bars-note">서버가 최근 30건만 보내 주어 일부 주문이 빠졌을 수 있습니다.</p>' : '';
        return `<div class="bars" role="img" aria-label="최근 7일 주문 건수">${cols}</div>${note}`;
    }

    function renderRecent(recent) {
        if (!recent.ok) return `<p class="empty">${FAIL_TEXT}</p>`;
        if (!recent.items.length) return '<p class="empty">이번 달 주문이 없습니다.</p>';
        return '<ul class="list">' + recent.items.map((o) => `<li><b class="grow">${escapeHtml(o.title)}</b>`
            + `<small class="faint">${escapeHtml(o.sub)}</small><span class="amount-sm">${escapeHtml(o.amount)}</span></li>`).join('') + '</ul>';
    }

    return Object.freeze({
        escapeHtml, formatWon, kstDateKey, pendingCount, registeredOn, trialExpiring, ordersByDay,
        summarize, renderKpis, renderTodo, renderBars, renderRecent,
    });
});
