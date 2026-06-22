import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * Regression guards for CTA insertion verification (2026-06-23).
 *
 * Symptom: CTA (제휴/구매 버튼) verification used a bare `html.includes('background:')`
 * (also linear-gradient / border-radius:) as proof a CTA button was present. Any other
 * paragraph with an inline style — a highlight box, a table — matched, so verification
 * returned a false positive ("CTA 있음") even when the CTA insert had failed. In
 * insertCtaHtmlAtBottom that false positive skipped the insertCtaViaTyping fallback,
 * so the revenue CTA was silently missing from the published post.
 *
 * Fix: a CTA is always an anchor (href=). Style-based checks are now gated behind
 * `href=`, and buttonText matching only counts when buttonText is non-empty. Highlights
 * and tables (no href) no longer false-match; real CTAs (href + button styling) still do.
 */
describe('CTA verification false-positive guard', () => {
  const cta = read('automation/ctaHelpers.ts');

  it('does not treat a bare inline style as proof of a CTA (must be href-gated)', () => {
    // The old unsafe lines matched style alone, right after a buttonText check.
    expect(cta).not.toContain("text.includes(buttonText) ||\n                    html.includes('background:')");
    expect(cta).not.toContain("html.includes(buttonText) ||\n                    html.includes('background:')");
  });

  it('guards buttonText matching against empty string (empty matches everything)', () => {
    // `''.includes('')` is always true → an empty ctaText must not auto-pass.
    expect(cta).toMatch(/buttonText && \(html\.includes\(buttonText\)/);
  });

  it('gates style-based CTA detection behind an anchor (href=)', () => {
    // Every background:/linear-gradient style probe lives inside an href= group now.
    const styleProbeCount = (cta.match(/html\.includes\('background:'\)/g) || []).length;
    const hrefGatedGroups = (cta.match(/html\.includes\('href='\) && \(/g) || []).length;
    expect(styleProbeCount).toBeGreaterThan(0);
    expect(hrefGatedGroups).toBeGreaterThanOrEqual(styleProbeCount - 1); // loop-2 shares one href group
  });
});
