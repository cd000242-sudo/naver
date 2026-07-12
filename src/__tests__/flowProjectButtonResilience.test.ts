import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const source = readFileSync(new URL('../image/flowGenerator.ts', import.meta.url), 'utf8');

describe('Flow project button resilience', () => {
  it('rechecks delayed consent overlays after every project-list navigation', () => {
    expect(source).toContain('await dismissCookieBanner(page, true)');
    expect(source).not.toMatch(/\n\s*cookieBannerDismissed = true;\n\s*}\s*catch/);
  });

  it('retries all selectors on a fresh page instead of permanently excluding transient failures', () => {
    expect(source).toContain("iterateFlowSelectors('newProjectButton')");
    expect(source).not.toContain("iterateFlowSelectors('newProjectButton', r4Excluded)");
  });

  it('uses overlay-safe clicking and a live DOM text fallback for the current add_2 label', () => {
    expect(source).toContain("safeClickWithOverlayGuard(page, btn, `newProjectButton:${id}`)");
    expect(source).toMatch(/새\\s\*프로젝트\|New\\s\*project\|add_2/);
  });

  it('removes the current Radix changelog root and restores body pointer events', () => {
    expect(source).toContain("iframe.closest('[role=\"dialog\"], [role=\"alertdialog\"], dialog')");
    expect(source).toContain("document.body.style.setProperty('pointer-events', 'auto', 'important')");
    expect(source).toContain("[data-state=\"open\"][aria-hidden=\"true\"]");
  });
});
