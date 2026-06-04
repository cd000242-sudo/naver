import { describe, expect, it } from 'vitest';
import {
  isConcreteNaverBlogPostUrl,
  isNaverEditorUrl,
  resolveImmediatePublishOutcome,
} from '../automation/publishOutcomeResolver';

describe('publish outcome URL helpers', () => {
  it('detects concrete Naver post URLs', () => {
    expect(isConcreteNaverBlogPostUrl('https://blog.naver.com/test/223000001')).toBe(true);
    expect(isConcreteNaverBlogPostUrl('https://blog.naver.com/PostView.naver?blogId=test&logNo=223000001')).toBe(true);
    expect(isConcreteNaverBlogPostUrl('https://blog.naver.com/test')).toBe(false);
  });

  it('detects editor URLs as non-post URLs', () => {
    expect(isNaverEditorUrl('https://blog.naver.com/PostWriteForm.naver?blogId=test')).toBe(true);
    expect(isConcreteNaverBlogPostUrl('https://blog.naver.com/PostWriteForm.naver?blogId=test')).toBe(false);
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

  it('treats non-editor blog URLs as success that still needs manual URL confidence', () => {
    expect(resolveImmediatePublishOutcome({
      beforeUrl: 'https://blog.naver.com/PostWriteForm.naver?blogId=test',
      afterUrl: 'https://blog.naver.com/test',
    })).toMatchObject({
      success: true,
      url: 'https://blog.naver.com/test',
      reason: 'NON_EDITOR_BLOG_URL',
      needsManualUrlCheck: true,
    });
  });

  it('uses success text as success only when no URL proof exists', () => {
    expect(resolveImmediatePublishOutcome({
      beforeUrl: 'https://blog.naver.com/PostWriteForm.naver?blogId=test',
      afterUrl: 'https://blog.naver.com/PostWriteForm.naver?blogId=test',
      publishStatus: { success: true, successText: 'published' },
    })).toMatchObject({
      success: true,
      reason: 'SUCCESS_MESSAGE',
      needsManualUrlCheck: true,
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
