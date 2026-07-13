import { describe, expect, it } from 'vitest';
import {
  extractNaverBlogPostIdentity,
  formatPublishGuardLog,
  isConcreteNaverBlogPostUrl,
  isNaverEditorUrl,
  resolvePublishedUrlAfterOutcome,
  resolveImmediatePublishOutcome,
} from '../automation/publishOutcomeResolver';

describe('publish outcome URL helpers', () => {
  it('extracts the same identity from path and logNo query URLs', () => {
    expect(extractNaverBlogPostIdentity('https://blog.naver.com/test/223000001')).toEqual({
      blogId: 'test',
      logNo: '223000001',
    });
    expect(extractNaverBlogPostIdentity(
      'https://blog.naver.com/PostView.naver?blogId=test&logNo=223000001',
    )).toEqual({ blogId: 'test', logNo: '223000001' });
  });

  it('detects concrete Naver post URLs', () => {
    expect(isConcreteNaverBlogPostUrl('https://blog.naver.com/test/223000001')).toBe(true);
    expect(isConcreteNaverBlogPostUrl('https://blog.naver.com/PostView.naver?blogId=test&logNo=223000001')).toBe(true);
    expect(isConcreteNaverBlogPostUrl('https://blog.naver.com/test')).toBe(false);
  });

  it('detects editor URLs as non-post URLs', () => {
    expect(isNaverEditorUrl('https://blog.naver.com/PostWriteForm.naver?blogId=test')).toBe(true);
    expect(isNaverEditorUrl('https://blog.naver.com/test?Redirect=Write')).toBe(true);
    expect(isConcreteNaverBlogPostUrl('https://blog.naver.com/PostWriteForm.naver?blogId=test')).toBe(false);
    expect(isConcreteNaverBlogPostUrl('https://blog.naver.com/test?Redirect=Write')).toBe(false);
  });
});

describe('resolveImmediatePublishOutcome', () => {
  it('prefers a concrete post URL when navigation reaches a post', () => {
    expect(resolveImmediatePublishOutcome({
      beforeUrl: 'https://blog.naver.com/PostWriteForm.naver?blogId=test',
      afterUrl: 'https://blog.naver.com/test/223000001',
    })).toEqual({
      success: true,
      url: 'https://blog.naver.com/test/223000001',
      reason: 'CONCRETE_POST_URL',
      needsManualUrlCheck: false,
    });
  });

  it('rejects non-post blog URLs so draft/editor redirects are never shown as publish success', () => {
    expect(resolveImmediatePublishOutcome({
      beforeUrl: 'https://blog.naver.com/PostWriteForm.naver?blogId=test',
      afterUrl: 'https://blog.naver.com/test',
    })).toMatchObject({
      success: false,
      code: 'NAVIGATION_TIMEOUT',
      retryable: true,
    });
  });

  it('rejects success text when no concrete post URL proof exists', () => {
    expect(resolveImmediatePublishOutcome({
      beforeUrl: 'https://blog.naver.com/PostWriteForm.naver?blogId=test',
      afterUrl: 'https://blog.naver.com/PostWriteForm.naver?blogId=test',
      publishStatus: { success: true, successText: 'published' },
    })).toMatchObject({
      success: false,
      code: 'NAVIGATION_TIMEOUT',
      retryable: true,
    });
  });

  it('classifies changed editor URLs as editor readiness failures', () => {
    expect(resolveImmediatePublishOutcome({
      beforeUrl: 'https://blog.naver.com/PostWriteForm.naver?blogId=test',
      afterUrl: 'https://blog.naver.com/PostWriteForm.naver?blogId=test&redirect=1',
    })).toMatchObject({
      success: false,
      code: 'EDITOR_NOT_READY',
      retryable: true,
    });
  });

  it('classifies unchanged editor URLs as editor readiness failures', () => {
    expect(resolveImmediatePublishOutcome({
      beforeUrl: 'https://blog.naver.com/PostWriteForm.naver?blogId=test',
      afterUrl: 'https://blog.naver.com/PostWriteForm.naver?blogId=test',
      finalUrl: 'https://blog.naver.com/PostWriteForm.naver?blogId=test',
    })).toMatchObject({
      success: false,
      code: 'EDITOR_NOT_READY',
      retryable: true,
    });
  });

  it('classifies visible publish errors through the shared failure classifier', () => {
    expect(resolveImmediatePublishOutcome({
      beforeUrl: 'https://blog.naver.com/PostWriteForm.naver?blogId=test',
      afterUrl: 'https://blog.naver.com/PostWriteForm.naver?blogId=test',
      publishStatus: { error: true, errorText: 'publish condition is insufficient' },
    })).toMatchObject({
      success: false,
      code: 'PUBLISH_CONDITION',
      userActionRequired: true,
    });
  });
});

describe('publish outcome state updates', () => {
  it('updates the published URL only when the outcome proves a new URL', () => {
    const outcome = resolveImmediatePublishOutcome({
      beforeUrl: 'https://blog.naver.com/PostWriteForm.naver?blogId=test',
      afterUrl: 'https://blog.naver.com/test/223000001',
    });

    expect(resolvePublishedUrlAfterOutcome(null, outcome)).toBe('https://blog.naver.com/test/223000001');
  });

  it('does not replace the existing URL when success text has no URL proof', () => {
    const outcome = resolveImmediatePublishOutcome({
      beforeUrl: 'https://blog.naver.com/PostWriteForm.naver?blogId=test',
      publishStatus: { success: true, successText: 'published' },
    });

    expect(resolvePublishedUrlAfterOutcome('https://blog.naver.com/test/old', outcome)).toBe(
      'https://blog.naver.com/test/old',
    );
  });

  it('does not format a manual URL confidence log for rejected success text', () => {
    const outcome = resolveImmediatePublishOutcome({
      beforeUrl: 'https://blog.naver.com/PostWriteForm.naver?blogId=test',
      publishStatus: { success: true, successText: 'published' },
    });

    expect(formatPublishGuardLog(outcome, 'https://blog.naver.com/test/old')).toBeNull();
  });
});
