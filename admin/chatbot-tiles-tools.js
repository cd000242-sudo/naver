(function attachChatbotTilesTools(root, factory) {
    'use strict';

    const tools = factory();

    if (typeof module === 'object' && module.exports) {
        module.exports = tools;
    }

    if (root) {
        root.AdminChatbotTiles = tools;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createChatbotTilesTools() {
    'use strict';

    // Pure data logic for the free-chatbot editor (no DOM). Field names are the ones the public site reads:
    // spa/src/lib/siteOps.ts (SiteContent.chatbots) and spa/src/lib/chatbotTiles.mjs.
    const BLOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
    const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
    const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
    const URL_MESSAGE = 'https:// 로 시작하는 올바른 주소를 입력해 주세요.';

    const LISTS = Object.freeze({
        skills: Object.freeze({
            label: '스킬',
            fields: Object.freeze([
                Object.freeze({ key: 'title', label: '스킬 이름', required: true }),
                Object.freeze({ key: 'desc', label: '설명', multiline: true }),
                Object.freeze({ key: 'url', label: '이동 주소', kind: 'url' }),
            ]),
        }),
        bots: Object.freeze({
            label: '챗봇',
            fields: Object.freeze([
                Object.freeze({ key: 'category', label: '분류' }),
                Object.freeze({ key: 'title', label: '챗봇 이름', required: true }),
                Object.freeze({ key: 'subtitle', label: '부제' }),
                Object.freeze({ key: 'desc', label: '설명', multiline: true }),
                Object.freeze({ key: 'bestFor', label: '이런 분께 (한 줄에 하나)', kind: 'lines', multiline: true }),
                Object.freeze({ key: 'url', label: '이동 주소', kind: 'url' }),
                Object.freeze({ key: 'accent', label: '강조 색 (예: #44d7b6)', kind: 'color' }),
            ]),
        }),
    });

    function isPlainObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function cleanText(value) {
        return String(value === undefined || value === null ? '' : value).trim();
    }

    function isHttpsUrl(value) {
        const text = cleanText(value);
        if (!text) return false;
        try {
            return new URL(text).protocol === 'https:';
        } catch (error) {
            return false;
        }
    }

    function cloneJson(value) {
        return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    }

    function splitLines(text) {
        return String(text === undefined || text === null ? '' : text)
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
    }

    /** Editor rows from the saved array. Fields the editor does not show are kept in `extra` and written back. */
    function listFromContent(listKey, saved) {
        const def = LISTS[listKey];
        if (!def || !Array.isArray(saved)) return [];
        const known = new Set(def.fields.map((field) => field.key));
        return saved.filter(isPlainObject).map((record) => {
            const extra = {};
            Object.keys(record).forEach((key) => {
                if (!known.has(key) && !BLOCKED_KEYS.has(key)) extra[key] = cloneJson(record[key]);
            });
            const values = {};
            def.fields.forEach((field) => {
                const value = record[field.key];
                if (field.kind === 'lines') values[field.key] = Array.isArray(value) ? value.map(cleanText).join('\n') : cleanText(value);
                else values[field.key] = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
            });
            return { extra, values };
        });
    }

    function isBlankRow(def, item) {
        const values = item && item.values ? item.values : {};
        return def.fields.every((field) => cleanText(values[field.key]) === '');
    }

    /** Saved array from editor rows. Blank rows are dropped; no rows at all -> undefined (site default applies). */
    function listToContent(listKey, items) {
        const def = LISTS[listKey];
        if (!def || !Array.isArray(items)) return undefined;
        const records = items.filter((item) => !isBlankRow(def, item)).map((item) => {
            const record = cloneJson(item.extra) || {};
            def.fields.forEach((field) => {
                const raw = item.values[field.key];
                if (field.kind === 'lines') {
                    const lines = splitLines(raw);
                    if (lines.length > 0) record[field.key] = lines;
                    else delete record[field.key];
                    return;
                }
                const text = cleanText(raw);
                if (text) record[field.key] = text;
                else delete record[field.key];
            });
            return record;
        });
        return records.length > 0 ? records : undefined;
    }

    function fieldProblem(field, rawValue) {
        const text = cleanText(rawValue);
        if (field.required && !text) return field.label + '을(를) 입력해 주세요.';
        if (field.kind === 'url' && text && !isHttpsUrl(text)) return URL_MESSAGE;
        if (field.kind === 'color' && text && !HEX_COLOR.test(text)) return '색은 #44d7b6 처럼 # 로 시작하는 3자리 또는 6자리로 입력해 주세요.';
        return '';
    }

    /** One entry per bad field: { index, key, message }. Rows that are completely blank are ignored. */
    function validateList(listKey, items) {
        const def = LISTS[listKey];
        if (!def || !Array.isArray(items)) return [];
        const issues = [];
        items.forEach((item, index) => {
            if (isBlankRow(def, item)) return;
            def.fields.forEach((field) => {
                const message = fieldProblem(field, item.values[field.key]);
                if (message) issues.push({ index, key: field.key, message });
            });
        });
        return issues;
    }

    /** Link tiles: only the address needs checking (blank = site default). */
    function validateTile(values) {
        const url = cleanText(values && values.url);
        return url && !isHttpsUrl(url) ? [{ key: 'url', message: URL_MESSAGE }] : [];
    }

    function pick(values, keys) {
        const out = {};
        keys.forEach((key) => {
            const text = cleanText(values && values[key]);
            if (text) out[key] = text;
        });
        return out;
    }

    /** Same shape check the site applies before it trusts a saved ciphertext. */
    function isSealedPayload(payload) {
        return isPlainObject(payload)
            && payload.v === 1
            && payload.kdf === 'PBKDF2-SHA256'
            && Number.isInteger(payload.iter)
            && ['salt', 'iv', 'ct'].every((key) => typeof payload[key] === 'string' && BASE64.test(payload[key]));
    }

    /** SiteContent.chatbots from the editor state. Blank fields are left out so the site default applies. */
    function buildChatbots(state) {
        const simple = (state && state.simple) || {};
        const claude = pick(simple.claude, ['title', 'desc']);
        const skills = listToContent('skills', (state && state.skills) || []);
        if (skills) claude.skills = skills;
        const locked = pick(simple.homefeedLocked, ['title', 'desc']);
        if (state && isSealedPayload(state.payload)) locked.payload = cloneJson(state.payload);
        const out = {
            chatgpt: pick(simple.chatgpt, ['title', 'desc']),
            gemini: pick(simple.gemini, ['title', 'desc', 'url', 'cta']),
            naverFree: pick(simple.naverFree, ['title', 'desc', 'url', 'cta', 'badge']),
            claude,
            cafe: pick(simple.cafe, ['title', 'desc', 'url']),
            homefeedLocked: locked,
        };
        const bots = listToContent('bots', (state && state.bots) || []);
        if (bots) out.bots = bots;
        return out;
    }

    return Object.freeze({
        LISTS,
        buildChatbots,
        isHttpsUrl,
        isSealedPayload,
        listFromContent,
        listToContent,
        validateList,
        validateTile,
    });
});
