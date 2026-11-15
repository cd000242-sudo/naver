(function adminScreens() {
    'use strict';
    // Small DOM glue for the phase-2 screens. No GAS requests here: every button either changes a value that the
    // existing functions read (#issue-type for issueCode(), the order filter for renderOrdersTable()) or opens a tab.
    const byId = (id) => document.getElementById(id);

    // ----- licence issue form: period buttons drive the existing #issue-type select -----
    function setIssueType(value) {
        const select = byId('issue-type');
        if (!select || ![...select.options].some((o) => o.value === value)) return;
        select.value = value;
        document.querySelectorAll('[data-issue-type]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.issueType === value)));
    }

    // ----- order filters (period + state), read by renderOrdersTable() -----
    function pressed(groupId, attr, fallback) {
        const on = document.querySelector('#' + groupId + ' [aria-pressed="true"]');
        return on ? on.getAttribute(attr) : fallback;
    }
    function orderFilter() {
        return { period: pressed('orders-period', 'data-orders-period', 'all'), state: pressed('orders-state', 'data-orders-state', 'all') };
    }
    function pickOrderFilter(btn, groupId) {
        document.querySelectorAll('#' + groupId + ' button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
        if (typeof goPage === 'function') goPage('orders', 1); // eslint-disable-line no-undef
        const body = byId('orders-table-body');
        if (body) { body.classList.remove('fade-in'); void body.offsetWidth; body.classList.add('fade-in'); }
    }

    // ----- quick jump: type a menu name, press Enter, that screen opens -----
    function menuEntries() {
        const seen = new Set();
        return [...document.querySelectorAll('.sidebar .nav-item[data-tab]')].map((n) => {
            const label = (n.querySelector('span') || n).textContent.trim();
            return { tab: n.dataset.tab, label };
        }).filter((e) => e.label && !seen.has(e.label) && seen.add(e.label));
    }
    const squash = (s) => String(s || '').replace(/[\s·・/]/g, '').toLowerCase();
    /** Exact name first, then a single name that starts with / contains the words. Returns a tab id or ''. */
    function findTab(query, entries) {
        const q = squash(query);
        if (!q) return '';
        const exact = entries.find((e) => squash(e.label) === q);
        if (exact) return exact.tab;
        const starts = entries.filter((e) => squash(e.label).startsWith(q));
        if (starts.length === 1) return starts[0].tab;
        const has = entries.filter((e) => squash(e.label).includes(q));
        return has.length === 1 ? has[0].tab : '';
    }
    function setupJump() {
        const input = byId('menu-jump');
        const list = byId('menu-jump-list');
        if (!input) return;
        const fill = () => { if (list) list.innerHTML = menuEntries().map((e) => '<option value="' + e.label.replace(/"/g, '&quot;') + '"></option>').join(''); };
        fill();
        const go = () => {
            const tab = findTab(input.value, menuEntries());
            if (!tab) { input.setAttribute('aria-invalid', input.value.trim() ? 'true' : 'false'); return; }
            input.value = '';
            input.removeAttribute('aria-invalid');
            input.blur();
            if (typeof switchTab === 'function') switchTab(tab); // eslint-disable-line no-undef
        };
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
        // Picking a suggestion from the list fires "input" with the full name: open it right away.
        input.addEventListener('input', () => {
            input.removeAttribute('aria-invalid');
            if (menuEntries().some((e) => e.label === input.value)) go();
        });
    }

    function onClick(e) {
        const t = e.target.closest && e.target.closest('[data-issue-type], [data-orders-period], [data-orders-state]');
        if (!t) return;
        if (t.dataset.issueType) setIssueType(t.dataset.issueType);
        else if (t.dataset.ordersPeriod) pickOrderFilter(t, 'orders-period');
        else pickOrderFilter(t, 'orders-state');
    }

    function init() {
        document.addEventListener('click', onClick);
        const select = byId('issue-type');
        if (select) setIssueType(select.value);
        setupJump();
    }

    window.AdminScreens = Object.freeze({ orderFilter, findTab, menuEntries, setIssueType });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
