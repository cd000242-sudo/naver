(function attachChatbotEditor(root) {
    'use strict';

    // DOM side of the free-chatbot editor (#chatbot-editor-card). Data rules live in chatbot-tiles-tools.js and the
    // password tile in chatbot-seal-ui.js. No JSON is shown or typed anywhere: lists are row cards with
    // add / delete / up / down, and errors appear under the field they belong to.
    const SIMPLE = {
        chatgpt: { title: 'edit-cb-chatgpt-title', desc: 'edit-cb-chatgpt-desc' },
        gemini: { title: 'edit-cb-gemini-title', desc: 'edit-cb-gemini-desc', url: 'edit-cb-gemini-url', cta: 'edit-cb-gemini-cta' },
        naverFree: { title: 'edit-cb-naver-title', desc: 'edit-cb-naver-desc', url: 'edit-cb-naver-url', cta: 'edit-cb-naver-cta', badge: 'edit-cb-naver-badge' },
        claude: { title: 'edit-cb-claude-title', desc: 'edit-cb-claude-desc' },
        cafe: { title: 'edit-cb-cafe-title', desc: 'edit-cb-cafe-desc', url: 'edit-cb-cafe-url' },
        homefeedLocked: { title: 'edit-cb-locked-title', desc: 'edit-cb-locked-desc' },
    };
    // The two list hosts keep the ids the old JSON textareas had.
    const LIST_HOST = { skills: 'edit-cb-claude-skills', bots: 'edit-cb-bots' };

    let state = { skills: [], bots: [] };
    let touched = new Set();
    let installed = false;
    let notify = function noop() {};

    const doc = root.document;
    const el = (id) => doc.getElementById(id);
    const card = () => el('chatbot-editor-card');
    const tiles = () => root.AdminChatbotTiles;
    const seal = () => root.AdminChatbotSealUi;
    const esc = (value) => String(value === undefined || value === null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    function showSaved(visible) {
        el('cb-saved').hidden = !visible;
    }

    function changed() {
        showSaved(false);
        notify();
    }

    // ---- lists -----------------------------------------------------------------------------------------------

    function actionButton(action, label, disabled, aria) {
        return '<button type="button" data-cb-action="' + action + '" aria-label="' + esc(aria) + '"' + (disabled ? ' disabled' : '') + '>' + label + '</button>';
    }

    function fieldHtml(field, value) {
        const common = ' data-cb-field="' + field.key + '" autocomplete="off"' + (field.kind === 'url' ? ' inputmode="url" spellcheck="false"' : '');
        const control = field.multiline
            ? '<textarea rows="2"' + common + '>' + esc(value) + '</textarea>'
            : '<input type="text"' + common + ' value="' + esc(value) + '">';
        return '<label' + (field.multiline ? ' class="cb-wide"' : '') + '>' + esc(field.label) + control +
            '<span class="cb-error" role="alert" data-cb-error="' + field.key + '"></span></label>';
    }

    function rowHtml(def, listKey, items, index) {
        const n = index + 1;
        return '<section class="structured-row-card" data-cb-list="' + listKey + '" data-cb-index="' + index + '">' +
            '<div class="structured-row-card-head"><strong>' + esc(def.label) + ' ' + n + '</strong><div class="structured-row-actions">' +
            actionButton('up', '↑ 위로', index === 0, n + '번 ' + def.label + ' 위로') +
            actionButton('down', '↓ 아래로', index === items.length - 1, n + '번 ' + def.label + ' 아래로') +
            actionButton('delete', '삭제', false, n + '번 ' + def.label + ' 삭제') +
            '</div></div><div class="structured-row-fields">' +
            def.fields.map((field) => fieldHtml(field, items[index].values[field.key])).join('') +
            '</div></section>';
    }

    function renderList(listKey) {
        const host = el(LIST_HOST[listKey]);
        const def = tiles().LISTS[listKey];
        const items = state[listKey];
        host.innerHTML = items.length === 0
            ? '<div class="cb-empty">항목이 없습니다. 아래 추가 버튼을 누르세요.</div>'
            : items.map((item, index) => rowHtml(def, listKey, items, index)).join('');
    }

    function updateList(listKey, next) {
        state = Object.assign({}, state, { [listKey]: next });
        touched = new Set(touched).add(listKey);
        renderList(listKey);
        changed();
    }

    function moveItem(items, index, direction) {
        const target = index + direction;
        if (target < 0 || target >= items.length) return items;
        const next = items.slice();
        next[index] = items[target];
        next[target] = items[index];
        return next;
    }

    // ---- errors ----------------------------------------------------------------------------------------------

    function clearErrors() {
        card().querySelectorAll('[data-cb-error], [data-cb-error-for]').forEach((node) => { node.textContent = ''; });
        card().querySelectorAll('[aria-invalid]').forEach((node) => node.removeAttribute('aria-invalid'));
    }

    function showSimpleError(id, message) {
        el(id).setAttribute('aria-invalid', 'true');
        card().querySelector('[data-cb-error-for="' + id + '"]').textContent = message;
    }

    function showListError(listKey, issue) {
        const row = el(LIST_HOST[listKey]).querySelector('[data-cb-index="' + issue.index + '"]');
        row.querySelector('[data-cb-field="' + issue.key + '"]').setAttribute('aria-invalid', 'true');
        row.querySelector('[data-cb-error="' + issue.key + '"]').textContent = issue.message;
    }

    /** Returns every problem found (empty = safe to save). Untouched legacy data never blocks a save. */
    function validate() {
        if (!card()) return [];
        clearErrors();
        const issues = [];
        [['edit-cb-gemini-url', true], ['edit-cb-naver-url', true], ['edit-cb-cafe-url', touched.has('cafe')]].forEach((pair) => {
            if (!pair[1]) return;
            tiles().validateTile({ url: el(pair[0]).value }).forEach((problem) => {
                showSimpleError(pair[0], problem.message);
                issues.push({ id: pair[0], message: problem.message });
            });
        });
        Object.keys(LIST_HOST).forEach((listKey) => {
            if (!touched.has(listKey)) return;
            tiles().validateList(listKey, state[listKey]).forEach((issue) => {
                showListError(listKey, issue);
                issues.push({ id: LIST_HOST[listKey], message: issue.message });
            });
        });
        const pendingMessage = seal().checkPending();
        if (pendingMessage) issues.push({ id: 'cb-seal-pending', message: pendingMessage });
        if (issues.length > 0) focusProblem();
        return issues;
    }

    /** Scrolls to and focuses the first red field (opens the folded legacy cards when the problem is inside). */
    function focusProblem() {
        const first = card().querySelector('[aria-invalid="true"]');
        const target = first || (el('cb-seal-pending').textContent ? el('cb-seal-pending') : null);
        if (!target) return;
        if (el('cb-legacy').contains(target)) el('cb-legacy').open = true;
        target.scrollIntoView({ block: 'center' });
        if (first) first.focus();
    }

    // ---- wiring ----------------------------------------------------------------------------------------------

    function onClick(event) {
        const target = event.target.closest ? event.target : event.target.parentElement;
        const add = target.closest('[data-cb-add]');
        if (add) {
            const listKey = add.dataset.cbAdd;
            updateList(listKey, state[listKey].concat([{ extra: {}, values: {} }]));
            const last = el(LIST_HOST[listKey]).querySelector('[data-cb-index]:last-child input, [data-cb-index]:last-child textarea');
            if (last) last.focus();
            return;
        }
        const action = target.closest('[data-cb-action]');
        const row = action && action.closest('[data-cb-index]');
        if (!action || !row) return;
        const listKey = row.dataset.cbList;
        const index = Number(row.dataset.cbIndex);
        if (action.dataset.cbAction === 'delete') updateList(listKey, state[listKey].filter((_, i) => i !== index));
        else updateList(listKey, moveItem(state[listKey], index, action.dataset.cbAction === 'up' ? -1 : 1));
    }

    function onInput(event) {
        const field = event.target.closest && event.target.closest('[data-cb-field]');
        if (field) {
            const row = field.closest('[data-cb-index]');
            const listKey = row.dataset.cbList;
            const index = Number(row.dataset.cbIndex);
            const key = field.dataset.cbField;
            state = Object.assign({}, state, {
                [listKey]: state[listKey].map((item, i) => (i === index
                    ? Object.assign({}, item, { values: Object.assign({}, item.values, { [key]: field.value }) })
                    : item)),
            });
            touched = new Set(touched).add(listKey);
            field.removeAttribute('aria-invalid');
            row.querySelector('[data-cb-error="' + key + '"]').textContent = '';
        } else if (event.target.id) {
            event.target.removeAttribute('aria-invalid');
            const slot = card().querySelector('[data-cb-error-for="' + event.target.id + '"]');
            if (slot) slot.textContent = '';
            if (event.target.id === 'edit-cb-cafe-url') touched = new Set(touched).add('cafe');
        }
        showSaved(false);
    }

    function install(options) {
        if (options && typeof options.onChange === 'function') notify = options.onChange;
        if (!card() || installed) return;
        installed = true;
        card().addEventListener('click', onClick);
        card().addEventListener('input', onInput);
        seal().install(() => changed());
    }

    function load(chatbots) {
        if (!card()) return;
        install();
        const data = chatbots && typeof chatbots === 'object' ? chatbots : {};
        Object.keys(SIMPLE).forEach((group) => {
            Object.keys(SIMPLE[group]).forEach((key) => {
                const value = data[group] && data[group][key];
                el(SIMPLE[group][key]).value = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
            });
        });
        state = {
            skills: tiles().listFromContent('skills', data.claude && data.claude.skills),
            bots: tiles().listFromContent('bots', data.bots),
        };
        touched = new Set();
        Object.keys(LIST_HOST).forEach(renderList);
        seal().load(data.homefeedLocked && data.homefeedLocked.payload);
        clearErrors();
        showSaved(false);
    }

    /** SiteContent.chatbots built from the current screen. Never throws, so live previews cannot break. */
    function collect() {
        const simple = {};
        Object.keys(SIMPLE).forEach((group) => {
            simple[group] = {};
            Object.keys(SIMPLE[group]).forEach((key) => {
                const node = el(SIMPLE[group][key]);
                simple[group][key] = node ? node.value : '';
            });
        });
        return tiles().buildChatbots({ simple, skills: state.skills, bots: state.bots, payload: seal().getPayload() });
    }

    function markSaved() {
        seal().markSaved();
        showSaved(true);
    }

    root.AdminChatbotEditor = Object.freeze({ install, load, collect, validate, markSaved, focusProblem });
})(typeof globalThis !== 'undefined' ? globalThis : this);
