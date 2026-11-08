/**
 * Rich post body (forum contract 1114, section 3): the body of a new post is the text `{"v":1,"blocks":[...]}`.
 * Blocks: p, h (level 2 or 3), quote, ul / ol (items of runs), img (an id of a picture of the post), hr. A run is
 * `{ x, b?:1, i?:1, href? }` with an https address only. Two readers live here: the strict check (what the page
 * sends; the server checks every field again) and the lenient reader (what the page draws: unknown parts are
 * dropped, nothing throws, nothing from the server ever becomes markup).
 */

export const RICH_LIMITS = Object.freeze({ text: 5000, json: 30000, blocks: 200, images: 6, listItems: 50, href: 500 });

const ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;
const ALT_MAX = 120;
const UNREADABLE = '글 내용을 읽지 못했어요. 다시 써 주세요.';
const TOO_LONG = '글이 너무 길어요. 조금 줄여 주세요.';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const onlyKeys = (value, keys) => Object.keys(value).every((key) => keys.includes(key));

/** The server refuses an address with any of these (`@`, quotes, `<` `>`, backslash), so the page keeps them out too. */
const REFUSED_IN_HREF = /[@"'<>\\]/;

/** An https address up to 500 characters, as it is; '' for anything else. */
export function safeHref(value) {
    if (typeof value !== 'string' || value.length > RICH_LIMITS.href || !value.startsWith('https://') || /\s/.test(value) || REFUSED_IN_HREF.test(value)) return '';
    try {
        return new URL(value).protocol === 'https:' ? value : '';
    } catch {
        return '';
    }
}

/** What a writer typed into the link box as a safe https address (a missing scheme is added, http is raised to https). */
export function normalizeLinkInput(input) {
    const raw = String(input ?? '').trim();
    if (!raw || REFUSED_IN_HREF.test(raw)) return '';
    let candidate = raw;
    if (/^http:\/\//i.test(raw)) candidate = raw.replace(/^http:\/\//i, 'https://');
    else if (!/^https:\/\//i.test(raw)) {
        if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//')) return '';
        candidate = `https://${raw}`;
    }
    try {
        const url = new URL(candidate);
        return url.protocol === 'https:' && url.hostname.includes('.') && url.href.length <= RICH_LIMITS.href && safeHref(url.href) ? url.href : '';
    } catch {
        return '';
    }
}

const validRun = (run) => isObject(run) && onlyKeys(run, ['x', 'b', 'i', 'href'])
    && typeof run.x === 'string' && run.x.length > 0
    && (run.b === undefined || run.b === 1) && (run.i === undefined || run.i === 1)
    && (run.href === undefined || safeHref(run.href) === run.href);
const validRuns = (runs) => Array.isArray(runs) && runs.every(validRun);

function validBlock(block) {
    if (!isObject(block)) return false;
    switch (block.t) {
        case 'p': case 'quote': return onlyKeys(block, ['t', 'c']) && validRuns(block.c);
        case 'h': return onlyKeys(block, ['t', 'l', 'c']) && (block.l === 2 || block.l === 3) && validRuns(block.c);
        case 'ul': case 'ol': return onlyKeys(block, ['t', 'items']) && Array.isArray(block.items) && block.items.length > 0 && block.items.every(validRuns);
        case 'img': return onlyKeys(block, ['t', 'id', 'alt']) && typeof block.id === 'string' && ID_PATTERN.test(block.id) && typeof block.alt === 'string' && block.alt.length <= ALT_MAX;
        case 'hr': return onlyKeys(block, ['t']);
        default: return false;
    }
}

const runsOf = (block) => (block.t === 'ul' || block.t === 'ol' ? block.items.flat() : block.c || []);

/** Sum of the text of all runs (the number the 5,000 limit counts). */
export const richTextLength = (blocks) => (Array.isArray(blocks) ? blocks : []).reduce(
    (sum, block) => sum + runsOf(block).reduce((inner, run) => inner + run.x.length, 0), 0,
);

/** Strict check of a document before it is sent. `{ ok: true }` or `{ ok: false, message }` in plain Korean. */
export function validateRichDoc(doc) {
    if (!isObject(doc) || !onlyKeys(doc, ['v', 'blocks']) || doc.v !== 1 || !Array.isArray(doc.blocks) || !doc.blocks.every(validBlock)) {
        return { ok: false, message: UNREADABLE };
    }
    const blocks = doc.blocks;
    if (blocks.length > RICH_LIMITS.blocks) return { ok: false, message: TOO_LONG };
    if (blocks.filter((block) => block.t === 'img').length > RICH_LIMITS.images) return { ok: false, message: `사진은 ${RICH_LIMITS.images}장까지 넣을 수 있어요.` };
    if (blocks.some((block) => (block.t === 'ul' || block.t === 'ol') && block.items.length > RICH_LIMITS.listItems)) return { ok: false, message: `목록은 ${RICH_LIMITS.listItems}줄까지 쓸 수 있어요.` };
    if (richTextLength(blocks) > RICH_LIMITS.text) return { ok: false, message: `내용은 ${RICH_LIMITS.text.toLocaleString('en-US')}자 이하로 적어 주세요.` };
    if (JSON.stringify(doc).length > RICH_LIMITS.json) return { ok: false, message: TOO_LONG };
    return { ok: true };
}

/** The text the server stores in the body cell. */
export const serializeRichDoc = (blocks) => JSON.stringify({ v: 1, blocks });

function readRuns(raw) {
    return (Array.isArray(raw) ? raw : []).flatMap((run) => {
        if (!isObject(run) || typeof run.x !== 'string' || run.x === '') return [];
        const href = safeHref(run.href);
        return [{ x: run.x, ...(run.b === 1 ? { b: 1 } : {}), ...(run.i === 1 ? { i: 1 } : {}), ...(href ? { href } : {}) }];
    });
}

function readBlock(raw) {
    if (!isObject(raw)) return null;
    switch (raw.t) {
        case 'p': case 'quote': {
            const c = readRuns(raw.c);
            return c.length ? { t: raw.t, c } : null;
        }
        case 'h': {
            const c = readRuns(raw.c);
            return c.length ? { t: 'h', l: raw.l === 3 ? 3 : 2, c } : null;
        }
        case 'ul': case 'ol': {
            const items = (Array.isArray(raw.items) ? raw.items : []).map(readRuns).filter((item) => item.length > 0).slice(0, RICH_LIMITS.listItems);
            return items.length ? { t: raw.t, items } : null;
        }
        case 'img':
            return typeof raw.id === 'string' && ID_PATTERN.test(raw.id) ? { t: 'img', id: raw.id, alt: typeof raw.alt === 'string' ? raw.alt.slice(0, ALT_MAX) : '' } : null;
        case 'hr': return { t: 'hr' };
        default: return null;
    }
}

/** Lenient reader for drawing: `{ ok, blocks }`. Not a rich body at all (or damaged JSON) is `{ ok: false, blocks: [] }`. */
export function parseRichBody(text) {
    let data;
    try {
        data = JSON.parse(String(text ?? ''));
    } catch {
        return { ok: false, blocks: [] };
    }
    if (!isObject(data) || data.v !== 1 || !Array.isArray(data.blocks)) return { ok: false, blocks: [] };
    let images = 0;
    const blocks = [];
    for (const raw of data.blocks) {
        if (blocks.length >= RICH_LIMITS.blocks) break;
        const block = readBlock(raw);
        if (!block) continue;
        if (block.t === 'img' && ++images > RICH_LIMITS.images) continue;
        blocks.push(block);
    }
    return { ok: true, blocks };
}

const runText = (runs) => runs.map((run) => run.x).join('');

/** One line per block or list item; pictures and rules say nothing. */
export function richPlainText(blocks) {
    return (Array.isArray(blocks) ? blocks : []).flatMap((block) => {
        if (block.t === 'ul' || block.t === 'ol') return block.items.map(runText);
        return block.c ? [runText(block.c)] : [];
    }).join('\n');
}

/** Ids of the pictures in the order the document uses them. */
export const richImageIds = (blocks) => (Array.isArray(blocks) ? blocks : []).filter((block) => block.t === 'img').map((block) => block.id);

/** Plain text for a list line: from a rich body its words (never JSON), from an old plain body the text itself. */
export function richExcerpt(body, max = 120) {
    const parsed = parseRichBody(body);
    const text = (parsed.ok ? richPlainText(parsed.blocks) : String(body ?? '')).replace(/\s+/g, ' ').trim();
    return text.length <= max ? text : `${text.slice(0, max).trimEnd()}…`;
}

/** The message that stops a send, or '' when the blocks are fine to send. */
export function checkRichDraft(blocks) {
    if (!Array.isArray(blocks) || blocks.length === 0) return '내용을 입력해 주세요.';
    if (richTextLength(blocks) === 0) return '글자를 한 줄 이상 적어 주세요.';
    const result = validateRichDoc({ v: 1, blocks });
    return result.ok ? '' : result.message;
}
