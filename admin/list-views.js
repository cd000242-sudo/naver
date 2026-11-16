(function attachAdminListViews(root, factory) {
    const api = factory(root.AdminShellTools || (typeof require === 'function' ? require('./shell-tools.js') : null));
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.AdminListViews = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAdminListViews(shellTools) {
    'use strict';
    // Card rows for the deposit, licence, order and trial lists. Pure string builders: the inline render
    // functions in index.html pass the page of items they already fetched. Buttons keep the exact onclick
    // calls of the old tables (approveBankOrder('id'), revokeCode('code') ...), so requests do not change.

    const esc = shellTools.escapeHtml;
    const KST_OFFSET_MS = 9 * 3600e3;
    const DAY_MS = 86400e3;
    // Labels already used by the issue form (#issue-type) and platformBadge().
    const TYPE_LABEL = Object.freeze({ MONTH1: '1개월', MONTH3: '3개월', YEAR1: '1년', LIFE: '영구제', TRIAL7: '7일 체험' });
    const PLATFORM_LABEL = Object.freeze({ ALL: '올인원', NAVER: 'NAVER', BLOGGER: 'Orbit', LEADERNAM: 'Orbit', TISTORY: 'Tistory', LEWORD: 'LEWORD' });
    const BANK_STATUS = Object.freeze({ pending: '입금 확인 대기', approved: '승인됨', rejected: '거절됨' });

    function toDate(value) {
        if (!value) return null;
        const d = value instanceof Date ? value : new Date(value);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    /** Korean calendar date "2026.11.16" (and " 14:05" with time), '' for empty values. */
    function kst(value, withTime) {
        const d = toDate(value);
        if (!d) return '';
        const s = new Date(d.getTime() + KST_OFFSET_MS).toISOString();
        return s.slice(0, 10).replace(/-/g, '.') + (withTime ? ' ' + s.slice(11, 16) : '');
    }
    const typeLabel = (t) => TYPE_LABEL[String(t || '').toUpperCase()] || String(t || '') || '-';
    const platformLabel = (p) => PLATFORM_LABEL[String(p || '').toUpperCase()] || String(p || '') || '-';
    const won = (n) => (Number(n) ? Number(n).toLocaleString('ko-KR') + '원' : '');
    const meta = (parts) => parts.filter(Boolean).map(esc).join(' · ');
    const empty = (text) => `<p class="q-empty">${esc(text)}</p>`;
    const list = (rows, label) => `<ul class="q-list lv-list" aria-label="${esc(label)}">${rows.join('')}</ul>`;

    function bankRow(o) {
        const id = esc(o.orderId);
        const status = o.status || '';
        const acts = status === 'pending'
            ? `<button type="button" class="btn btn-gold" onclick="approveBankOrder('${id}')">입금 확인</button>`
              + `<button type="button" class="btn" onclick="rejectBankOrder('${id}')">거절</button>`
            : '';
        const code = o.licenseCode ? `<span class="lv-code">${esc(o.licenseCode)}</span>` : '';
        return `<li class="q-row lv-row lv-bank${status === 'pending' ? '' : ' is-done'}"><div class="q-main">`
            + `<div class="q-top"><span class="q-title">${esc(o.name || '-')}</span><span class="lv-amount num">${esc(won(o.amount) || '-')}</span>`
            + `<span class="q-status st-${esc(status)}">${esc(BANK_STATUS[status] || status)}</span></div>`
            + `<span class="lv-id">주문번호 <b class="num">${id || '-'}</b></span>`
            + `<span class="q-meta">${meta([o.product, o.email, kst(o.createdAt, true)])}</span>${code}`
            + `</div><div class="q-acts">${acts}</div></li>`;
    }
    function renderBankList(items) {
        return items.length ? list(items.map(bankRow), '계좌이체 주문') : empty('해당하는 주문이 없습니다');
    }

    function trialRow(u) {
        const blocked = u.blocked === 'true' || u.blocked === 'Y';
        const email = esc(u.email);
        const btn = blocked
            ? `<button type="button" class="btn" onclick="toggleBlockTrialUser('${email}', false)">차단 해제</button>`
            : `<button type="button" class="btn btn-red" onclick="toggleBlockTrialUser('${email}', true)">차단</button>`;
        return `<li class="q-row lv-row${blocked ? ' is-done' : ''}"><div class="q-main">`
            + `<div class="q-top"><span class="q-title">${esc(u.nickname || '-')}</span>`
            + `<span class="q-status ${blocked ? 'st-rejected' : 'st-approved'}">${blocked ? '차단됨' : '사용 중'}</span></div>`
            + `<span class="lv-id">${email || '-'}${u.phone ? ' · ' + esc(u.phone) : ''}</span>`
            + `<span class="q-meta">${meta(['등록 ' + (kst(u.registeredAt) || '-'), u.lastActiveAt ? '최근 ' + kst(u.lastActiveAt, true) : '', '활성화 ' + (Number(u.totalActivations) || 0) + '회'])}</span>`
            + `</div><div class="q-acts">${btn}</div></li>`;
    }
    function renderTrialList(items) {
        return items.length ? list(items.map(trialRow), '체험 사용자') : empty('체험 사용자가 없습니다');
    }

    function codeState(c, now) {
        if (c.used) return ['사용 중', 'st-approved'];
        const exp = toDate(c.expiresAt);
        if (exp && exp < now) return ['만료', 'st-rejected'];
        return ['미사용', 'st-pending'];
    }
    function codeRow(c, now) {
        const [label, cls] = codeState(c, now);
        const code = esc(c.code);
        return `<li class="q-row lv-row"><div class="q-main">`
            + `<div class="q-top"><span class="q-title lv-code">${code || '-'}</span><span class="q-kind">${esc(platformLabel(c.platform))}</span>`
            + `<span class="q-kind">${esc(typeLabel(c.type))}</span><span class="q-status ${cls}">${label}</span></div>`
            + `<span class="q-meta">${meta([(c.userId || c.user) ? '사용자 ' + (c.userId || c.user) : '', c.userPassword ? '비밀번호 ••••••' : '', c.expiresAt ? '만료 ' + kst(c.expiresAt) : ''])}</span>`
            + `</div><div class="q-acts"><button type="button" class="btn btn-red" onclick="revokeCode('${code}')">무효화</button></div></li>`;
    }
    function renderCodeList(items, now) {
        const at = now || new Date();
        return items.length ? list(items.map((c) => codeRow(c, at)), '라이선스 코드') : empty('코드가 없습니다');
    }

    function orderRow(c, now) {
        const exp = toDate(c.expiresAt);
        const expired = exp && exp < now;
        return `<li class="q-row lv-row"><div class="q-main">`
            + `<div class="q-top"><span class="q-title">${esc(c.userId || '-')}</span><span class="q-kind">${esc(platformLabel(c.platform))}</span>`
            + `<span class="q-kind">${esc(typeLabel(c.type))}</span><span class="q-status ${expired ? 'st-rejected' : 'st-approved'}">${expired ? '만료' : '사용 중'}</span></div>`
            + `<span class="lv-id lv-code">${esc(c.code || '-')}</span>`
            + `<span class="q-meta">${meta(['활성화 ' + (kst(c.usedAt, true) || '-'), '만료 ' + (exp ? kst(exp) : '영구'), c.userPassword ? '비밀번호 ••••••' : ''])}</span>`
            + '</div></li>';
    }
    function renderOrderList(items, now) {
        const at = now || new Date();
        return items.length ? list(items.map((c) => orderRow(c, at)), '주문') : empty('조건에 맞는 주문이 없습니다');
    }

    /** Filters activated codes by activation period (all | today | 7 | 30 days) and state (all | active | expired). */
    function filterOrders(orders, filter, now) {
        const f = filter || {};
        const at = now || new Date();
        const days = f.period === 'today' ? 0 : Number(f.period) || null;
        const todayKey = kst(at);
        return orders.filter((c) => {
            if (f.period === 'today' && kst(c.usedAt) !== todayKey) return false;
            if (days) { const d = toDate(c.usedAt); if (!d || at - d > days * DAY_MS) return false; }
            if (f.state === 'all' || !f.state) return true;
            const exp = toDate(c.expiresAt);
            const expired = !!(exp && exp < at);
            return f.state === 'expired' ? expired : !expired;
        });
    }

    /** Free-text match for the licence search box: code, user, e-mail, name, platform or type label. */
    function matchesCode(c, query) {
        const q = String(query || '').trim().toLowerCase();
        if (!q) return true;
        return [c.code, c.userId, c.user, c.email, c.name, c.platform, platformLabel(c.platform), c.type, typeLabel(c.type)]
            .some((v) => String(v || '').toLowerCase().includes(q));
    }

    return Object.freeze({
        TYPE_LABEL, PLATFORM_LABEL, kst, typeLabel, platformLabel,
        renderBankList, renderTrialList, renderCodeList, renderOrderList, filterOrders, matchesCode,
    });
});
