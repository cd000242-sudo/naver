/**
 * The editor's DOM <-> rich blocks (forum contract 1114, section 3).
 *   domToBlocks   reads what the writer typed (a contenteditable box) into blocks. It trusts nothing in the DOM: only the
 *                 tags below are understood, scripts and styles are skipped, an outside picture is never kept, a link
 *                 must end up an https address.
 *   blocksToDom   builds the box content for editing a post that already exists, with node factories, never HTML text.
 * Only nodeType / nodeName / childNodes / nodeValue / getAttribute are read, so a plain object tree works in node:test.
 */
import { RICH_LIMITS, normalizeLinkInput } from './communityRich.mjs';

const SKIP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'HEAD', 'TITLE']);
const ID_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;
const ALT_MAX = 120;

const attrOf = (node, name) => (typeof node.getAttribute === 'function' ? node.getAttribute(name) : null);

/** Bold / italic the browser may have written as a style instead of a tag. */
function styleFlags(node) {
    const css = String(attrOf(node, 'style') || '');
    return {
        b: /font-weight:\s*(bold|[6-9]00)/i.test(css),
        i: /font-style:\s*italic/i.test(css),
    };
}

function inlineStyle(node, name, style) {
    const flags = styleFlags(node);
    const next = {
        b: style.b || name === 'B' || name === 'STRONG' || flags.b,
        i: style.i || name === 'I' || name === 'EM' || flags.i,
        href: style.href,
    };
    if (name === 'A') {
        const href = normalizeLinkInput(attrOf(node, 'href'));
        if (href) next.href = href;
    }
    return next;
}

const sameLook = (a, b) => a.b === b.b && a.i === b.i && a.href === b.href;
const toRun = (run) => ({ x: run.x, ...(run.b ? { b: 1 } : {}), ...(run.i ? { i: 1 } : {}), ...(run.href ? { href: run.href } : {}) });

/** Neighbours with the same look become one run; the edges of the line lose their spaces. */
function cleanRuns(runs) {
    const merged = [];
    for (const run of runs) {
        const last = merged[merged.length - 1];
        if (last && sameLook(last, run)) last.x += run.x;
        else merged.push({ ...run });
    }
    while (merged.length && !(merged[0].x = merged[0].x.replace(/^\s+/, ''))) merged.shift();
    while (merged.length && !(merged[merged.length - 1].x = merged[merged.length - 1].x.replace(/\s+$/, ''))) merged.pop();
    return merged.map(toRun);
}

const cleanText = (value) => String(value ?? '').replace(/ /g, ' ').replace(/[​-‍﻿]/g, '').replace(/[\r\n]+/g, ' ');

function readImage(node) {
    const id = attrOf(node, 'data-image-id');
    if (typeof id !== 'string' || !ID_PATTERN.test(id)) return null;
    const alt = attrOf(node, 'alt');
    return { t: 'img', id, alt: typeof alt === 'string' && alt ? alt.slice(0, ALT_MAX) : '사진' };
}

/** The editor's content as blocks. Never throws on odd markup; unknown tags keep their words. */
export function domToBlocks(root) {
    const blocks = [];
    let runs = [];
    const finish = (sink) => {
        const clean = cleanRuns(runs);
        runs = [];
        if (clean.length) sink(clean);
    };
    const paragraph = (clean) => blocks.push({ t: 'p', c: clean });
    const collect = (nodes, sink, style, items) => { for (const child of nodes) visit(child, sink, style, items); };

    // `sink` receives a finished line; `items` is set while inside a list item (a nested list joins the outer one).
    function visit(node, sink, style, items) {
        if (node.nodeType === 3) {
            const x = cleanText(node.nodeValue);
            if (x) runs.push({ x, b: style.b, i: style.i, href: style.href });
            return;
        }
        if (node.nodeType !== 1) return;
        const name = String(node.nodeName).toUpperCase();
        if (SKIP.has(name)) return;
        const children = node.childNodes || [];
        if (name === 'BR') { finish(sink); return; }
        if (name === 'HR') { finish(sink); blocks.push({ t: 'hr' }); return; }
        if (name === 'IMG') {
            finish(sink);
            const image = readImage(node);
            if (image) blocks.push(image);
            return;
        }
        if (/^H[1-6]$/.test(name)) {
            finish(sink);
            const heading = (clean) => blocks.push({ t: 'h', l: Number(name[1]) <= 2 ? 2 : 3, c: clean });
            collect(children, heading, style, items);
            finish(heading);
            return;
        }
        if (name === 'BLOCKQUOTE') {
            finish(sink);
            const quote = (clean) => blocks.push({ t: 'quote', c: clean });
            collect(children, quote, style, items);
            finish(quote);
            return;
        }
        if (name === 'UL' || name === 'OL') {
            finish(sink);
            const list = items ?? [];
            const put = (clean) => { if (list.length < RICH_LIMITS.listItems) list.push(clean); };
            for (const item of children) {
                if (item.nodeType !== 1 || String(item.nodeName).toUpperCase() !== 'LI') continue;
                collect(item.childNodes || [], put, style, list);
                finish(put);
            }
            if (!items && list.length) blocks.push({ t: name === 'OL' ? 'ol' : 'ul', items: list });
            return;
        }
        if (/^(DIV|P|SECTION|ARTICLE|FIGURE|FIGCAPTION|MAIN|HEADER|FOOTER|LI|TABLE|TBODY|TR|TD|TH)$/.test(name)) {
            finish(sink);
            collect(children, sink, style, items);
            finish(sink);
            return;
        }
        collect(children, sink, inlineStyle(node, name, style), items);
    }

    collect(root.childNodes || [], paragraph, { b: false, i: false, href: '' });
    finish(paragraph);
    return blocks;
}

// ---- blocks -> DOM (editing an existing post) ----

/** One run as nodes: the text, wrapped in the tags of its look. */
function runNode(doc, run) {
    let node = doc.createTextNode(run.x);
    const wrap = (name, attrs = {}) => {
        const outer = doc.createElement(name);
        for (const [key, value] of Object.entries(attrs)) outer.setAttribute(key, value);
        outer.appendChild(node);
        node = outer;
    };
    if (run.href) wrap('a', { href: run.href });
    if (run.i) wrap('i');
    if (run.b) wrap('b');
    return node;
}

function lineNode(doc, name, runs) {
    const line = doc.createElement(name);
    for (const run of runs) line.appendChild(runNode(doc, run));
    return line;
}

/**
 * The box content for a list of blocks, as nodes made by `doc` (a Document, or any object with createElement /
 * createTextNode). `imageSrc(id)` gives the preview address of a picture. No HTML text is ever parsed.
 */
export function blocksToDom(blocks, doc, options = {}) {
    return (Array.isArray(blocks) ? blocks : []).flatMap((block) => {
        switch (block?.t) {
            case 'p': return [lineNode(doc, 'div', block.c)];
            case 'h': return [lineNode(doc, block.l === 3 ? 'h3' : 'h2', block.c)];
            case 'quote': return [lineNode(doc, 'blockquote', block.c)];
            case 'ul': case 'ol': {
                const list = doc.createElement(block.t);
                for (const item of block.items) list.appendChild(lineNode(doc, 'li', item));
                return [list];
            }
            case 'img': {
                const line = doc.createElement('div');
                const image = doc.createElement('img');
                image.setAttribute('data-image-id', block.id);
                image.setAttribute('alt', block.alt || '사진');
                const src = options.imageSrc?.(block.id);
                if (src) image.setAttribute('src', src);
                line.appendChild(image);
                return [line];
            }
            case 'hr': return [doc.createElement('hr')];
            default: return [];
        }
    });
}
