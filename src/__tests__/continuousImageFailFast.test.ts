import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * "이미지 수집만 무한, 발행 0" 증상 가드.
 * Root cause: per-heading retry waits of up to 45s × 3 attempts × N headings
 * plus a 45-minute batch ceiling — a dead provider made continuous runs grind
 * for tens of minutes per post, silently skipping every post in the queue.
 */
describe('continuous publishing image fail-fast', () => {
  it('caps image retry waits so a dead provider cannot stall minutes per heading', () => {
    const code = read('renderer/modules/multiAccountManager.ts');
    expect(code).toContain('isUiAutomationImageProvider ? 15000 : 10000');
    expect(code).not.toContain('isUiAutomationImageProvider ? 45000 : 20000');
  });

  it('caps the non-flow batch timeout at 15 minutes', () => {
    const code = read('renderer/modules/multiAccountManager.ts');
    expect(code).toContain('Math.min(15 * 60 * 1000, Math.max(5 * 60 * 1000, 60000');
  });

  it('reports the final failure reason to the user before throwing', () => {
    const code = read('renderer/modules/multiAccountManager.ts');
    // End anchor: the success summary line — `if (sequentialImages.length > 0)`
    // appears earlier inside dead timeout code and would empty the slice.
    const block = code.slice(code.indexOf('if (!itemSucceeded)'), code.indexOf('🎉 총 '));
    expect(block.indexOf('onProgress')).toBeGreaterThan(-1);
    expect(block.indexOf('onProgress')).toBeLessThan(block.indexOf('throw new Error'));
  });

  it('stops a continuous run after two consecutive image-stage failures', () => {
    const code = read('renderer/modules/continuousPublishing.ts');
    expect(code).toContain('__continuousImgFailStreak');
    expect(code).toContain('stopFullAutoPublish = true');
    expect(code).toContain('__continuousImgFailStreak = 0');
  });

  it('honors pre-collected images even when the sub-image mode key drifted', () => {
    const code = read('renderer/modules/continuousPublishing.ts');
    expect(code).toContain('hasPreCollectedImages');
  });
});
