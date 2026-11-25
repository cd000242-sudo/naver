// Top menu styles (2026-11-07). Locks the phone-menu clipping bug: a backdrop-filter/filter/transform on the fixed bar
// makes it the containing block of its fixed children, so the opened menu was trapped inside the bar-sized box.
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const css = read('../src/styles/navbar.css');
const globalCss = read('../src/styles/global.css');
const withoutComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const navbarSource = withoutComments(['Navbar', 'NavDropdown', 'NavMobileMenu', 'NavAccount'].map((name) => read(`../src/components/${name}.tsx`)).join('\n'));

/** Flat list of { selector, body } — media queries are flattened, which is enough for property presence checks. */
function rules(text) {
    const stripped = text.replace(/\/\*[\s\S]*?\*\//g, '');
    return [...stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({ selector: match[1].trim(), body: match[2] }));
}
const declaration = (body, property) => (body.match(new RegExp(`(?:^|[;\\s])${property}\\s*:\\s*([^;]+)`)) || [])[1]?.trim();
const rulesFor = (list, selector) => list.filter((rule) => rule.selector.split(',').map((part) => part.trim()).includes(selector));
const navRules = rules(css);

// Properties that turn an element into the containing block for position:fixed descendants.
const TRAPPING = ['backdrop-filter', '-webkit-backdrop-filter', 'filter', 'transform', 'perspective', 'will-change', 'contain'];

test('the fixed bar and everything that wraps the phone sheet never create a containing block (blur bug)', () => {
    const wrappers = navRules.filter((rule) => rule.selector.split(',').some((part) => /^\.site-nav(\.[\w-]+)*$/.test(part.trim()) || /^header\.site-nav/.test(part.trim())));
    assert.ok(wrappers.length >= 2, 'bar root rules exist');
    for (const rule of wrappers) {
        for (const property of TRAPPING) {
            assert.equal(declaration(rule.body, property), undefined, `${rule.selector} must not set ${property}`);
        }
    }
    // The bar is a white bar: no blur layer anywhere in the menu stylesheet.
    assert.doesNotMatch(withoutComments(css), /backdrop-filter/);
});

test('nothing above the bar in the page tree (body, html, #root, main, header, nav) traps fixed children either', () => {
    for (const rule of rules(globalCss)) {
        const parts = rule.selector.split(',').map((part) => part.trim());
        if (!parts.some((part) => /^(html|body|#root|main|header|nav)(\s|$|,)/.test(part) || part === 'html, body')) continue;
        for (const property of TRAPPING) {
            assert.equal(declaration(rule.body, property), undefined, `${rule.selector} must not set ${property}`);
        }
    }
});

test('component code puts no blur or containing-block style on the bar, inline or otherwise', () => {
    assert.doesNotMatch(navbarSource, /backdropFilter|backdrop-filter|WebkitBackdropFilter/);
    assert.doesNotMatch(navbarSource, /style=\{\{[^}]*(filter|transform|perspective|willChange|contain)\s*:/);
});

test('phone sheet covers from under the bar to the bottom edge, scrolls, and is opaque', () => {
    const [sheet] = rulesFor(navRules, '.site-nav-sheet');
    assert.ok(sheet, '.site-nav-sheet rule');
    assert.equal(declaration(sheet.body, 'position'), 'fixed');
    assert.equal(declaration(sheet.body, 'left'), '0');
    assert.equal(declaration(sheet.body, 'right'), '0');
    assert.equal(declaration(sheet.body, 'bottom'), '0');
    assert.match(declaration(sheet.body, 'top'), /var\(--site-nav-h\)/);
    assert.equal(declaration(sheet.body, 'overflow-y'), 'auto');
    assert.match(declaration(sheet.body, 'background'), /^#fff(fff)?$/i, 'opaque white, nothing shows through');
    assert.ok(rulesFor(navRules, '.site-nav-sheet[hidden]').length >= 1, 'hidden attribute still hides it despite display rules');
});

test('open sheet lifts the bar above the floating chat/music buttons so nothing sits on top of the list', () => {
    const floatZ = Math.max(...['FloatStack', 'MusicPlayer'].map((name) => Number(read(`../src/components/${name}.tsx`).match(/zIndex:\s*(\d+)/)[1])));
    const [open] = rulesFor(navRules, '.site-nav.is-menu-open');
    assert.ok(open, '.site-nav.is-menu-open rule');
    assert.ok(Number(declaration(open.body, 'z-index')) > floatZ, `open z-index must exceed ${floatZ}`);
    const [root] = rulesFor(navRules, '.site-nav');
    assert.equal(declaration(root.body, 'position'), 'fixed');
    assert.ok(Number(declaration(root.body, 'z-index')) >= 999, 'closed bar keeps the old stacking level');
});

test('phone rows are 58px high with 19px text; group titles and the two top buttons are sized for thumbs', () => {
    const [item] = rulesFor(navRules, '.site-nav-sheet-item');
    assert.equal(declaration(item.body, 'min-height'), '58px');
    assert.equal(declaration(item.body, 'font-size'), '19px');
    const [actions] = rulesFor(navRules, '.site-nav-sheet-actions .site-nav-btn');
    assert.equal(declaration(actions.body, 'height'), '56px');
});

test('current-page mark: soft background, bold, 3px underline; same mark for the group trigger', () => {
    const selectors = ['.site-nav-link[aria-current="page"]', '.site-nav-link.is-active'];
    for (const selector of selectors) {
        const [rule] = rulesFor(navRules, selector);
        assert.ok(rule, `${selector} rule`);
        assert.ok(Number(declaration(rule.body, 'font-weight')) >= 800);
        assert.ok(declaration(rule.body, 'background'));
    }
    const underline = rulesFor(navRules, '.site-nav-link[aria-current="page"]::after');
    assert.equal(declaration(underline[0].body, 'height'), '3px');
    assert.ok(rulesFor(navRules, '.site-nav-link.is-active::after').length >= 1, 'group trigger gets the underline too');
    assert.ok(rulesFor(navRules, '.site-nav-sheet-item[aria-current="page"]').length === 1, 'phone row mark');
});

test('bar becomes the menu button at 1180px and the sheet only exists below it', () => {
    assert.match(css, /@media \(max-width:\s*1180px\)/);
    const below = css.slice(css.indexOf('@media (max-width: 1180px)'));
    assert.match(below, /\.site-nav-menu\s*\{[^}]*display:\s*none/);
    assert.match(below, /\.site-nav-burger\s*\{[^}]*display:\s*inline-flex/);
    assert.match(below, /\.site-nav-login\s*\{[^}]*display:\s*none/);
    assert.match(css, /@media \(min-width:\s*1181px\)\s*\{[^}]*\.site-nav-sheet\s*\{[^}]*display:\s*none\s*!important/, 'a stuck-open sheet cannot survive widening the window');
});

// [계약 1116] 질문하기가 상단 메뉴에 따로 들어와 항목이 8개 — 1181px 이상 어느 폭에서도 항목이 브랜드·버튼과 겹치지 않게 조인다.
test('from 1181px up the bar is trimmed so a logged-in long id and eight items cannot push the menu over the brand or the buttons', () => {
    const block = css.match(/@media \(min-width:\s*1181px\)\s*\{([\s\S]*?)\n\}/);
    assert.ok(block, 'compact media block exists');
    const tight = rules(block[1] + '\n}');
    const [link] = rulesFor(tight, '.site-nav-link');
    assert.ok(parseInt(declaration(link.body, 'padding').split(/\s+/)[1], 10) <= 12, 'link side padding shrinks');
    const [id] = rulesFor(tight, '.site-nav-account-id');
    assert.ok(parseInt(declaration(id.body, 'max-width'), 10) <= 96, 'account id is cut short');
    assert.ok(rulesFor(tight, '.site-nav-cta-long').some((rule) => /display:\s*none/.test(rule.body)), 'the free-trial button takes its short label');
    assert.ok(rulesFor(tight, '.site-nav-cta-short').some((rule) => /display:\s*inline/.test(rule.body)));
});

test('just above the breakpoint (up to 1279px) the brand keeps its logo and gives up the words; from 1280px it shows both', () => {
    const block = css.match(/@media \(min-width:\s*1181px\) and \(max-width:\s*1279px\)\s*\{([\s\S]*?)\n\}/);
    assert.ok(block, 'narrow-range media block exists');
    assert.ok(rulesFor(rules(block[1] + '\n}'), '.site-nav-brand-text').some((rule) => /display:\s*none/.test(rule.body)));
    assert.doesNotMatch(css.replace(block[0], ''), /\.site-nav-brand-text\s*\{[^}]*display:\s*none/, 'nowhere else is the brand text hidden for the desktop bar');
});

test('bar height stays within the 72px other layouts reserve (LEWORD console, sticky boards)', () => {
    const lewordStyles = read('../src/components/leword/LewordStyles.tsx');
    const reserved = Number(lewordStyles.match(/padding-top:\s*(\d+)px/)[1]);
    assert.equal(reserved, 72);
    const [root] = rulesFor(navRules, '.site-nav');
    assert.equal(declaration(root.body, '--site-nav-h'), '72px');
    const heights = navRules.map((rule) => declaration(rule.body, '--site-nav-h')).filter(Boolean).map((value) => Number(value.replace('px', '')));
    assert.ok(heights.length >= 2 && heights.every((height) => height <= reserved), 'every breakpoint height <= 72px');
    const [bar] = rulesFor(navRules, '.site-nav-bar');
    assert.equal(declaration(bar.body, 'height'), 'var(--site-nav-h)');
});

test('white bar reads on the dark page: hairline border plus a drop shadow', () => {
    const [root] = rulesFor(navRules, '.site-nav');
    assert.match(declaration(root.body, 'background'), /^#fff(fff)?$/i);
    assert.match(declaration(root.body, 'box-shadow'), /rgba\(/);
    // The hairline lives inside the 72px bar box so the bar's total height stays exactly 72px.
    const [bar] = rulesFor(navRules, '.site-nav-bar');
    assert.match(declaration(bar.body, 'border-bottom'), /1px solid/);
    assert.equal(declaration(bar.body, 'box-sizing'), 'border-box');
});

test('keyboard focus is visible on every interactive element of the menu', () => {
    assert.ok(navRules.some((rule) => /:focus-visible/.test(rule.selector) && /outline/.test(rule.body)));
});

test('old flat-menu rules are gone from global.css so they cannot fight the new bar', () => {
    assert.doesNotMatch(globalCss, /\.nav-links|\.nav-hamburger|\.navbar|nav-link-active/);
    assert.match(globalCss, /scroll-padding-top/, 'anchor scroll offset is kept');
});

// WCAG relative luminance / contrast of two #rrggbb colours.
const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const variable = (name) => (css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`)) || [])[1];

// [2026-11-25 사장님] '구매하기' = 녹색 알약 + 2~3초마다 빛이 한 번 지나가고 테두리가 퍼졌다 사라지는 반복 움직임. 움직임 줄이기 설정이면 끈다.
test('구매하기 button: green pill with 4.5:1 text, a calm 2-3s loop, no motion under prefers-reduced-motion', () => {
    for (const name of ['--sn-buy', '--sn-buy-hover']) assert.ok(contrast(variable(name), variable('--sn-on-buy')) >= 4.5, `${name} under ${variable('--sn-on-buy')}`);
    const [buy] = rulesFor(navRules, '.site-nav-link.site-nav-link-buy');
    assert.ok(buy, 'the green pill rule');
    assert.match(declaration(buy.body, 'background-color'), /var\(--sn-buy\)/);
    assert.match(declaration(buy.body, 'color'), /var\(--sn-on-buy\)/);
    const animation = declaration(buy.body, 'animation');
    const seconds = Number(animation.match(/([\d.]+)s/)[1]);
    assert.match(animation, /infinite/);
    assert.ok(seconds >= 2 && seconds <= 3, `loop is ${seconds}s`);
    const frames = animation.split(/\s+/)[0];
    assert.match(css, new RegExp(`@keyframes ${frames}\\s*\\{`), 'the keyframes exist');
    const keyframes = css.slice(css.indexOf(`@keyframes ${frames}`)).split('\n}\n')[0];
    assert.match(keyframes, /background-position/, 'a light sweeps across the pill');
    assert.match(keyframes, /box-shadow/, 'the outline spreads and fades');
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    assert.match(reduced, /\.site-nav-link-buy\s*\{[^}]*animation:\s*none/);
    assert.ok(rulesFor(navRules, '.site-nav-link.site-nav-link-buy:hover').length >= 1, 'hover keeps the green (the grey hover fill must not win)');
    assert.ok(rulesFor(navRules, '.site-nav-sheet-item.site-nav-sheet-item-buy').length >= 1, 'the phone row is tinted too');
    assert.equal(declaration(rulesFor(navRules, '.site-nav-sheet-item.site-nav-sheet-item-buy')[0].body, 'animation'), undefined, 'no motion on the phone list');
});

// [2026-11-25 사장님] 시크릿 클래스 줄은 은빛(옅은 은색 바탕 · 가는 은색 테두리 · 먹색 글자). 윗 메뉴 쪽 값도 같은 결, 글자 대비 4.5:1 이상.
test('silver rows of the top menu: dark ink and the muted line keep 4.5:1 on every silver stop, selected state is stronger', () => {
    for (const stop of ['--sn-silver-light', '--sn-silver-mid', '--sn-silver-deep']) {
        assert.ok(contrast(variable('--sn-silver-ink'), variable(stop)) >= 4.5, `ink on ${stop}`);
        assert.ok(contrast('#545b63', variable(stop)) >= 4.5, `muted line on ${stop}`);
    }
    for (const selector of ['.site-nav-drop-item.site-nav-drop-item-silver', '.site-nav-sheet-item.site-nav-sheet-item-silver']) {
        assert.ok(rulesFor(navRules, selector).length >= 1, selector);
    }
    assert.ok(rulesFor(navRules, '.site-nav-drop-item.site-nav-drop-item-silver[aria-current="page"]').length >= 1, 'selected row has its own silver look');
    assert.ok(navRules.filter((rule) => /silver/.test(rule.selector)).every((rule) => declaration(rule.body, 'animation') === undefined), 'silver never loops');
});

test('Navbar imports its stylesheet and ships as small files', () => {
    assert.match(read('../src/components/Navbar.tsx'), /import '\.\.\/styles\/navbar\.css'/);
    for (const file of ['components/Navbar.tsx', 'components/NavDropdown.tsx', 'components/NavMobileMenu.tsx', 'components/NavAccount.tsx', 'styles/navbar.css', 'lib/navMenu.mjs', 'lib/useLewordSession.ts']) {
        const lines = read(`../src/${file}`).split('\n').length;
        assert.ok(lines <= 300, `${file} has ${lines} lines (limit 300)`);
    }
});
