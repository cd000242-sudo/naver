import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

describe('full-auto publish completion guard', () => {
  const publishingHandlers = readFileSync('src/renderer/modules/publishingHandlers.ts', 'utf8');
  const fullAutoFlow = readFileSync('src/renderer/modules/fullAutoFlow.ts', 'utf8');
  const naverBlogAutomation = readFileSync('src/naverBlogAutomation.ts', 'utf8');
  const mainProcess = readFileSync('src/main.ts', 'utf8');
  const blogExecutor = readFileSync('src/main/services/BlogExecutor.ts', 'utf8');

  it('does not show the full-auto completion modal when unified automation returned no success result', () => {
    expect(publishingHandlers).toContain('function isConcreteNaverPostUrlLike');
    expect(publishingHandlers).toContain('function assertFullAutoAutomationResult');
    expect(publishingHandlers).toContain('const automationResult = await executeUnifiedAutomation(formData);');
    expect(publishingHandlers).toContain('assertFullAutoAutomationResult(automationResult, formData);');
    expect(publishingHandlers.indexOf('assertFullAutoAutomationResult(automationResult, formData);'))
      .toBeLessThan(publishingHandlers.indexOf("modal.showSuccess('🎉 발행 완료!'"));
  });

  it('validates the main automation result before marking the blog publish step complete', () => {
    expect(fullAutoFlow).toContain('function isConcreteNaverPostUrlLikeForFullAuto');
    expect(fullAutoFlow).toContain('function assertAutomationPublishResult');
    expect(fullAutoFlow).toContain('assertAutomationPublishResult(automationResult, payload);');
    expect(fullAutoFlow.indexOf('assertAutomationPublishResult(automationResult, payload);'))
      .toBeLessThan(fullAutoFlow.indexOf("window._lastPublishOutcome = 'success';"));
  });

  it('requires a concrete Naver post URL before backend automation can report immediate publish success', () => {
    expect(naverBlogAutomation).toContain('isConcreteNaverBlogPostUrl');
    expect(naverBlogAutomation).toContain('!isConcreteNaverBlogPostUrl(this.publishedUrl)');
    expect(naverBlogAutomation).toContain('작성중/임시저장/블로그홈 상태를 발행 완료로 처리하지 않습니다');
  });

  it('guards main-process and executor success responses with the same concrete post URL check', () => {
    expect(mainProcess).toContain('function assertImmediatePublishResultUrl');
    expect(mainProcess).toContain('assertImmediatePublishResultUrl(result, payload);');
    expect(blogExecutor).toContain('function assertImmediatePublishResultUrl');
    expect(blogExecutor).toContain('assertImmediatePublishResultUrl(result, payload);');
  });
});
