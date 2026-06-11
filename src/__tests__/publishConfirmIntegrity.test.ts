import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function read(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
}

/**
 * SPEC-STABILITY-2026 R11 (A-3/A-4): publish-confirmation integrity.
 *
 * A-3: when the publish-confirm button is missing, the code silently switched
 * the user's PUBLISH into a DRAFT SAVE — perceived as a lost publish.
 * A-4: a success message with an UNCHANGED url was logged ("수동으로 확인")
 * and execution continued as success with an EMPTY publishedUrl — chaining
 * and tracking then ran on a blank URL. An unconfirmed publish must fail
 * loudly AND must not be blind-retried (double-publish risk).
 */
describe('publish confirmation integrity (R11)', () => {
  const code = read('naverBlogAutomation.ts');

  it('A-3: missing publish button throws instead of silently saving a draft', () => {
    expect(code).toMatch(/PUBLISH_BUTTON_NOT_FOUND/);
    expect(code).not.toMatch(/임시저장으로 폴백합니다/);
  });

  it('A-4: success message with unchanged URL re-verifies, then fails loudly', () => {
    expect(code).toMatch(/PUBLISH_UNCONFIRMED/);
    expect(code).not.toMatch(/URL이 여전히 변경되지 않았습니다\. 발행이 완료되었는지 수동으로 확인해주세요/);
  });

  it('A-4: unconfirmed publishes are never blind-retried (double-publish guard)', () => {
    const fatalBlock = code.slice(code.indexOf('const fatalErrors'), code.indexOf('isFatalError'));
    expect(fatalBlock).toMatch(/PUBLISH_UNCONFIRMED/);
    expect(fatalBlock).toMatch(/CATEGORY_NOT_FOUND/);
  });
});
