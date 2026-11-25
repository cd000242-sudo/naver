// The yellow NEW! pill (2026-11-25): the site's own call-to-action yellow, readable ink, no blinking, never wraps.
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const css = fs.readFileSync(new URL('../src/styles/new-mark.css', import.meta.url), 'utf8');
const navbarCss = fs.readFileSync(new URL('../src/styles/navbar.css', import.meta.url), 'utf8');
const lightCss = fs.readFileSync(new URL('../src/styles/light-page.css', import.meta.url), 'utf8');

const channel = (value) => { const v = value / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((at) => channel(parseInt(hex.slice(at, at + 2), 16)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const rule = (selector) => {
    const at = css.indexOf(selector);
    assert.ok(at >= 0, `rule ${selector}`);
    return css.slice(at, css.indexOf('}', at));
};

test('the pill is painted with the call-to-action yellow of the bar and of the community page, with the same fallback', () => {
    const body = rule('.new-mark {');
    assert.match(body, /background:\s*var\(--sn-cta,\s*var\(--lp-cta,\s*#f5b40a\)\)/);
    assert.match(body, /color:\s*var\(--sn-on-cta,\s*var\(--lp-on-cta,\s*#1d1605\)\)/);
    assert.match(navbarCss, /--sn-cta:\s*#f5b40a/);
    assert.match(navbarCss, /--sn-on-cta:\s*#1d1605/);
    assert.match(lightCss, /--lp-cta:\s*#f5b40a/);
    assert.match(lightCss, /--lp-on-cta:\s*#1d1605/);
});

test('the ink on the yellow reads at 4.5:1 or better', () => {
    assert.ok(contrast('#1d1605', '#f5b40a') >= 4.5, `contrast ${contrast('#1d1605', '#f5b40a').toFixed(2)}`);
});

test('a small pill that never wraps or squeezes, with no blinking or movement', () => {
    const body = rule('.new-mark {');
    assert.match(body, /border-radius:\s*999px/);
    assert.match(body, /white-space:\s*nowrap/);
    assert.match(body, /flex:\s*none/);
    assert.doesNotMatch(css, /animation|@keyframes|transition/i);
});

test('the phone list pushes the mark to the right edge like the number circle did', () => {
    assert.match(css, /\.site-nav-sheet-item \.new-mark\s*\{[^}]*margin-left:\s*auto/);
});

test('the mark text is 13px or larger (13px is the smallest text on the site)', () => {
    const size = Number(/font-size:\s*(\d+)px/.exec(rule('.new-mark {'))?.[1]);
    assert.ok(size >= 13, `font-size ${size}px`);
});
