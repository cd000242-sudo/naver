(function attachAdminApprovalTools(root, factory) {
    const api = factory(root.AdminShellTools || (typeof require === 'function' ? require('./shell-tools.js') : null));
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.AdminApprovalTools = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function createAdminApprovalTools(shellTools) {
    'use strict';
    // Pure helpers for the merged approvals screen (후기 · 수익 인증 · 팁) and the first-screen "바로 처리" list.
    // Rows only point at the existing global functions (approveReview, approveIncome ...), so the GAS
    // requests, their names and their fields stay exactly as they were.

    const esc = shellTools.escapeHtml;
    const KST_OFFSET_MS = 9 * 3600e3;
    const KINDS = Object.freeze({
        reviews: { label: '후기', keyField: 'timestamp', approve: 'approveReview', reject: 'rejectReview', edit: 'editReviewFromBtn' },
        income: { label: '수익 인증', keyField: 'id', approve: 'approveIncome', reject: 'rejectIncome', edit: 'editIncomeFromBtn', remove: 'deleteIncome' },
        tips: { label: '팁', keyField: 'timestamp', approve: 'approveTip', reject: 'rejectTip' },
    });
    const KIND_ORDER = ['reviews', 'income', 'tips'];
    const STATUS_LABEL = { pending: '대기', approved: '승인됨', rejected: '거절됨' };

    function shortWhen(value) {
        const d = new Date(value);
        if (!value || Number.isNaN(d.getTime())) return '';
        const k = new Date(d.getTime() + KST_OFFSET_MS).toISOString();
        return k.slice(5, 10).replace('-', '.') + ' ' + k.slice(11, 16);
    }

    function toRow(kind, item) {
        const meta = KINDS[kind];
        const base = { kind, key: String(item[meta.keyField] || ''), status: item.status || '', author: item.author || '', email: item.email || '' };
        if (kind === 'reviews') return { ...base, title: item.summary || '', body: item.detail || '', when: shortWhen(item.timestamp), extra: item.rating ? '별점 ' + item.rating + '/5' : '' };
        if (kind === 'income') return { ...base, title: item.amount || '', body: item.desc || '', when: item.date || '', extra: (item.tags || []).join(', ') };
        return { ...base, title: item.title || '', body: item.detail || '', when: shortWhen(item.timestamp), extra: '' };
    }

    /** Flattens { reviews, income, tips } (null = failed to load) into rows, keeping the server order per kind. */
    function toRows(lists) {
        const rows = [];
        KIND_ORDER.forEach((kind) => {
            const list = lists && Array.isArray(lists[kind]) ? lists[kind] : [];
            list.forEach((item) => { if (item) rows.push(toRow(kind, item)); });
        });
        return rows;
    }

    function filterRows(rows, kind, status) {
        return rows.filter((r) => (kind === 'all' || r.kind === kind) && (status === 'all' || r.status === status));
    }

    /** Count per kind for one status: { all, reviews, income, tips }. */
    function countByKind(rows, status) {
        const out = { all: 0, reviews: 0, income: 0, tips: 0 };
        rows.forEach((r) => { if (status === 'all' || r.status === status) { out.all += 1; out[r.kind] += 1; } });
        return out;
    }

    function actionButtons(row) {
        const meta = KINDS[row.kind];
        const data = `data-kind="${esc(row.kind)}" data-key="${esc(row.key)}"`;
        const main = [];
        if (row.status !== 'approved') main.push(`<button type="button" class="btn btn-gold" data-act="approve" ${data}>승인</button>`);
        if (row.status !== 'rejected') main.push(`<button type="button" class="btn" data-act="reject" ${data}>거절</button>`);
        return main.join('');
    }

    function extraLinks(row) {
        const meta = KINDS[row.kind];
        const data = `data-kind="${esc(row.kind)}" data-key="${esc(row.key)}"`;
        const links = (meta.edit ? `<button type="button" class="q-link" data-act="edit" ${data}>수정</button>` : '')
            + (meta.remove ? `<button type="button" class="q-link" data-act="remove" ${data}>삭제</button>` : '');
        return links ? `<div class="q-more">${links}</div>` : '';
    }

    function renderRow(row, opts) {
        const compact = !!(opts && opts.compact);
        const who = [row.author, compact ? '' : row.email, row.when, row.extra].filter(Boolean).map(esc).join(' · ');
        const status = compact ? '' : `<span class="q-status st-${esc(row.status)}">${esc(STATUS_LABEL[row.status] || row.status)}</span>`;
        const body = row.body ? `<p class="q-body">${esc(row.body)}</p>` : '';
        return `<li class="q-row" data-row="${esc(row.kind)}:${esc(row.key)}"><div class="q-main">`
            + `<div class="q-top"><span class="q-kind">${esc(KINDS[row.kind].label)}</span><span class="q-title">${esc(row.title || '(제목 없음)')}</span>${status}</div>`
            + (who ? `<span class="q-meta">${who}</span>` : '') + body + (compact ? '' : extraLinks(row))
            + `</div><div class="q-acts">${actionButtons(row)}</div></li>`;
    }

    function renderRows(rows, limit, opts) {
        return rows.slice(0, limit).map((r) => renderRow(r, opts)).join('');
    }

    /** One pending deposit row for the first screen. Buttons call approveBankOrder / rejectBankOrder. */
    function renderBankRow(order) {
        const id = esc(order.orderId || '');
        const amount = Number(order.amount) ? Number(order.amount).toLocaleString('ko-KR') + '원' : '';
        const meta = [order.email, shortWhen(order.createdAt)].filter(Boolean).map(esc).join(' · ');
        return `<li class="q-row" data-row="bank:${id}"><div class="q-main">`
            + `<div class="q-top"><span class="q-kind">입금</span><span class="q-title">${esc(order.name || '-')} · ${esc(order.product || '-')}</span>`
            + (amount ? `<span class="q-meta num">${esc(amount)}</span>` : '') + '</div>'
            + (meta ? `<span class="q-meta">${meta}</span>` : '')
            + `</div><div class="q-acts"><button type="button" class="btn btn-gold" data-act="bank-approve" data-key="${id}">입금 확인</button>`
            + `<button type="button" class="btn" data-act="bank-reject" data-key="${id}">거절</button></div></li>`;
    }

    return Object.freeze({ KINDS, KIND_ORDER, STATUS_LABEL, shortWhen, toRows, filterRows, countByKind, renderRow, renderRows, renderBankRow });
});
