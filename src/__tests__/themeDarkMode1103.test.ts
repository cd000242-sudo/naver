// @vitest-environment happy-dom
/**
 * [2026-11-03] Owner: "지금 앱 디자인이 라이트자나? 기존 다크모드도 선택가능하도록 … 좌측상단에 라이트모드 다크모드 선택".
 * Dark mode = theme-naver-dark.css re-points the --nv-* tokens under :root[data-theme="dark"]; the switch next to the
 * title sets the attribute and remembers it (localStorage "nv-theme"); a <head> script applies it before first paint.
 * Source / DOM assertions only (no build, no live window).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(resolve(__dirname, '../..', rel), 'utf8').replace(/\r\n/g, '\n');
const html = read('public/index.html');
const light = read('public/theme-naver.css');
const dark = read('public/theme-naver-dark.css');
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const block = (css: string, selector: string) => {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no block for ${selector}`);
  return css.slice(start, css.indexOf('}', start));
};
const hex = (css: string, name: string) => {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`--${name} is not a hex literal`);
  return m[1];
};
const lum = (value: string) => {
  const n = parseInt(value.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('dark sheet wiring', () => {
  const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
  const sheets = [...html.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)].map((m) => m[1]).filter((h) => !/^https?:/.test(h));

  it('is the last stylesheet, linked from <head>', () => {
    expect(sheets[sheets.length - 1]).toBe('theme-naver-dark.css');
    expect(head).toContain('href="theme-naver-dark.css"');
  });

  it('a <head> script applies the saved choice before the body paints, and tolerates blocked storage', () => {
    const script = head.slice(head.indexOf('href="theme-naver-dark.css"'));
    expect(script).toMatch(/<script>try \{ if \(localStorage\.getItem\('nv-theme'\) === 'dark'\) document\.documentElement\.setAttribute\('data-theme', 'dark'\); \} catch/);
  });
});

describe('dark tokens', () => {
  const root = block(dark, ':root[data-theme="dark"]');

  it('re-points every color token of the light :root (font and none excepted)', () => {
    const tokens = [...new Set([...block(light, ':root').matchAll(/(--nv-[a-z0-9-]+):/g)].map((m) => m[1]))]
      .filter((t) => t !== '--nv-font' && t !== '--nv-none');
    expect(tokens.length).toBeGreaterThan(30);
    for (const token of tokens) expect(root, token).toContain(`${token}:`);
  });

  it('every rule in the dark sheet is scoped to :root[data-theme="dark"] (light mode untouched)', () => {
    const selectors = [...stripComments(dark).matchAll(/([^{}]+)\{[^{}]*\}/g)].map((m) => m[1].trim());
    expect(selectors.length).toBeGreaterThan(10);
    // Split a selector list on top-level commas only (commas inside :is(...) and [...] belong to one selector).
    const topLevel = (group: string) => {
      const parts: string[] = [];
      let depth = 0, quote = '', current = '';
      for (const ch of group) {
        if (quote) { if (ch === quote) quote = ''; current += ch; continue; }
        if (ch === '"' || ch === "'") quote = ch;
        else if (ch === '(' || ch === '[') depth += 1;
        else if (ch === ')' || ch === ']') depth -= 1;
        else if (ch === ',' && depth === 0) { parts.push(current.trim()); current = ''; continue; }
        current += ch;
      }
      return [...parts, current.trim()].filter(Boolean);
    };
    for (const group of selectors) {
      for (const sel of topLevel(group)) expect(sel.startsWith(':root[data-theme="dark"]'), sel).toBe(true);
    }
  });

  it('text stays readable on the dark card and page (AA)', () => {
    const card = hex(root, 'nv-card'), page = hex(root, 'nv-page');
    expect(contrast(hex(root, 'nv-ink'), card)).toBeGreaterThanOrEqual(7);
    for (const t of ['nv-ink-2', 'nv-ink-3', 'nv-ink-4', 'nv-green-text', 'nv-select-ink', 'nv-blue', 'nv-amber']) {
      expect(contrast(hex(root, t), card), t).toBeGreaterThanOrEqual(4.5);
      expect(contrast(hex(root, t), page), t).toBeGreaterThanOrEqual(4.5);
    }
    // Buttons keep white text on the green fill.
    expect(contrast('#FFFFFF', hex(root, 'nv-fill'))).toBeGreaterThanOrEqual(4.5);
  });

  it('the toast (light theme: ink background + white text) gets its own dark surface', () => {
    expect(dark).toMatch(/:root\[data-theme="dark"\] \.toast[^{]*\{[^}]*background: #2A2A2F !important; color: var\(--nv-ink\) !important/);
  });
});

describe('top-left switch', () => {
  const markupStart = html.indexOf('<div id="theme-mode-switch"');
  const markup = html.slice(markupStart, html.indexOf('</script>', markupStart) + '</script>'.length);

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.body.innerHTML = '';
  });
  const mount = () => {
    document.body.innerHTML = markup.slice(0, markup.indexOf('<script>'));
    const code = markup.slice(markup.indexOf('<script>') + 8, markup.lastIndexOf('</script>'));
    new Function(code)();
    return document.getElementById('theme-mode-switch')!;
  };

  it('sits right after the app title in the header', () => {
    const header = html.slice(html.indexOf('<header class="app-header">'), html.indexOf('<div id="left-status-badges"'));
    expect(header).toContain('<h1 class="app-title">');
    expect(header.indexOf('id="theme-mode-switch"')).toBeGreaterThan(header.indexOf('</h1>'));
  });

  it('switches to dark, remembers it, and switches back', () => {
    const box = mount();
    const [lightBtn, darkBtn] = [...box.querySelectorAll<HTMLButtonElement>('[data-theme-choice]')];
    expect(lightBtn.textContent).toContain('라이트');
    expect(darkBtn.textContent).toContain('다크');
    expect(lightBtn.getAttribute('aria-pressed')).toBe('true');

    darkBtn.click();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('nv-theme')).toBe('dark');
    expect(darkBtn.getAttribute('aria-pressed')).toBe('true');
    expect(lightBtn.getAttribute('aria-pressed')).toBe('false');

    lightBtn.click();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem('nv-theme')).toBe('light');
    expect(lightBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('shows the saved dark choice as pressed when the page opens dark', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const box = mount();
    expect(box.querySelector('[data-theme-choice="dark"]')!.getAttribute('aria-pressed')).toBe('true');
  });
});
