/**
 * [2026-11-03] White page + NAVER green theme, phase 1 (tokens + shared parts).
 * Source assertions only: the theme sheets must be the LAST stylesheets in index.html (they override the
 * older sheets), the solid action fill must stay the AA green #00873C, and the transitional sheet must
 * keep saying it is temporary so phases 2/3 shrink it instead of growing it.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = (rel: string) => resolve(__dirname, '../..', rel);
const read = (rel: string) => readFileSync(root(rel), 'utf8');
const html = read('public/index.html');
const theme = read('public/theme-naver.css');
const transitional = read('public/theme-naver-transitional.css');
const floating = read('public/floating-buttons.css');

const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
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
const token = (name: string) => {
  const m = theme.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token --${name} is not a hex literal in theme-naver.css`);
  return m[1];
};

describe('theme-naver link order', () => {
  const sheets = [...html.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)].map((m) => m[1]);
  const local = sheets.filter((href) => !/^https?:/.test(href));

  // 2026-11-03: the optional dark sheet (scoped to html[data-theme="dark"]) follows them (themeDarkMode1103.test.ts).
  it('theme-naver.css, theme-naver-components.css, theme-naver-transitional.css, then theme-naver-dark.css are the last four stylesheets', () => {
    expect(local.slice(-4)).toEqual(['theme-naver.css', 'theme-naver-components.css', 'theme-naver-transitional.css', 'theme-naver-dark.css']);
  });

  it('every older sheet is linked before the theme', () => {
    for (const older of ['styles.css', 'floating-buttons.css', 'thumbnail-studio.css', 'daily-publishing.css']) {
      expect(local.indexOf(older)).toBeGreaterThanOrEqual(0);
      expect(local.indexOf(older)).toBeLessThan(local.indexOf('theme-naver.css'));
    }
  });

  it('all three theme sheets are linked from <head> only', () => {
    const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
    expect(head).toContain('href="theme-naver.css"');
    expect(head).toContain('href="theme-naver-components.css"');
    expect(head).toContain('href="theme-naver-transitional.css"');
    expect(html.match(/theme-naver/g)).toHaveLength(4);
  });
});

describe('theme-naver tokens', () => {
  it('solid action fill is #00873C with white text at 4.5:1 or better', () => {
    expect(theme).toMatch(/--nv-fill:\s*#00873C/i);
    expect(contrast('#00873C', '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  it('hover is one step darker and still passes 4.5:1 with white text', () => {
    const fill = token('nv-fill-hover');
    expect(lum(fill)).toBeLessThan(lum('#00873C'));
    expect(contrast(fill, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  it('green used as text passes 4.5:1 on white and on the green tint', () => {
    expect(contrast(token('nv-green-text'), '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('nv-green-text'), token('nv-green-soft'))).toBeGreaterThanOrEqual(4.5);
  });

  it('body ink and muted ink pass 4.5:1 on the page and card backgrounds', () => {
    for (const ink of ['nv-ink', 'nv-ink-2', 'nv-ink-3']) {
      expect(contrast(token(ink), token('nv-page'))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(token(ink), token('nv-card'))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('legacy button colors (--primary / --accent) follow the AA fill, not the 2.25:1 brand green', () => {
    expect(theme).toMatch(/--primary:\s*var\(--nv-fill\)/);
    expect(theme).toMatch(/--primary-hover:\s*var\(--nv-fill-hover\)/);
    expect(theme).toMatch(/--accent:\s*var\(--nv-fill\)/);
  });
});

describe('theme-naver transitional sheet', () => {
  it('states at the very top that phases 2 and 3 shrink it', () => {
    const top = transitional.slice(0, transitional.indexOf('*/') + 2);
    expect(top).toContain('2');
    expect(top).toContain('3');
    expect(top).toMatch(/shrink|줄여/i);
    expect(top).toMatch(/class|클래스/i);
  });

  it('every theme sheet stays under the 300-line file limit', () => {
    expect(theme.split('\n').length).toBeLessThanOrEqual(300);
    expect(transitional.split('\n').length).toBeLessThanOrEqual(300);
  });
});

describe('new-session UI follows the theme fill', () => {
  it('[매일 예약발행] button uses the theme fill variable, not a hard-coded brand green', () => {
    const rule = floating.match(/#open-daily-publishing\s*\{[^}]*\}/)![0];
    const hover = floating.match(/#open-daily-publishing:hover\s*\{[^}]*\}/)![0];
    expect(rule).toMatch(/background:\s*var\(--nv-fill,\s*#00873C\)/i);
    expect(rule).not.toMatch(/#03C75A/i);
    expect(hover).toMatch(/background:\s*var\(--nv-fill-hover,/i);
  });

  it('the theme does not repaint the daily button as a quiet outline button', () => {
    const outlineList = theme.match(/html \.license-button-fixed[^{]*\{/)![0];
    expect(outlineList).not.toContain('#open-daily-publishing');
  });

  it('the calendar "today" cell uses the AA fill (white text on #03C75A is 2.25:1)', () => {
    expect(theme).toMatch(/\.calendar-day\.today\s*\{\s*background:\s*var\(--nv-fill\)/);
  });
  it('header notes start below the fixed member badge instead of under it', () => {
    // Measured in the app: badge covers y 64-107; a 60px margin starts the note at y~115 (margins collapse).
    expect(theme).toContain('html .app-header > .summary-note[data-risk-warning] { margin-top: 60px; }');
  });
});
