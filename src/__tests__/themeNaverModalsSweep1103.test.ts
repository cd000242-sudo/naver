// @vitest-environment happy-dom
/**
 * [2026-11-03] Theme step 3 for modals: the "이미지 생성 중 (0/N)" progress modal and the other dark / navy modals
 * become white cards + green action + lavender emphasis + pale gray panels, built from classes (theme-naver-components.css
 * section 2) instead of inline black / navy / blue colors in the .ts files. Source, CSS and DOM assertions only.
 */
// Part 2: sweep over the other modal files and the consent DOM render (split for the 300-line limit).
import { describe, expect, it } from 'vitest';
import { read, theme, components, contrast, token, ruleFor, colorOf, DARK } from './helpers/themeNaverModalShared.js';

describe('4. other modals: no dark background / blue-indigo button left in the handled files', () => {
  const handled = [
    'src/renderer/modules/issueCollectConsent.ts',
    'src/renderer/modules/accountPauseModal.ts',
    'src/renderer/modules/retiredImageEngineGate.ts',
    'src/renderer/modules/startupEngineGateView.ts',
    'src/renderer/components/RecoveryBlockingModal.ts',
    'src/renderer/components/ProgressImageViewer.ts',
  ];
  for (const file of handled) {
    it(`${file.split('/').pop()}: DARK-color scan is empty and a theme scrim / card class is used`, () => {
      const src = read(file);
      expect(src.match(DARK)?.[0] ?? null).toBeNull();
      expect(src).toContain('nv-scrim');
    });
  }

  it('ProgressModal: waiting tile is a lavender class (no navy gradient), chosen tile a purple class, badge is a chip', () => {
    const src = read('src/renderer/components/ProgressModal.ts');
    expect(src).not.toContain('#1e3a5f');
    expect(src).not.toMatch(/rgba\(15,\s*23,\s*42/);
    expect(src).toContain("'grid-item-fade-in nv-tile nv-tile--pending'");
    expect(src).toContain("classList.add('nv-tile--chosen')");
    expect(src).toContain("badge.className = 'nv-badge-index'");
    expect(colorOf('html .nv-tile--pending', 'background')).toBe(token('nv-select-bg'));
    expect(ruleFor('html .nv-tile--chosen')).toContain('border-color: var(--nv-select-border)');
  });

  it('error badge and tag text pass 4.5:1 on their own ground', () => {
    expect(contrast(colorOf('html .nv-badge-err', 'color'), colorOf('html .nv-badge-err', 'background'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colorOf('html .nv-tag', 'color'), colorOf('html .nv-tag', 'background'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colorOf('html .nv-link', 'color'), '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('5. consent modals rendered in the DOM', () => {
  it('copyright consent: white card, disabled green agree button until the box is checked, no inline colors', async () => {
    localStorage.clear();
    const { ensureIssueCopyrightConsent } = await import('../renderer/modules/issueCollectConsent');
    const pending = ensureIssueCopyrightConsent();
    await new Promise((r) => setTimeout(r, 0));
    const overlay = document.getElementById('issue-consent-overlay') ?? document.querySelector('.nv-scrim');
    expect(overlay).toBeTruthy();
    expect(overlay!.className).toContain('nv-scrim');
    expect(overlay!.querySelector('.nv-modal.nv-modal--warn')).toBeTruthy();
    expect(overlay!.outerHTML).not.toMatch(DARK);
    expect(overlay!.outerHTML).not.toMatch(/(background|color)\s*:\s*#/i);
    const agree = overlay!.querySelector('#issue-consent-agree') as HTMLButtonElement;
    const check = overlay!.querySelector('#issue-consent-check') as HTMLInputElement;
    expect(agree.className).toContain('nv-btn--primary');
    expect(agree.disabled).toBe(true);
    check.checked = true;
    check.dispatchEvent(new Event('change'));
    expect(agree.disabled).toBe(false);
    (overlay!.querySelector('#issue-consent-cancel') as HTMLButtonElement).click();
    await expect(pending).resolves.toBe(false);
    expect(document.querySelector('.nv-scrim')).toBeNull();
  });
});

describe('6. second pass: every full-screen overlay in the modal files paints its scrim from the token', () => {
  const FILES = [
    'src/renderer/modules/continuousPublishing.ts', 'src/renderer/modules/multiAccountManager.ts', 'src/renderer/modules/licenseUI.ts',
    'src/renderer/modules/featureLockModal.ts', 'src/renderer/modules/paywallSystem.ts', 'src/renderer/modules/openaiImageGuard.ts',
    'src/renderer/utils/settingsModal.ts', 'src/renderer/modules/costAndAutoGen.ts', 'src/renderer/modules/imageDisplayGrid.ts',
    'src/renderer/modules/headingImageGen.ts', 'src/renderer/modules/imagePickerPreview.ts', 'src/renderer/components/VeoProgressOverlay.ts',
    'src/renderer/modules/localImageModals.ts', 'src/renderer/modules/postManager.ts', 'src/renderer/modules/postListUI.ts',
    'src/renderer/modules/scheduleManager.ts', 'src/renderer/modules/thumbnailGenerator.ts', 'src/renderer/modules/tailUIUtils.ts',
    'src/renderer/renderer.ts', 'src/renderer/modules/bestProductModal.ts',
  ];
  // A style string that covers the whole screen: inset:0, or top:0 together with bottom:0 / a 100% height.
  const containers = (src: string) =>
    [...src.matchAll(/(?:style\s*=\s*"[^"]*"|style\s*=\s*'[^']*'|cssText\s*=\s*`[^`]*`|cssText\s*=\s*'[^']*'|const modalStyle\s*=\s*'[^']*')/g)].map((m) => m[0]);
  const fullScreen = (c: string) => /inset:\s*0/.test(c) || (/top:\s*0/.test(c) && /(bottom:\s*0|height:\s*100)/.test(c));
  const DARK_BG = /background(?:-color)?:\s*(rgba?\(\s*(0,\s*0,\s*0|15,\s*23,\s*42|2,\s*6,\s*23)|#(0f172a|111827|1a1a1a|1a1a2e|0a0a0a|000)\b)/i;

  it('no full-screen overlay keeps a black / navy background literal', () => {
    let seen = 0;
    const offenders: string[] = [];
    for (const file of FILES) {
      for (const c of containers(read(file)).filter(fullScreen)) {
        seen++;
        if (DARK_BG.test(c)) offenders.push(`${file}: ${c.slice(0, 90).replace(/\s+/g, ' ')}`);
      }
    }
    expect(seen).toBeGreaterThan(20);
    expect(offenders).toEqual([]);
  });

  it('the token set the scripts rely on exists, with the soft line colors used for tinted borders', () => {
    expect(token('nv-red-line')).toBe('#F7C9C5');
    expect(token('nv-amber-line')).toBe('#F5D9A8');
    expect(theme).toMatch(/--nv-scrim-light:\s*rgba\(245, 246, 247, 0\.94\)/);
  });

  it('continuous publishing and multi-account modals: no navy card, no dark color-scheme left', () => {
    for (const file of ['src/renderer/modules/continuousPublishing.ts', 'src/renderer/modules/multiAccountManager.ts']) {
      const src = read(file);
      expect(src, file).not.toMatch(/linear-gradient\(135deg, #1a1a2e/);
      expect(src, file).not.toMatch(/var\(--bg-primary, #1a1a2e\)/);
      expect(src, file).not.toMatch(/color-scheme:\s*dark/);
    }
    // the multi-account bottom bar is a card, not a scrim
    expect(read('src/renderer/modules/multiAccountManager.ts')).toMatch(/ma-floating-progress-bar[\s\S]{0,260}background: var\(--nv-card\)/);
  });

  it('paywall: the price button hover is dark ink on pale gray (no white text), the pay button is the theme fill', () => {
    const src = read('src/renderer/modules/paywallSystem.ts');
    expect(src).toContain("priceBtn.style.color = 'var(--nv-ink)'");
    expect(src).toContain("payButton.style.background = 'var(--nv-fill)'");
    expect(src).not.toMatch(/priceBtn\.style\.color = '#fff'/);
  });

  it('update progress window (own BrowserWindow): light card with mirrored tokens, no navy gradient', () => {
    const src = read('src/updater.ts');
    expect(src).not.toMatch(/#1a1a2e|#16213e/);
    expect(src).toContain('--nv-fill: #00873C');
    expect(src).toContain('background: var(--nv-card)');
    expect(src).toContain("backgroundColor: '#F5F6F7'");
  });

  it('article table dialog and blog profile fields: tokens instead of the slate / navy palette', () => {
    const table = read('src/renderer/modules/articleTableComposer.ts');
    const css = table.slice(table.indexOf('.article-table-launcher {'), table.indexOf('@media (max-width:720px)'));
    expect(css).not.toMatch(/#(0f172a|0b1220|111827|334155|475569|1e293b|f8fafc)\b/i);
    expect(css).toContain('var(--nv-scrim)');
    expect(css).toContain('box-shadow:var(--shadow-xl)');
    expect(read('src/renderer/modules/blogProfileForm.ts')).not.toContain('rgba(15,23,42');
  });
});
