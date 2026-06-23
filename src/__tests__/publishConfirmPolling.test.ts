import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * Guard for publish-confirmation robustness (2026-06-23).
 *
 * Live diagnosis (suma0404, v2.11.61): after the confirm publish button
 * (seOnePublishBtn) was found AND clicked, the post ACTUALLY published (the page
 * navigated to the published-post screen — 공감/reaction buttons visible), but the
 * single-shot success check (click + ~3s) ran before the slow-PC navigation finished
 * and a hidden CDATA/script "오류/실패" text matched the all-elements error scan →
 * false failure → inner retry loop re-applied the body (3489→5311 chars, hashtags
 * doubled) → eventually crashed (detached frame).
 *
 * Fix: replace the single-shot URL/error check with a long success POLL:
 *  - poll the top URL for the blog-post pattern (Playwright-verified: the editor
 *    navigates to blog.naver.com/{id}/{postNo} which matches the regex), and
 *  - scan top + iframe(mainFrame) DOM for published-post signals (.area_sympathy /
 *    u_likeit — Playwright-verified to live inside mainFrame), and
 *  - on timeout, throw PUBLISH_UNCONFIRMED (no-auto-retry) so retries never double the body.
 */
describe('publish confirm polling', () => {
  const automation = read('naverBlogAutomation.ts');

  it('polls for publish completion instead of a single-shot check', () => {
    expect(automation).toContain('PUBLISH_CONFIRM_POLL_MS');
    expect(automation).toMatch(/const deadline = Date\.now\(\) \+ PUBLISH_CONFIRM_POLL_MS/);
  });

  it('detects the published-post URL pattern as success', () => {
    expect(automation).toMatch(/blog\\\.naver\\\.com\\\/\[\^\/\?#\]\+\\\/\\d\+/);
  });

  it('scans iframe (mainFrame) documents for the reaction/sympathy signal', () => {
    expect(automation).toContain("querySelectorAll('iframe')");
    expect(automation).toContain('.area_sympathy');
    expect(automation).toContain('a[class*="u_likeit"]');
  });

  it('no longer flags hidden error text via an all-elements scan', () => {
    // the old false-positive: scanning every element for 오류/실패/에러 then throwing 발행 실패
    expect(automation).not.toContain("throw new Error(`발행 실패: ${publishStatus.errorText}`)");
  });

  it('throws a no-auto-retry code on unconfirmed publish (prevents body duplication)', () => {
    expect(automation).toContain('PUBLISH_UNCONFIRMED:발행 버튼을 눌렀지만');
  });
});
