import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import {
  recordSilentFailure,
  getSilentFailureCounts,
  formatSilentFailureSummary,
  resetSilentFailureCounts,
} from '../automation/silentFailureCounter';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

// SPEC-STABILITY-2026 R12 — 허용된 침묵 실패의 빈도 계측.
// 동작은 바꾸지 않고 "얼마나 자주" 허용되는지를 드러낸다 (셀렉터 부패 조기 신호).
describe('silent failure counter (R12)', () => {
  beforeEach(() => resetSilentFailureCounts());

  it('counts per site and formats a frequency-sorted summary', () => {
    recordSilentFailure('image:resize');
    recordSilentFailure('image:resize');
    recordSilentFailure('editor:quotation-style');
    expect(getSilentFailureCounts()).toEqual({ 'image:resize': 2, 'editor:quotation-style': 1 });
    expect(formatSilentFailureSummary()).toContain('image:resize×2');
    expect(formatSilentFailureSummary()).toContain('editor:quotation-style×1');
  });

  it('returns null when nothing fired (no log noise)', () => {
    expect(formatSilentFailureSummary()).toBeNull();
  });

  it('is wired into tolerated-failure sites and the publish-entry summary', () => {
    expect(read('automation/publishHelpers.ts')).toMatch(/recordSilentFailure\('publish:/);
    expect(read('automation/imageHelpers.ts')).toMatch(/recordSilentFailure\('image:/);
    expect(read('automation/editorHelpers.ts')).toMatch(/recordSilentFailure\('editor:/);
    const nba = read('naverBlogAutomation.ts');
    expect(nba).toMatch(/formatSilentFailureSummary\(\)/);
    expect(nba).toMatch(/resetSilentFailureCounts\(\)/);
  });
});
