// A tiny CSS cascade for tests: which margin / padding / font-size does an element really get? The rich post body once had
// a gap rule that lost to a later element reset (".cm-rich-body > * + *" against ".cm-rich-body p"), and a plain text match
// on the stylesheet cannot see that. This reads the real stylesheets, builds a tree from real rendered markup, and answers
// by specificity and source order. Supported: tag, *, .class, :first-child, :last-child, :is(...), and the combinators
// (space) > + . Rules inside @media / @keyframes are skipped (base layout only); anything unsupported never matches.
import fs from 'node:fs';

const VOID = new Set(['hr', 'img', 'br', 'input', 'source']);

/** Builds a tree of { tag, classes, parent, prev, children } from rendered markup. */
export function parseHtml(html) {
    const root = { tag: '#root', classes: [], parent: null, prev: null, children: [] };
    let node = root;
    for (const match of html.matchAll(/<(\/?)([a-z][a-z0-9]*)([^>]*?)(\/?)>/g)) {
        const [, closing, tag, attrs, selfClosing] = match;
        if (closing) { node = node.parent ?? root; continue; }
        const className = (attrs.match(/\sclass="([^"]*)"/) || [])[1] || '';
        const element = { tag, classes: className.split(/\s+/).filter(Boolean), parent: node, prev: node.children.at(-1) ?? null, children: [] };
        node.children.push(element);
        if (!VOID.has(tag) && !selfClosing) node = element;
    }
    return root;
}

/** A free-standing element (for "this element, outside the post body"). */
export const element = (tag, classes = [], parent = null) => {
    const made = { tag, classes, parent, prev: parent?.children.at(-1) ?? null, children: [] };
    parent?.children.push(made);
    return made;
};

const TOKEN = /:is\([^()]*\)|::?[a-z-]+(?:\([^()]*\))?|\.[\w-]+|\*|\[[^\]]*\]|[a-z][a-z0-9]*/g;
const tokensOf = (compound) => (compound.match(TOKEN) || []).join('') === compound ? compound.match(TOKEN) : null;

function splitTop(text, isSeparator) {
    const parts = [];
    let depth = 0;
    let buffer = '';
    for (const char of text) {
        if (char === '(') depth += 1;
        if (char === ')') depth -= 1;
        if (depth === 0 && isSeparator(char)) { parts.push(buffer); buffer = ''; } else buffer += char;
    }
    parts.push(buffer);
    return parts;
}

function parseComplex(selector) {
    const parts = [];
    let depth = 0;
    let buffer = '';
    let combinator = ' ';
    const flush = () => { if (buffer) { parts.push({ combinator, compound: buffer }); buffer = ''; combinator = ' '; } };
    for (const char of selector.trim()) {
        if (char === '(') depth += 1;
        if (char === ')') depth -= 1;
        if (depth === 0 && /[\s>+~]/.test(char)) { flush(); if (!/\s/.test(char)) combinator = char; } else buffer += char;
    }
    flush();
    return parts;
}

function matchesCompound(compound, el) {
    const tokens = tokensOf(compound);
    if (!tokens) return false;
    return tokens.every((token) => {
        if (token === '*') return true;
        if (token.startsWith(':is(')) return splitTop(token.slice(4, -1), (char) => char === ',').some((arg) => matchesCompound(arg.trim(), el));
        if (token === ':first-child') return el.parent?.children[0] === el;
        if (token === ':last-child') return el.parent?.children.at(-1) === el;
        if (token.startsWith('.')) return el.classes.includes(token.slice(1));
        if (/^[a-z]/.test(token)) return el.tag === token;
        return false;
    });
}

function matchesChain(parts, index, el) {
    if (!el || !matchesCompound(parts[index].compound, el)) return false;
    if (index === 0) return true;
    const { combinator } = parts[index];
    if (combinator === '>') return matchesChain(parts, index - 1, el.parent);
    if (combinator === '+') return matchesChain(parts, index - 1, el.prev);
    if (combinator !== ' ') return false;
    for (let ancestor = el.parent; ancestor; ancestor = ancestor.parent) if (matchesChain(parts, index - 1, ancestor)) return true;
    return false;
}

