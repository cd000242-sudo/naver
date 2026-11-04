// @vitest-environment happy-dom
/**
 * [2026-11-04] Owner: "화면밝기도 초록 파랑으로 해주세요 눈아프다고하시는분들이계셔서 그래요 눈에 최대한 좋고 눈부시지않게
 * 글자도 잘보이도록" + "기본은 다크로". Four screens (다크 default / 라이트 / 초록 / 파랑). The soft green and blue screens
 * live in theme-naver-tint.css: no pure white surface, no pure black text, body text ≥ 7:1, smaller text ≥ 4.5:1.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(resolve(__dirname, '../..', rel), 'utf8').replace(/\r\n/g, '\n');
const html = read('public/index.html');
const light = read('public/theme-naver.css');
const tint = read('public/theme-naver-tint.css');

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

describe.each(['green', 'blue'])('%s eye-comfort screen', (name) => {
  const root = block(tint, `:root[data-theme="${name}"]`);

  it('re-points every colour token of the light :root', () => {
    const tokens = [...new Set([...block(light, ':root').matchAll(/(--nv-[a-z0-9-]+):/g)].map((m) => m[1]))]
      .filter((t) => t !== '--nv-font' && t !== '--nv-none');
    for (const token of tokens) expect(root, token).toContain(`${token}:`);
  });

  it('low glare: no pure white surface, no pure black text, a soft (not saturated) page', () => {
    for (const t of ['nv-page', 'nv-card', 'nv-sunken']) expect(hex(root, t).toUpperCase(), t).not.toBe('#FFFFFF');
    expect(hex(root, 'nv-ink').toUpperCase()).not.toBe('#000000');
    expect(lum(hex(root, 'nv-card'))).toBeLessThan(0.9); // white is 1.0
    expect(lum(hex(root, 'nv-page'))).toBeGreaterThan(0.6);
  });

  it('readable: body ≥ 7:1, every smaller text token ≥ 4.5:1 on card and page, white on the action fill ≥ 4.5:1', () => {
    const card = hex(root, 'nv-card'), page = hex(root, 'nv-page'), sunken = hex(root, 'nv-sunken');
    for (const bg of [card, page, sunken]) expect(contrast(hex(root, 'nv-ink'), bg)).toBeGreaterThanOrEqual(7);
    for (const t of ['nv-ink-2', 'nv-ink-3', 'nv-ink-4', 'nv-green-text', 'nv-select-ink', 'nv-blue', 'nv-amber', 'nv-red', 'nv-log-ink']) {
      for (const bg of [card, page, sunken]) expect(contrast(hex(root, t), bg), `${t} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast('#FFFFFF', hex(root, 'nv-fill'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#FFFFFF', hex(root, 'nv-fill-hover'))).toBeGreaterThanOrEqual(4.5);
  });
});

describe('tint sheet wiring', () => {
  it('is the last stylesheet, after the dark sheet', () => {
    const sheets = [...html.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)].map((m) => m[1]).filter((h) => !/^https?:/.test(h));
    expect(sheets.slice(-2)).toEqual(['theme-naver-dark.css', 'theme-naver-tint.css']);
  });

  it('every rule is scoped to the green or blue screen (light and dark untouched)', () => {
    const selectors = [...tint.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{[^{}]*\}/g)].map((m) => m[1].trim());
    expect(selectors.length).toBeGreaterThan(5);
    for (const group of selectors) expect(group, group.slice(0, 80)).toMatch(/^:root(\[data-theme="(green|blue)"\]|:is\(\[data-theme="green"\], \[data-theme="blue"\]\))/);
  });

  it('white inline surfaces are covered by the tint card (no bright patches)', () => {
    expect(tint).toMatch(/\[style\*="background: #fff" i\][\s\S]*?\{\s*background: var\(--nv-card\) !important;/);
  });
});

describe('four-screen switch (default dark)', () => {
  const start = html.indexOf('<div id="theme-mode-switch"');
  const markup = html.slice(start, html.indexOf('</script>', start) + '</script>'.length);
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.body.innerHTML = '';
  });
  const mount = () => {
    document.body.innerHTML = markup.slice(0, markup.indexOf('<script>'));
    new Function(markup.slice(markup.indexOf('<script>') + 8, markup.lastIndexOf('</script>')))();
    return document.getElementById('theme-mode-switch')!;
  };
  const headScript = () => {
    const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
    const s = head.slice(head.indexOf('<script>try { var nvTheme'));
    return s.slice('<script>'.length, s.indexOf('</script>'));
  };

  it('buttons in order 다크 · 라이트 · 초록 · 파랑, dark pressed in the markup', () => {
    const box = mount();
    const buttons = [...box.querySelectorAll<HTMLButtonElement>('[data-theme-choice]')];
    expect(buttons.map((b) => b.getAttribute('data-theme-choice'))).toEqual(['dark', 'light', 'green', 'blue']);
    expect(markup).toMatch(/data-theme-choice="dark" aria-pressed="true"/);
  });

  it('head script: nothing stored → dark; light/green/blue restored; anything else → dark', () => {
    new Function(headScript())();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    for (const [stored, expected] of [['light', null], ['green', 'green'], ['blue', 'blue'], ['purple', 'dark']] as const) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('nv-theme', stored);
      new Function(headScript())();
      expect(document.documentElement.getAttribute('data-theme'), stored).toBe(expected);
    }
  });

  it('clicking a screen sets it, remembers it, and presses only that button', () => {
    const box = mount();
    for (const choice of ['green', 'blue', 'dark']) {
      box.querySelector<HTMLButtonElement>(`[data-theme-choice="${choice}"]`)!.click();
      expect(document.documentElement.getAttribute('data-theme')).toBe(choice);
      expect(localStorage.getItem('nv-theme')).toBe(choice);
      expect([...box.querySelectorAll('[aria-pressed="true"]')].map((b) => b.getAttribute('data-theme-choice'))).toEqual([choice]);
    }
    box.querySelector<HTMLButtonElement>('[data-theme-choice="light"]')!.click();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(localStorage.getItem('nv-theme')).toBe('light');
  });
});
