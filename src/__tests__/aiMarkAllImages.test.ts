/**
 * Regression tests for the AI-mark-all-images fix.
 *
 * These tests perform static source analysis to guarantee that:
 *   1. The AI mark loop uses component-scoped button lookup (not frame-level only).
 *   2. The loop contains data-img-provider read + collected-provider skip logic.
 *   3. imageHelpers.ts tags inserted images with data-img-provider attribute.
 *
 * No runtime mocking is required — the behaviour is verifiable from source text.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');

function readSrc(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, 'src', relPath), 'utf-8');
}

describe('AI mark all images — source regression', () => {
  const automation = readSrc('naverBlogAutomation.ts');
  const helpers = readSrc('automation/imageHelpers.ts');

  // ── naverBlogAutomation.ts ──────────────────────────────────────────────

  it('AI mark loop uses component-scoped button lookup', () => {
    // Must have imageComponents[i].$('button.se-set-ai-mark-button-toggle')
    expect(automation).toMatch(/imageComponents\[i\]\.\$\(['"]button\.se-set-ai-mark-button-toggle['"]\)/);
  });

  it('AI mark loop does NOT rely solely on frame-level button lookup inside the loop body', () => {
    // Extract the Step 4 block by finding the section header and the next catch block
    const step4Start = automation.indexOf('// Step 4: AI 활용 마크 일괄 활성화');
    expect(step4Start).toBeGreaterThan(-1);

    // Find the closing try-catch for Step 4
    const step4End = automation.indexOf('} catch (aiMarkError)', step4Start);
    expect(step4End).toBeGreaterThan(step4Start);

    const loop = automation.slice(step4Start, step4End);

    // Bare frame.$ call for the AI button must NOT appear without a preceding
    // component-scoped lookup (i.e., it must appear only in the fallback line).
    // The component-scoped call should appear first.
    const componentIdx = loop.indexOf("imageComponents[i].$('button.se-set-ai-mark-button-toggle')");
    const frameFallbackIdx = loop.indexOf("frame.$('button.se-set-ai-mark-button-toggle')");

    expect(componentIdx).toBeGreaterThan(-1); // component-scoped lookup exists
    // frame fallback is allowed, but must come AFTER the component-scoped call
    if (frameFallbackIdx !== -1) {
      expect(frameFallbackIdx).toBeGreaterThan(componentIdx);
    }
  });

  it('AI mark loop reads data-img-provider from image element', () => {
    expect(automation).toMatch(/getAttribute\(['"]data-img-provider['"]\)/);
  });

  it('AI mark loop defines COLLECTED_PROVIDERS array', () => {
    expect(automation).toMatch(/COLLECTED_PROVIDERS\s*=/);
    // Must include at least 'naver' and 'collected' as representative entries
    const step4Start = automation.indexOf('// Step 4: AI 활용 마크 일괄 활성화');
    const step4End = automation.indexOf('} catch (aiMarkError)', step4Start);
    const loop = automation.slice(step4Start, step4End);
    expect(loop).toContain("'naver'");
    expect(loop).toContain("'collected'");
  });

  it('AI mark loop skips collected images via continue', () => {
    const step4Start = automation.indexOf('// Step 4: AI 활용 마크 일괄 활성화');
    const step4End = automation.indexOf('} catch (aiMarkError)', step4Start);
    const loop = automation.slice(step4Start, step4End);
    // The skip branch must log and then continue
    expect(loop).toMatch(/COLLECTED_PROVIDERS\.includes\(imgProvider\)/);
    // A `continue` statement must appear after the collected-provider check
    const skipIdx = loop.indexOf('COLLECTED_PROVIDERS.includes(imgProvider)');
    const continueAfterSkip = loop.indexOf('continue', skipIdx);
    expect(continueAfterSkip).toBeGreaterThan(skipIdx);
  });

  // ── imageHelpers.ts ─────────────────────────────────────────────────────

  it('imageHelpers sets data-img-provider attribute on inserted image', () => {
    // The evaluate call at the alt-setting point must include setAttribute for data-img-provider
    expect(helpers).toMatch(/setAttribute\(['"]data-img-provider['"]/);
  });

  it('imageHelpers passes provider value into the evaluate call', () => {
    // The provider argument must be sourced from image.provider
    expect(helpers).toMatch(/image\.provider/);
    // And the evaluate args must carry it
    expect(helpers).toMatch(/provider.*imgProvider|imgProvider.*provider/);
  });

  it('insertImagesAtCurrentCursor tags inserted image with data-img-provider', () => {
    // Locate the insertImagesAtCurrentCursor function body
    const fnStart = helpers.indexOf('// ── insertImagesAtCurrentCursor ──');
    expect(fnStart).toBeGreaterThan(-1);

    // The function must contain a data-img-provider setAttribute call
    const fnBody = helpers.slice(fnStart);
    expect(fnBody).toMatch(/setAttribute\(['"]data-img-provider['"]/);

    // The tagging must be guarded by image.provider check
    expect(fnBody).toMatch(/if\s*\(\s*image\.provider\s*\)/);
  });
});
