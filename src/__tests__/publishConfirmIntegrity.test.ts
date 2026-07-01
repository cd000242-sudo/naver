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
  const publishHelpers = read('automation/publishHelpers.ts');

  it('A-3: missing publish button throws instead of silently saving a draft', () => {
    expect(code).toMatch(/PUBLISH_BUTTON_NOT_FOUND/);
    expect(code).not.toMatch(/임시저장으로 폴백합니다/);
  });

  it('A-4: success message with unchanged URL re-verifies, then fails loudly', () => {
    expect(code).toMatch(/PUBLISH_UNCONFIRMED/);
    expect(code).not.toMatch(/URL이 여전히 변경되지 않았습니다\. 발행이 완료되었는지 수동으로 확인해주세요/);
  });

  it('A-4: concrete post URL must also load a readable published-post screen', () => {
    expect(code).toContain('waitForPublishedPostPageConfirmation');
    expect(code).toContain('collectPublishedPostPageSnapshot');
    expect(code).toContain('resolvePublishedPostPageConfirmation(snapshot)');
    expect(code).toContain('requiredConsecutiveOk = 2');
    expect(code).toContain('consecutiveOkCount');
    expect(code).toContain('실제 게시글 URL은 확인됐지만 네이버 완료 화면/게시글 본문 로드를 연속 확인하지 못했습니다');
  });

  it('A-4: unconfirmed publishes are never blind-retried (double-publish guard)', () => {
    const terminalBlock = code.slice(code.indexOf('const terminalErrors'), code.indexOf('const frameRecoverableErrors'));
    expect(terminalBlock).toMatch(/PUBLISH_UNCONFIRMED/);
    expect(terminalBlock).toMatch(/PUBLISH_MODAL_NOT_OPENED/);
    expect(terminalBlock).toMatch(/CATEGORY_NOT_FOUND/);
    expect(terminalBlock).toMatch(/POST_TAIL_INCOMPLETE/);
    expect(terminalBlock).not.toMatch(/HASHTAG_TAIL_NOT_READY/);
    expect(terminalBlock).not.toMatch(/HASHTAG_APPLY_VERIFY_FAILED/);
  });

  it('A-2: publish modal open failure stops before category/confirm stages', () => {
    const modalFailureBlock = code.slice(code.indexOf('if (!modalOpened)'), code.indexOf('// ✅ [2026-02-17] 발행 모달 DOM 덤프'));
    expect(modalFailureBlock).toMatch(/PUBLISH_MODAL_NOT_OPENED/);
    expect(modalFailureBlock).toMatch(/throw new Error/);
    expect(code).not.toMatch(/발행 모달 열기 3회 시도 모두 실패[\s\S]{0,200}카테고리 선택 건너뜀 가능'\);\s*\}/);
  });

  it('A-3: fallback publish option step never consumes the final publish button', () => {
    const optionStart = code.indexOf('const immediatePublishOptionSelectors = getImmediatePublishOptionSelectors();');
    expect(optionStart).toBeGreaterThan(-1);
    const optionBlock = code.slice(optionStart, code.indexOf('// 최종 발행 확인 버튼 찾기', optionStart));

    expect(optionBlock).toContain('getImmediatePublishOptionSelectors()');
    expect(optionBlock).toContain('별도 발행 옵션 미발견');
    expect(optionBlock).toContain('즉시발행 옵션 이미 선택됨');
    expect(optionBlock).not.toContain('seOnePublishBtn');
    expect(optionBlock).not.toContain('confirm_btn');
    expect(optionBlock).not.toContain('tpb*i.publish');
  });

  it('A-3: helper module does not keep a second stale immediate-publish implementation', () => {
    expect(publishHelpers).not.toMatch(/export\s+async\s+function\s+publishBlogPost\b/);
    expect(publishHelpers).not.toMatch(/saveButtonSelectors[\s\S]{0,4000}findFirstMatchingSelector/);
  });
});
