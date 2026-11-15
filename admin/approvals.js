(function adminApprovals() {
    'use strict';
    // DOM glue for the merged approvals screen (#tab-approvals) and the first-screen "바로 처리" list (#dash-quick).
    // Reads use the existing GAS actions through AdminShell.source(); every write goes through the existing global
    // functions (approveReview, rejectIncome, approveBankOrder ...), which keep their own confirm() prompts.
    // shell.js wraps those functions and calls refresh(kind) when they finish, so both views stay in step.
    const tools = window.AdminApprovalTools;
    const shellTools = window.AdminShellTools;
    const byId = (id) => document.getElementById(id);
    const store = { reviews: null, income: null, tips: null, bank: null };
    const view = { kind: 'all', status: 'pending', limit: 10, loading: false, at: null };
    const QUICK_LIMIT = 5;
    const STEP = 10;
    const STATUS_CHIPS = [['pending', '대기'], ['approved', '승인됨'], ['rejected', '거절됨'], ['all', '전체']];
    let built = false;

    function shell() { return window.AdminShell; }

    function build() {
        const panel = byId('tab-approvals');
        if (!panel || built) return;
        built = true;
        panel.innerHTML = '<div class="page-header page-head-row"><div><h1>승인</h1><p><span class="faint" id="ap-updated"></span></p></div>'
            + '<div class="page-act"><button type="button" class="btn" id="ap-refresh">새로고침</button></div></div>'
            + '<div class="ap-bar"><div class="seg" role="group" aria-label="종류" id="ap-kinds"></div>'
            + '<div class="ap-status" role="group" aria-label="상태" id="ap-status"></div></div>'
            + '<section class="panel"><ul class="q-list" id="ap-list"></ul><div class="q-foot" id="ap-foot" hidden></div></section>'
            + '<details class="ap-tools"><summary>도구</summary><div class="ap-tools-body">'
            + '<button type="button" class="btn" onclick="seedDefaults()">기본 데이터 가져오기</button>'
            + '<span>예전 화면</span><button type="button" class="q-link" data-go="reviews">후기</button>'
            + '<button type="button" class="q-link" data-go="income">수익 인증</button><button type="button" class="q-link" data-go="tips">활용 팁</button>'
            + '</div></details>';
    }

    function allFailed() { return tools.KIND_ORDER.every((k) => store[k] === null); }

    function fade(el) { el.classList.remove('fade-in'); void el.offsetWidth; el.classList.add('fade-in'); }

    function renderScreen() {
        build();
        const list = byId('ap-list');
        if (!list) return;
        const rows = tools.toRows(store);
        const counts = tools.countByKind(rows, view.status);
        byId('ap-kinds').innerHTML = [['all', '전체'], ['reviews', '후기'], ['income', '수익 인증'], ['tips', '팁']]
            .map(([k, label]) => `<button type="button" data-ap-kind="${k}" aria-pressed="${view.kind === k}">${label}<b>${counts[k]}</b></button>`).join('');
        byId('ap-status').innerHTML = STATUS_CHIPS
            .map(([k, label]) => `<button type="button" class="chip" data-ap-status="${k}" aria-pressed="${view.status === k}">${label}</button>`).join('');
        const shown = tools.filterRows(rows, view.kind, view.status);
        const foot = byId('ap-foot');
        foot.hidden = true;
        if (view.loading && allFailed()) list.innerHTML = '<li class="q-empty">불러오는 중…</li>';
        else if (allFailed()) list.innerHTML = '<li class="q-empty">불러오지 못했습니다 <button type="button" class="btn" data-ap-retry="1">다시 시도</button></li>';
        else if (!shown.length) list.innerHTML = `<li class="q-empty">${view.status === 'pending' ? '승인할 것이 없습니다' : '해당하는 글이 없습니다'}</li>`;
        else {
            list.innerHTML = tools.renderRows(shown, view.limit);
            if (shown.length > view.limit) {
                foot.hidden = false;
                foot.innerHTML = `<button type="button" class="btn" data-ap-more="1">${Math.min(STEP, shown.length - view.limit)}개 더 보기</button><span class="faint">남은 ${shown.length - view.limit}개</span>`;
            }
        }
        const failed = tools.KIND_ORDER.filter((k) => store[k] === null).map((k) => tools.KINDS[k].label);
        const stamp = byId('ap-updated');
        if (stamp) stamp.textContent = (view.at ? '마지막 확인 ' + view.at : '') + (failed.length && !allFailed() ? ' · 못 불러온 것: ' + failed.join(', ') : '');
        fade(list);
    }

    function renderQuick() {
        const box = byId('dash-quick');
        if (!box) return;
        const pending = tools.filterRows(tools.toRows(store), 'all', 'pending');
        const bank = Array.isArray(store.bank) ? store.bank.filter((o) => o && o.status === 'pending') : [];
        const parts = [];
        if (pending.length) parts.push(`<li class="q-sub">승인 대기 ${pending.length}</li>` + tools.renderRows(pending, QUICK_LIMIT, { compact: true }));
        if (bank.length) parts.push(`<li class="q-sub">입금 확인 대기 ${bank.length}</li>` + bank.slice(0, QUICK_LIMIT).map(tools.renderBankRow).join(''));
        if (!parts.length) {
            box.innerHTML = allFailed() && store.bank === null ? '<p class="q-empty">불러오지 못했습니다</p>' : '<p class="q-empty">지금 처리할 일이 없습니다</p>';
        } else {
            box.innerHTML = '<ul class="q-list">' + parts.join('') + '</ul><div class="q-foot">'
                + (pending.length ? '<button type="button" class="btn" data-go="approvals">승인 전체 보기</button>' : '')
                + (bank.length ? '<button type="button" class="btn" data-go="bank">입금 확인 전체 보기</button>' : '') + '</div>';
        }
        fade(box);
    }

    function renderAll() { renderQuick(); if (built || byId('tab-approvals')) renderScreen(); }

    function stampNow() { view.at = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }); }

    function publishCounts(kinds) {
        const s = shell();
        if (!s || !s.setCount) return;
        kinds.forEach((k) => s.setCount(k, shellTools.pendingCount(store[k])));
    }

    async function fetchKinds(kinds) {
        const s = shell();
        if (!s || !s.source) return;
        await Promise.all(kinds.map(async (k) => {
            try { store[k] = await s.source(k); } catch (e) { store[k] = null; }
        }));
        stampNow();
        publishCounts(kinds);
    }

    /** Called when the approvals tab opens. Shows what the first screen already fetched, then reloads. */
    async function load() {
        view.loading = true;
        renderScreen();
        await fetchKinds(tools.KIND_ORDER);
        view.loading = false;
        renderAll();
    }

    /** Called by shell.js after any approve/reject/edit/delete/seed finishes. kind: reviews|income|tips|bank|all */
    async function refresh(kind) {
        const kinds = kind === 'all' ? tools.KIND_ORDER.concat('bank') : [kind];
        await fetchKinds(kinds.filter((k) => k in store));
        renderAll();
    }

    /** First screen hands over the lists it loaded, so the quick list costs no extra request. */
    function seed(sources) {
        ['reviews', 'income', 'tips', 'bank'].forEach((k) => { if (sources && k in sources) store[k] = sources[k]; });
        stampNow();
        renderAll();
    }

    function rawItem(kind, key) {
        if (kind === 'bank') return (store.bank || []).find((o) => o && String(o.orderId) === key) || null;
        const field = tools.KINDS[kind].keyField;
        return (store[kind] || []).find((it) => it && String(it[field]) === key) || null;
    }

    async function runAction(btn) {
        const act = btn.dataset.act;
        const key = btn.dataset.key || '';
        const kind = btn.dataset.kind || 'bank';
        const fnName = act === 'bank-approve' ? 'approveBankOrder' : act === 'bank-reject' ? 'rejectBankOrder' : (tools.KINDS[kind] || {})[act];
        const fn = fnName && window[fnName];
        if (typeof fn !== 'function') return;
        if (act === 'edit') { const item = rawItem(kind, key); if (item) fn(item); return; }
        const row = btn.closest('.q-row');
        if (row) row.classList.add('is-busy');
        try { await fn(key); } finally { if (row && row.isConnected) row.classList.remove('is-busy'); }
    }

    function onClick(e) {
        const t = e.target.closest && e.target.closest('[data-act], [data-ap-kind], [data-ap-status], [data-ap-more], [data-ap-retry], #ap-refresh');
        if (!t || !t.closest('#tab-approvals, #dash-quick')) return;
        if (t.dataset.act) { runAction(t); return; }
        if (t.dataset.apKind) { view.kind = t.dataset.apKind; view.limit = STEP; renderScreen(); return; }
        if (t.dataset.apStatus) { view.status = t.dataset.apStatus; view.limit = STEP; renderScreen(); return; }
        if (t.dataset.apMore) { view.limit += STEP; renderScreen(); return; }
        load();
    }

    document.addEventListener('click', onClick);
    window.AdminApprovals = Object.freeze({ load, refresh, seed });
})();
