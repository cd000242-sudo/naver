import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * Regression guard for the "stopped keyword gets skipped on restart" bug
 * (2026-06-11 user report).
 *
 * Stop paths mark the in-flight queue item as status='cancelled'
 * (stopContinuousMode + the in-loop user-stop branches), but restart only
 * recovered 'failed' / 'processing' items back to 'pending' — so the keyword
 * the user stopped on was silently skipped and publishing resumed from the
 * NEXT keyword. Restart must restore 'cancelled' items too.
 *
 * Note: "skip next 5" removes items via splice (no 'cancelled' status), so
 * restoring 'cancelled' cannot resurrect intentionally skipped items.
 */
describe('continuous publishing cancelled-item resume', () => {
  it('restores user-cancelled items to pending on restart (alongside failed/processing)', () => {
    const code = read('renderer/modules/continuousPublishing.ts');
    const recoverBlock = code.match(
      /const recoverableItems = continuousQueueV2\.filter\(([\s\S]{0,200}?)\);/
    );
    expect(recoverBlock, 'recoverableItems filter not found').toBeTruthy();
    expect(recoverBlock![1]).toContain("'failed'");
    expect(recoverBlock![1]).toContain("'processing'");
    expect(recoverBlock![1]).toContain("'cancelled'");
  });

  it('still marks the in-flight item as cancelled on stop (stop semantics unchanged)', () => {
    const code = read('renderer/modules/continuousPublishing.ts');
    expect(code).toContain("item.status = 'cancelled'");
  });
});
