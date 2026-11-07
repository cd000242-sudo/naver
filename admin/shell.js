(function adminShell() {
    'use strict';
    // DOM glue for the admin shell: theme, mobile menu, menu badges, dashboard and the
    // hooks that load the screens reached from the new menu. Pure logic lives in shell-tools.js.
    // The page-level fetch wrapper in index.html adds the admin session token to GAS calls,
    // so nothing here ever reads, stores or prints a credential.
    const THEME_KEY = 'lp_admin_theme';
    const POOL_SIZE = 3; // GAS rejects bursts of parallel executions, keep requests few at a time
    const BADGE_KINDS = ['bank', 'reviews', 'income', 'tips'];
    const MUTATIONS = {
        approveReview: 'reviews', rejectReview: 'reviews',
        approveIncome: 'income', rejectIncome: 'income', deleteIncome: 'income',
        approveTip: 'tips', rejectTip: 'tips',
        approveBankOrder: 'bank', rejectBankOrder: 'bank',
    };
    const tools = window.AdminShellTools;
    const root = document.documentElement;
    const byId = (id) => document.getElementById(id);
    let dashGeneration = 0;

    // ----- theme -----
    function systemTheme() {
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    function savedTheme() {
        try { const v = localStorage.getItem(THEME_KEY); return v === 'dark' || v === 'light' ? v : ''; } catch (e) { return ''; }
    }
    function toggleTheme() {
        const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
        root.dataset.theme = next;
        try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* private mode: keep the choice for this page only */ }
    }

    // ----- mobile menu -----
    function setNav(open) {
        document.body.classList.toggle('nav-open', !!open);
        const btn = byId('menu-btn');
        if (!btn) return;
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        btn.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
    }

    // ----- GAS reads (existing actions only) -----
    async function gas(action, payload) {
        const res = await fetch(GAS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action, ...(payload || {}) }),
        });
        const json = await res.json(); // the fetch wrapper throws a readable error when GAS answers with HTML
        if (!json || json.ok === false || json.success === false) throw new Error((json && (json.error || json.message)) || 'request failed');
        return json;
    }
    const SOURCES = {
        today: () => gas('analytics-dashboard', { period: 'today' }),
        month: () => gas('analytics-dashboard', { period: 'month' }),
        trial: () => gas('trial-list').then((j) => j.users),
        bank: () => gas('bank-list', { status: 'all' }).then((j) => j.orders),
        reviews: () => gas('get-reviews-admin').then((j) => j.reviews),
        income: () => gas('get-income-admin').then((j) => j.income),
        tips: () => gas('get-tips-admin').then((j) => j.tips),
        codes: () => gas('list').then((j) => j.data),
    };

    async function loadSources() {
        const keys = Object.keys(SOURCES);
        const out = {};
        let next = 0;
        async function worker() {
            while (next < keys.length) {
                const key = keys[next++];
                try { out[key] = await SOURCES[key](); } catch (e) { out[key] = null; }
            }
        }
        await Promise.all(Array.from({ length: POOL_SIZE }, worker));
        return out;
    }

    // ----- menu badges -----
    function setBadge(kind, count) {
        const el = document.querySelector('[data-badge="' + kind + '"]');
        if (!el) return;
        const n = Number(count) || 0;
        el.hidden = n <= 0;
        el.textContent = n > 99 ? '99+' : String(n);
        el.setAttribute('aria-label', '대기 ' + n + '건');
    }
    async function refreshBadge(kind) {
        try { setBadge(kind, tools.pendingCount(await SOURCES[kind]()) || 0); } catch (e) { /* keep the previous badge */ }
    }
    function applySidebarInfo(sources) {
        BADGE_KINDS.forEach((kind) => { const n = tools.pendingCount(sources[kind]); if (n !== null) setBadge(kind, n); });
        const el = byId('sidebar-license-count');
        if (el && Array.isArray(sources.codes)) el.textContent = sources.codes.filter((c) => c && c.used === true).length + '/' + sources.codes.length;
    }

    // ----- dashboard -----
    function skeleton() {
        const loading = '<p class="empty">불러오는 중…</p>';
        byId('dash-kpis').innerHTML = ['오늘 방문', '오늘 체험 신청', '오늘 주문', '오늘 매출']
            .map((l, i) => '<div class="kpi' + (i === 0 ? ' kpi-hero' : '') + '"><span>' + l + '</span><b>…</b><small>불러오는 중</small></div>').join('');
        ['dash-todo', 'dash-bars', 'dash-recent'].forEach((id) => { byId(id).innerHTML = loading; });
    }
    async function loadDashboard() {
        if (!byId('dash-kpis') || !tools) return;
        const generation = ++dashGeneration;
        skeleton();
        const sources = await loadSources();
        if (generation !== dashGeneration) return; // a newer refresh is in flight
        const now = new Date();
        const view = tools.summarize(sources, now);
        byId('dash-kpis').innerHTML = tools.renderKpis(view.kpis);
        byId('dash-todo').innerHTML = tools.renderTodo(view.todo);
        byId('dash-bars').innerHTML = tools.renderBars(view.bars);
        byId('dash-recent').innerHTML = tools.renderRecent(view.recent);
        const stamp = byId('dash-updated');
        if (stamp) stamp.textContent = '마지막 확인 ' + now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
        applySidebarInfo(sources);
    }

    // ----- hooks called by switchTab() -----
    function onTabChange(tabId) {
        const label = document.querySelector('.nav-item[data-tab="' + tabId + '"] > span');
        const crumb = byId('crumb');
        if (crumb && label) crumb.textContent = label.textContent;
        setNav(false);
        window.scrollTo(0, 0);
        if (tabId === 'dashboard') loadDashboard();
        else if (tabId === 'leads' && typeof loadLeadsAdmin === 'function') loadLeadsAdmin();
        else if ((tabId === 'orders' || tabId === 'licenses') && typeof loadCodes === 'function') loadCodes();
    }

    // Keep menu badges honest after an approval/rejection made inside the old screens.
    function watchMutations() {
        Object.keys(MUTATIONS).forEach((name) => {
            const original = window[name];
            if (typeof original !== 'function') return;
            window[name] = function wrappedMutation() {
                const result = original.apply(this, arguments);
                Promise.resolve(result).then(() => setTimeout(() => refreshBadge(MUTATIONS[name]), 800), () => {});
                return result;
            };
        });
    }

    function init() {
        root.dataset.theme = savedTheme() || systemTheme();
        const media = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
        if (media && media.addEventListener) media.addEventListener('change', () => { if (!savedTheme()) root.dataset.theme = systemTheme(); });
        const on = (id, type, fn) => { const el = byId(id); if (el) el.addEventListener(type, fn); };
        on('menu-btn', 'click', () => setNav(!document.body.classList.contains('nav-open')));
        on('nav-scrim', 'click', () => setNav(false));
        on('theme-btn', 'click', toggleTheme);
        on('dash-refresh', 'click', loadDashboard);
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setNav(false); });
        document.addEventListener('click', (e) => {
            const target = e.target.closest && e.target.closest('[data-go]');
            if (target && typeof switchTab === 'function') switchTab(target.dataset.go);
        });
        watchMutations();
    }

    window.AdminShell = Object.freeze({ onTabChange, loadDashboard, refreshBadge, toggleTheme, setNav });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
