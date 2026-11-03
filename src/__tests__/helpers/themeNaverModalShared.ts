// [2026-11-03] Shared readers and color math for the modal theme tests (themeNaverModals1103*.test.ts).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const root = (rel: string) => resolve(__dirname, '../../..', rel);
export const read = (rel: string) => readFileSync(root(rel), 'utf8').replace(/\r\n/g, '\n');
export const theme = read('public/theme-naver.css');
export const components = read('public/theme-naver-components.css');
export const transitional = read('public/theme-naver-transitional.css');
export const modalCss = components.slice(components.indexOf('/* 2. Modal parts'));

export const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};
export const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
export const token = (name: string) => {
  const m = theme.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token --${name} is not a hex literal in theme-naver.css`);
  return m[1];
};
export const rules = (css: string) =>
  [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selectors: m[1].split(/,(?![^[(]*[\])])/).map((s) => s.trim()),
    body: m[2].replace(/\s+/g, ' ').trim(),
  }));
export const ruleFor = (selector: string) => {
  const found = rules(components).find((r) => r.selectors.includes(selector));
  if (!found) throw new Error(`no rule for selector: ${selector}`);
  return found.body;
};
/** The token a declaration resolves to: `background: var(--nv-x)` -> hex of --nv-x. */
export const colorOf = (selector: string, prop: string) => {
  const m = ruleFor(selector).match(new RegExp(`(?:^|[ ;])${prop}:\\s*var\\(--([a-z0-9-]+)\\)`));
  if (!m) throw new Error(`${selector} has no ${prop}: var(--token)`);
  return m[1] === 'text-white' ? '#FFFFFF' : token(m[1]);
};

// Dark / navy / blue literals that used to paint the modals.
export const DARK = /rgba?\(\s*(0,\s*0,\s*0|15,\s*23,\s*42)|#(0f172a|111827|1e1e1e|1a1a1a|18181b|1e293b|1a1a2e|16213e|27272a|3f3f46|71717a|a1a1aa|d4d4d8|1e1e24|2a2a35|4f46e5|3b82f6|ef4444|22c55e|60a5fa)\b|color:\s*(white|#fff)\b/i;
export const slice = (src: string, from: string, to: string) => {
  const a = src.indexOf(from);
  const b = src.indexOf(to, a + from.length);
  if (a < 0 || b < 0) throw new Error(`slice anchors not found: ${from} .. ${to}`);
  return src.slice(a, b);
};