function compoundSpecificity(compound) {
    let classes = 0;
    let types = 0;
    for (const token of tokensOf(compound) || []) {
        if (token.startsWith(':is(')) {
            const best = splitTop(token.slice(4, -1), (char) => char === ',').map((arg) => compoundSpecificity(arg.trim())).sort((a, b) => b[0] - a[0] || b[1] - a[1])[0] || [0, 0];
            classes += best[0]; types += best[1];
        } else if (token !== '*') {
            if (/^[.:[]/.test(token)) classes += 1; else types += 1;
        }
    }
    return [classes, types];
}

const specificityOf = (parts) => parts.reduce((total, part) => {
    const [classes, types] = compoundSpecificity(part.compound);
    return [total[0] + classes, total[1] + types];
}, [0, 0]);

function declarations(body) {
    const map = {};
    for (const line of body.split(';')) {
        const at = line.indexOf(':');
        if (at < 0) continue;
        const name = line.slice(0, at).trim();
        const value = line.slice(at + 1).replace(/!important/, '').trim();
        const sides = value.split(/\s+/);
        if (name === 'margin' || name === 'padding') {
            const [top, right = top, bottom = top, left = right] = sides;
            Object.assign(map, { [`${name}-top`]: top, [`${name}-right`]: right, [`${name}-bottom`]: bottom, [`${name}-left`]: left });
        } else map[name] = value;
    }
    return map;
}

/** Reads one block of rules; at-rule blocks (@media ...) are walked past without keeping their rules. Returns the index of the closing brace. */
function readBlock(css, from, skip, rules) {
    let head = '';
    for (let index = from; index < css.length; index += 1) {
        const char = css[index];
        if (char === '}') return index;
        if (char !== '{') { head += char; continue; }
        if (head.trim().startsWith('@')) index = readBlock(css, index + 1, true, rules);
        else {
            const close = css.indexOf('}', index);
            if (!skip) {
                for (const single of splitTop(head.trim(), (c) => c === ',')) {
                    const parts = parseComplex(single);
                    if (parts.length) rules.push({ parts, spec: specificityOf(parts), order: rules.length, props: declarations(css.slice(index + 1, close)) });
                }
            }
            index = close;
        }
        head = '';
    }
    return css.length;
}

/** Reads stylesheets (in the order given = the order the page imports them) into ordered rules. */
export function readRules(files) {
    const rules = [];
    for (const file of files) {
        const css = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/@(import|charset)[^;]*;/g, '');
        readBlock(css, 0, false, rules);
    }
    return rules;
}

const beats = (a, b) => !b || a.spec[0] > b.spec[0] || (a.spec[0] === b.spec[0] && (a.spec[1] > b.spec[1] || (a.spec[1] === b.spec[1] && a.order > b.order)));

/** The winning declared value of one property for an element, or undefined. */
export function declared(rules, el, prop) {
    let best = null;
    for (const rule of rules) {
        if (rule.props[prop] === undefined || !matchesChain(rule.parts, rule.parts.length - 1, el)) continue;
        if (beats(rule, best)) best = rule;
    }
    return best?.props[prop];
}

/** Font size in px (inherited; 16px when nothing says otherwise). */
export function fontPx(rules, el) {
    if (!el || el.tag === '#root') return 16;
    const value = declared(rules, el, 'font-size');
    const parentPx = fontPx(rules, el.parent);
    if (!value) return parentPx;
    const number = parseFloat(value);
    return value.endsWith('em') ? number * parentPx : number;
}

/** Margin / padding side in px; a missing declaration is 0 (the page resets every margin to 0). */
export function spacePx(rules, el, prop) {
    const value = declared(rules, el, prop);
    if (!value) return 0;
    const number = parseFloat(value);
    return value.endsWith('em') ? number * fontPx(rules, el) : number;
}

/** Walks every element of a tree, in document order. */
export function walk(node, visit) {
    for (const child of node.children) { visit(child); walk(child, visit); }
}
