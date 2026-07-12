import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * Flow generation watchdog + identity-based detection
 * (2026-06-11 live diagnosis, flow-debug 09:32 session):
 *
 * 1. Flow's redesigned UI shows a "문제가 발생했습니다 + 다시 시도" error card
 *    on server-side generation failure. The app waited blindly for images and
 *    hit a 180s timeout — manual users just click retry and it works.
 * 2. A late CDN response from the PREVIOUS generation resolved the network
 *    race in 2 seconds and returned the previous heading's image (mix-up).
 *    Detection must key on media UUIDs unseen at wait start, not counts.
 */
describe('flow generation detection guards', () => {
  const code = read('image/flowGenerator.ts');

  it('auto-clicks the Flow retry card and fails fast after bounded retries', () => {
    expect(code).toMatch(/문제가 발생했습니다/);
    expect(code).toMatch(/다시 시도/);
    expect(code).toMatch(/FLOW_GENERATION_ERROR/);
  });

  it('detects new images by media UUID unseen at wait start (no count-only detection)', () => {
    expect(code).toMatch(/extractFlowImageId/);
    expect(code).toMatch(/getMediaUrlRedirect\\\?name=/);
    // network race must filter against the known-id baseline
    expect(code).toMatch(/knownIds/);
    expect(code).not.toContain('id === null || !knownIds.includes(id)');
    expect(code).toMatch(/zero_states/);
    expect(code).toMatch(/landing_page/);
  });

  it('never attaches an uncorrelated late result and quarantines unresolved work', () => {
    expect(code).not.toMatch(/waitForLateFlowResult/);
    expect(code).not.toMatch(/FLOW_LATE_RESULT_GRACE_MS/);
    expect(code).toMatch(/const page = await recreateFlowContext\(\)/);
    expect(code).toMatch(/await resetFlowState\(\)/);
    expect(code).toMatch(/const PIPELINE_ENABLED = false/);
    expect(code).toMatch(/FLOW_QUOTA_EXCEEDED/);
  });

  it('isolates every sequential prompt before submit and has no concurrent opt-in bypass', () => {
    const start = code.indexOf('export async function generateSingleImageWithFlow');
    const end = code.indexOf('// v2.6.7 — 중복 가드 상수', start);
    const single = code.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(single.indexOf('const page = await recreateFlowContext()')).toBeGreaterThanOrEqual(0);
    expect(single.indexOf('const page = await recreateFlowContext()')).toBeLessThan(single.indexOf('await submitPromptOnly(page, prompt)'));
    expect(code).not.toContain('FLOW_PIPELINE_ENABLED');
    expect(code).toContain('const PIPELINE_ENABLED = false');
  });
});
