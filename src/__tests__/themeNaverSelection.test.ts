// @vitest-environment happy-dom
/**
 * [2026-11-03] Theme phase 1 follow-up, from the owner's review of the real screen:
 *  1) borders were too faint -> sharper panel / field border variables
 *  2) chosen TAB = solid green fill + white text; not chosen = white + clear gray border
 *  3) chosen "pick one" CARD = lavender fill + purple 2px border; hover = pale gray (tabs and cards never share colors)
 *  4) the "use AI images" checkbox is gone; readers fall back to ON when the element is missing
 *  5) the image-management usage guide starts collapsed and remembers the choice
 * Source / DOM assertions only (no build, no live window).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const root = (rel: string) => resolve(__dirname, '../..', rel);
const read = (rel: string) => {
  try { return readFileSync(root(rel), 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; }
};
const html = read('public/index.html');
const theme = read('public/theme-naver.css');
const components = read('public/theme-naver-components.css');
const transitional = read('public/theme-naver-transitional.css');

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
const rules = (css: string) =>
  [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selectors: m[1].split(/,(?![^[(]*[\])])/).map((s) => s.trim()),
    body: m[2].replace(/\s+/g, ' ').trim(),
  }));
const ruleFor = (css: string, selector: string) => {
  const found = rules(css).find((r) => r.selectors.includes(selector));
  if (!found) throw new Error(`no rule for selector: ${selector}`);
  return found.body;
};

describe('1. sharper borders', () => {
  it('panel border is #C6CBD1 and field / button border is #BFC4CA', () => {
    expect(token('nv-line')).toBe('#C6CBD1');
    expect(token('nv-line-strong')).toBe('#BFC4CA');
  });

  it('both are darker than the old pale values but still gentle (1.5 to 2.6:1 against white)', () => {
    for (const [name, old] of [['nv-line', '#E3E5E8'], ['nv-line-strong', '#D1D4D9']] as const) {
      expect(lum(token(name))).toBeLessThan(lum(old));
      expect(contrast(token(name), '#FFFFFF')).toBeGreaterThanOrEqual(1.5);
      expect(contrast(token(name), '#FFFFFF')).toBeLessThanOrEqual(2.6);
    }
  });

  it('cards and fields take their border from the variables, hairlines keep the soft one', () => {
    expect(ruleFor(theme, 'html .form-section')).toContain('border: 1px solid var(--nv-line)');
    expect(ruleFor(theme, 'html .field input')).toContain('border: 1px solid var(--nv-line-strong)');
    expect(token('nv-line-soft')).toBe('#E3E5E8');
    expect(ruleFor(theme, 'html .app-header')).toContain('var(--nv-line-soft)');
    expect(ruleFor(theme, 'html .modal-actions')).toContain('var(--nv-line-soft)');
  });

  it('no border declaration re-hardcodes the old pale hexes (hover uses --nv-line-hover)', () => {
    const css = theme.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/border[a-z-]*:[^;]*#(D1D4D9|E3E5E8|C5C9CF)/i);
    expect(token('nv-line-hover')).toBe('#A5ABB3');
    expect(lum(token('nv-line-hover'))).toBeLessThan(lum(token('nv-line-strong')));
  });
});

describe('2. tabs: chosen = solid green fill', () => {
  it('chosen tab rule is --nv-fill with white text, never the green tint', () => {
    for (const sel of ['html .pub-mode-tab.active', 'html .account-tab.active', 'html .source-toggle-btn--active']) {
      const body = ruleFor(theme, sel);
      expect(body).toContain('background: var(--nv-fill) !important');
      expect(body).toContain('color: #FFFFFF !important');
      expect(body).not.toMatch(/green-soft|green-text/);
    }
    expect(contrast(token('nv-fill'), '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  it('not chosen tab is white with a clear gray border and dark gray text', () => {
    for (const sel of ['html .pub-mode-tab', 'html .account-tab:not(.active)']) {
      const body = ruleFor(theme, sel);
      expect(body).toContain('background: var(--nv-card) !important');
      expect(body).toContain('border: 1px solid var(--nv-line-strong)');
      expect(body).toContain('color: var(--nv-ink-2) !important');
    }
    expect(contrast(token('nv-ink-2'), token('nv-card'))).toBeGreaterThanOrEqual(4.5);
  });

  it('image sub-tabs and the thumbnail segmented control follow the same fill rule', () => {
    expect(ruleFor(theme, 'html #images-subtab-manage[style*="accent-primary"]')).toContain('background: var(--nv-fill) !important');
    expect(ruleFor(theme, 'html #tab-image-tools #subtab-thumbnail .studio-segmented button.selected')).toContain('background: var(--nv-fill) !important');
  });

  it('the top tab underline stays the bright green 3px bar', () => {
    expect(ruleFor(theme, 'html .tab-button::before')).toMatch(/background: var\(--nv-green\)[^;]*; height: 3px/);
    expect(ruleFor(theme, 'html .tab-button.active::before')).toContain('width: 100%');
  });

  it('the account tab switch toggles the .active class the theme paints from', () => {
    const src = read('src/renderer/renderer.ts');
    const fn = src.slice(src.indexOf('function updateTabStyles()'), src.indexOf("singleAccountTab?.addEventListener('click'"));
    expect(fn).toContain("singleAccountTab?.classList.toggle('active', currentAccountMode === 'single')");
    expect(fn).toContain("multiAccountTab?.classList.toggle('active', currentAccountMode === 'multi')");
  });
});

describe('3. pick-one cards: chosen = lavender + purple 2px', () => {
  const CHOSEN = [
    'html .publish-flow-card.active',
    'html [data-engine-option]:has(input:checked)',
    'html [data-image-engine-option]:has(input:checked)',
    'html .source-option[style*="102, 126, 234"]',
    'html .style-option:has(input:checked)',
  ];
  const BASE = ['html .publish-flow-card', 'html [data-engine-option]', 'html [data-image-engine-option]', 'html .source-option', 'html .style-option'];

  it('tokens: lavender #F3EFFF fill, purple #7B61FF border, pale gray hover', () => {
    expect(token('nv-select-bg')).toBe('#F3EFFF');
    expect(token('nv-select-border')).toBe('#7B61FF');
    expect(token('nv-hover-bg')).toBe('#F2F3F5');
  });

  it('text on the lavender fill passes 4.5:1 (ink, ink-2, ink-3) and the tag passes too', () => {
    for (const ink of ['nv-ink', 'nv-ink-2', 'nv-ink-3']) {
      expect(contrast(token(ink), token('nv-select-bg'))).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(token('nv-select-ink'), token('nv-select-tag-bg'))).toBeGreaterThanOrEqual(4.5);
  });

  it('the purple border is a visible UI edge (3:1) on white and on the lavender fill', () => {
    expect(contrast(token('nv-select-border'), '#FFFFFF')).toBeGreaterThanOrEqual(3);
    expect(contrast(token('nv-select-border'), token('nv-select-bg'))).toBeGreaterThanOrEqual(3);
  });

  it('every card kind has a chosen rule: lavender fill + purple border, and no green', () => {
    for (const sel of CHOSEN) {
      const body = ruleFor(components, sel);
      expect(body).toContain('background: var(--nv-select-bg) !important');
      expect(body).toContain('border-color: var(--nv-select-border) !important');
      expect(body).not.toMatch(/nv-fill|nv-green/);
    }
  });

  it('not chosen cards are white with a 2px gray border (same width, so nothing jumps)', () => {
    for (const sel of BASE) {
      const body = ruleFor(components, sel);
      expect(body).toContain('background: var(--nv-card) !important');
      expect(body).toContain('border: 2px solid var(--nv-line-strong) !important');
    }
  });

  it('hover on a not chosen card is a pale gray fill; the chosen card keeps lavender', () => {
    const body = ruleFor(components, 'html .publish-flow-card:not(.active):hover');
    expect(body).toContain('background: var(--nv-hover-bg) !important');
    expect(body).toContain('border-color: var(--nv-line-hover) !important');
    expect(ruleFor(components, 'html .style-option:not(:has(input:checked)):hover')).toContain('--nv-hover-bg');
  });

  it('the chosen publish card tag uses the purple ink, not the old green', () => {
    const body = ruleFor(components, 'html .publish-flow-card.active .publish-flow-tag');
    expect(body).toContain('var(--nv-select-tag-bg)');
    expect(body).toContain('var(--nv-select-ink)');
  });

  it('the old green card rules are gone from theme-naver.css', () => {
    expect(theme).not.toContain('publish-flow-card');
    expect(theme).not.toContain('data-engine-option');
  });

  it('CSS keys off what the code really paints: checked radios and the #667eea border', () => {
    expect(read('src/renderer/modules/startupEngineGateView.ts')).toContain("${checked ? 'checked' : ''}");
    expect(read('src/renderer/modules/startupImageEngineGate.ts')).toContain("${checked ? 'checked' : ''}");
    const heading = read('src/renderer/components/HeadingImageSettings.ts');
    expect(heading).toContain("style.borderColor = '#667eea'");
    expect(parseInt('667eea'.slice(0, 2), 16)).toBe(102);
    expect(parseInt('667eea'.slice(2, 4), 16)).toBe(126);
    expect(parseInt('667eea'.slice(4, 6), 16)).toBe(234);
  });
});

describe('sheets', () => {
  it('components sheet is linked right after theme-naver.css and before the transitional sheet', () => {
    const sheets = [...html.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)].map((m) => m[1]).filter((h) => !/^https?:/.test(h));
    expect(sheets.slice(-3)).toEqual(['theme-naver.css', 'theme-naver-components.css', 'theme-naver-transitional.css']);
  });

  it('every theme sheet stays under 300 lines and the transitional sheet got no new rules', () => {
    for (const css of [theme, components, transitional]) expect(css.split('\n').length).toBeLessThanOrEqual(300);
    expect(transitional).not.toMatch(/nv-select|pub-mode-tab|account-tab|publish-flow/);
  });
});

describe('4. "use AI images" checkbox is gone', () => {
  it('index.html has neither checkbox nor its label', () => {
    expect(html).not.toContain('unified-use-ai-image');
    expect(html).not.toContain('continuous-modal-use-ai-image');
    expect(html).not.toContain('AI 이미지 활용');
  });

  it('every reader falls back to ON when the element is missing', () => {
    const reads = (rel: string, re: RegExp) => (read(rel).match(re) || []).length;
    const unified = /getElementById\('unified-use-ai-image'\) as HTMLInputElement\)\?\.checked \?\? true/g;
    expect(reads('src/renderer/modules/publishingHandlers.ts', unified)).toBe(2);
    expect(reads('src/renderer/modules/formAndAutomation.ts', unified)).toBe(1);
    expect(read('src/renderer/modules/continuousPublishing.ts')).toContain('useAiImage: useAiImageCheck?.checked ?? true');
    expect(read('src/renderer/modules/continuousPublishing.ts')).toContain('if (useAiImageCheck) useAiImageCheck.checked = item.useAiImage ?? true');
    expect(read('src/renderer/modules/fullAutoFlow.ts')).toContain('(formData.useAiImage ?? true)');
  });

  it('a missing element reads as ON (the old default), an unchecked one as OFF', () => {
    document.body.innerHTML = '';
    const readIt = () => (document.getElementById('unified-use-ai-image') as HTMLInputElement | null)?.checked ?? true;
    expect(readIt()).toBe(true);
    document.body.innerHTML = '<input type="checkbox" id="unified-use-ai-image">';
    expect(readIt()).toBe(false);
    document.body.innerHTML = '';
  });

  it('the label helper still guards a missing element, and the shopping "collected" sub-mode is untouched', () => {
    expect(read('src/renderer/modules/tailUIUtils.ts')).toContain('if (aiLabel) aiLabel.textContent');
    const handlers = read('src/renderer/modules/publishingHandlers.ts');
    expect(handlers).toContain("selectedShoppingSubImageMode === 'ai'");
    expect(handlers).toContain('const shouldMatchCollected = !formData.useAiImage;');
  });
});

describe('5. image-management usage guide starts collapsed', () => {
  const scriptMatch = html.match(/<script>\s*(\/\* images-usage-guide-fold[\s\S]*?)<\/script>/);
  const fragment = `<div id="images-usage-guide">
    <div id="images-usage-guide-head" role="button" tabindex="0" aria-expanded="false"><h3>이미지 관리 사용법</h3><span class="toggle-icon">▼</span></div>
    <div id="images-usage-guide-body" style="display: none;">내용</div></div>`;
  const run = () => new Function(scriptMatch![1])();
  const body = () => document.getElementById('images-usage-guide-body') as HTMLElement;
  const head = () => document.getElementById('images-usage-guide-head') as HTMLElement;
  const icon = () => head().querySelector('.toggle-icon') as HTMLElement;

  beforeEach(() => { localStorage.clear(); document.body.innerHTML = fragment; });
  afterEach(() => { localStorage.clear(); document.body.innerHTML = ''; });

  it('markup ships collapsed: hidden body, down arrow, ids, no old inline toggle', () => {
    const guideStart = html.indexOf('id="images-usage-guide"');
    expect(guideStart).toBeGreaterThan(0);
    const box = html.slice(guideStart, guideStart + 2500);
    expect(box).toContain('id="images-usage-guide-head"');
    expect(box).toMatch(/id="images-usage-guide-body"\s+style="display: none;/);
    expect(box).toMatch(/<span class="toggle-icon"[^>]*>▼<\/span>/);
    expect(box).not.toContain('this.nextElementSibling.style.display');
  });

  it('script is present, collapses on first run, opens on click and remembers it', () => {
    expect(scriptMatch).not.toBeNull();
    run();
    expect(body().style.display).toBe('none');
    expect(icon().textContent).toBe('▼');
    head().click();
    expect(body().style.display).toBe('block');
    expect(icon().textContent).toBe('▲');
    expect(head().getAttribute('aria-expanded')).toBe('true');
    expect(localStorage.getItem('imagesUsageGuideOpen')).toBe('1');
  });

  it('a remembered open state is restored on the next start, and closing is remembered too', () => {
    localStorage.setItem('imagesUsageGuideOpen', '1');
    run();
    expect(body().style.display).toBe('block');
    head().click();
    expect(body().style.display).toBe('none');
    expect(localStorage.getItem('imagesUsageGuideOpen')).toBe('0');
    document.body.innerHTML = fragment;
    run();
    expect(body().style.display).toBe('none');
  });

  it('keyboard Enter toggles it as well', () => {
    run();
    head().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(body().style.display).toBe('block');
  });

  it('survives storage that throws', () => {
    const saved = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('denied'); } });
    try {
      expect(() => run()).not.toThrow();
      expect(body().style.display).toBe('none');
      expect(() => head().click()).not.toThrow();
      expect(body().style.display).toBe('block');
    } finally {
      if (saved) Object.defineProperty(window, 'localStorage', saved);
    }
  });
});
