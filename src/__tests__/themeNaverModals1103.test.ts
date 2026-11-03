// @vitest-environment happy-dom
/**
 * [2026-11-03] Theme step 3 for modals: the "이미지 생성 중 (0/N)" progress modal and the other dark / navy modals
 * become white cards + green action + lavender emphasis + pale gray panels, built from classes (theme-naver-components.css
 * section 2) instead of inline black / navy / blue colors in the .ts files. Source, CSS and DOM assertions only.
 */
import { describe, expect, it } from 'vitest';
import { read, theme, components, transitional, modalCss, contrast, token, rules, ruleFor, colorOf, DARK, slice } from './helpers/themeNaverModalShared.js';

describe('1. modal classes live in the components sheet, tokens only', () => {
  it('stays under 300 lines and the modal section carries no hex / rgb literal', () => {
    expect(components.split('\n').length).toBeLessThanOrEqual(300);
    expect(modalCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(modalCss).not.toMatch(/rgba?\(/);
  });

  it('theme-naver.css and the link order did not change shape (no new sheet, still 3 theme links)', () => {
    expect(theme.split('\n').length).toBeLessThanOrEqual(300);
    const html = read('public/index.html');
    expect(html.match(/theme-naver/g)).toHaveLength(3);
  });

  it('the transitional sheet got no new rule (39 before this step)', () => {
    expect(rules(transitional)).toHaveLength(39);
  });

  it('scrim is a dim neutral, not black; the light scrim is pale', () => {
    expect(theme).toMatch(/--nv-scrim:\s*rgba\(30, 30, 35, 0\.42\)/);
    expect(ruleFor('html .nv-scrim')).toContain('background: var(--nv-scrim)');
    expect(ruleFor('html .nv-scrim--light')).toContain('background: var(--nv-scrim-light)');
  });
});

describe('2. image generation progress modal (liveImagePreview)', () => {
  const src = read('src/renderer/modules/headingImageGen.ts');
  const region = slice(src, 'const liveImagePreview = {', '// CSS 애니메이션 추가');

  it('no black / navy / blue literal remains in the modal template or its updaters', () => {
    expect(region).not.toMatch(DARK);
    // no inline color at all: every style="" in the template is layout only
    const styles = [...region.matchAll(/style="([^"]*)"/g)].map((m) => m[1]);
    for (const s of styles) expect(s).not.toMatch(/(^|;)\s*(color|background|border)[a-z-]*\s*:/i);
    expect(region).not.toMatch(/\.style\.(border|background|color)\b/);
  });

  it('built from the theme classes: scrim, white card, danger close, primary folder button, panel, log', () => {
    for (const cls of ['nv-scrim', 'nv-modal nv-modal--wide', 'nv-btn nv-btn--danger', 'nv-btn nv-btn--primary nv-btn--block',
      'nv-slot-grid', 'nv-stage nv-stage--square', 'nv-panel', 'nv-check', 'nv-log', 'nv-label']) {
      expect(region).toContain(cls);
    }
  });

  it('each preview slot state is its own class, and the CSS paints them lavender / purple / green / red', () => {
    expect(region).toContain('nv-slot nv-slot--pending');
    expect(region).toContain('nv-slot nv-slot--${status}');
    expect(colorOf('html .nv-slot', 'background')).toBe(token('nv-select-bg'));
    expect(ruleFor('html .nv-slot')).toContain('border: 2px solid var(--nv-select-line)');
    expect(ruleFor('html .nv-slot--generating')).toContain('border-color: var(--nv-select-border)');
    expect(ruleFor('html .nv-slot--completed')).toContain('border-color: var(--nv-fill)');
    expect(ruleFor('html .nv-slot--failed')).toContain('border-color: var(--nv-red)');
    expect(token('nv-select-bg')).toBe('#F3EFFF');
    expect(token('nv-select-border')).toBe('#7B61FF');
  });

  it('log line tone follows the message: error red, warning amber, success green, else plain', () => {
    const m = region.match(/logTone\(message: string\): string \{([\s\S]*?)\n {4}\},/);
    expect(m).toBeTruthy();
    const tone = new Function('message', m![1]) as (message: string) => string;
    expect(tone('❌ 이미지 생성 실패')).toBe(' nv-log__line--err');
    expect(tone('⚠️ 재시도 중')).toBe(' nv-log__line--warn');
    expect(tone('✅ 1/7 완료')).toBe(' nv-log__line--ok');
    expect(tone('⏳ 이미지 생성을 시작합니다...')).toBe('');
    // a failure that also says "완료" is still an error line
    expect(tone('❌ 완료되지 않았습니다')).toBe(' nv-log__line--err');
    expect(region).toContain('logEntry.className = `nv-log__line${this.logTone(message)}`');
  });

  it('log colors: success #007A37, warning amber, error red, all >= 4.5:1 on the pale log ground', () => {
    expect(token('nv-green-text')).toBe('#007A37');
    const ground = colorOf('html .nv-log', 'background');
    expect(ground).toBe(token('nv-sunken'));
    expect(colorOf('html .nv-log__line--ok', 'color')).toBe('#007A37');
    for (const sel of ['html .nv-log', 'html .nv-log__line--ok', 'html .nv-log__line--warn', 'html .nv-log__line--err',
      'html .nv-log__line--ai', 'html .nv-log__line--info', 'html .nv-log__time']) {
      expect(contrast(colorOf(sel, 'color'), ground), sel).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('the "썸네일 텍스트 포함" row is dark ink on a pale panel (>= 4.5:1, actually computed)', () => {
    const panel = colorOf('html .nv-panel', 'background');
    const ink = colorOf('html .nv-check', 'color');
    expect(contrast(ink, panel)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colorOf('html .nv-label', 'color'), colorOf('html .nv-modal', 'background'))).toBeGreaterThanOrEqual(4.5);
  });

  it('buttons: green fill + white text, close = theme red + white text, both >= 4.5:1', () => {
    expect(contrast(colorOf('html .nv-btn--primary', 'background'), '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(colorOf('html .nv-btn--primary', 'background')).toBe(token('nv-fill'));
    expect(contrast(colorOf('html .nv-btn--danger', 'background'), '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colorOf('html .nv-btn--warn', 'background'), '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colorOf('html .nv-slot__check', 'background'), '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  it('the live preview updater in costAndAutoGen uses the same slot / log classes', () => {
    const cost = read('src/renderer/modules/costAndAutoGen.ts');
    const part = slice(cost, "const livePanel = document.getElementById('live-image-preview-panel');", '// 4) 진행률 제목 업데이트');
    expect(part).toContain("nv-slot--completed");
    expect(part).toContain('nv-log__line--ok');
    expect(part).not.toMatch(DARK);
    expect(part).not.toMatch(/\.style\.(border|marginBottom)/);
  });
});

describe('3. text generation progress modal (aiProgressModal)', () => {
  const src = read('src/renderer/modules/formAndAutomation.ts');
  const tpl = slice(src, '<div id="ai-progress-modal"', "document.body.insertAdjacentHTML('beforeend', modalHtml)");
  const addLog = slice(src, '  addLog(message: string) {\n    if (this.progressLog) {', 'startAnimation(');

  it('template and log lines carry no dark / navy / blue inline colors, hover is CSS not JS', () => {
    expect(tpl).not.toMatch(DARK);
    expect(tpl).not.toMatch(/linear-gradient|rgba\(/);
    expect(addLog).not.toMatch(DARK);
    expect(addLog).not.toMatch(/style="color/);
    expect(src).not.toMatch(/closeXBtn\.style\.color|minimizeBtn\.style\.color/);
  });

  it('uses the shared scrim / card / progress / log / button classes', () => {
    for (const cls of ['nv-scrim', 'nv-modal nv-modal--center', 'nv-icon-btn', 'nv-progress__bar', 'nv-log', 'nv-btn']) expect(tpl).toContain(cls);
    expect(addLog).toContain('nv-log__line--${tone}');
  });
});
