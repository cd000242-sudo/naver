import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { classifyPublishFailure } from '../automation/publishFailureClassifier';

describe('classifyPublishFailure', () => {
  it('treats V3 publish handoff failures as terminal user-action conditions', () => {
    expect(classifyPublishFailure('[content-quality-v3-publish-handoff] missing_handoff')).toEqual({
      code: 'PUBLISH_CONDITION',
      retryable: false,
      userActionRequired: true,
    });

    expect(classifyPublishFailure('[content-quality-v3-publication] untrusted_provenance')).toEqual({
      code: 'PUBLISH_CONDITION',
      retryable: false,
      userActionRequired: true,
    });
  });

  it('classifies browser session crashes as retryable', () => {
    expect(classifyPublishFailure('Protocol error: Target closed')).toEqual({
      code: 'BROWSER_CLOSED',
      retryable: true,
      userActionRequired: false,
    });
  });

  it('does not retry after the post body was already written to the editor', () => {
    expect(classifyPublishFailure('POST_CONTENT_APPLIED: Protocol error: Target closed')).toEqual({
      code: 'PUBLISH_CONDITION',
      retryable: false,
      userActionRequired: true,
    });

    expect(classifyPublishFailure('POST_TAIL_INCOMPLETE: 이전글 엮기 단계에서 브라우저 세션이 종료되었습니다.')).toEqual({
      code: 'PUBLISH_CONDITION',
      retryable: false,
      userActionRequired: true,
    });
  });

  it.each([
    'Protocol error: Target closed',
    'Execution context is not available in detached frame',
    '브라우저 세션이 종료되었습니다',
  ])('keeps explicit image insertion failures terminal despite transport detail: %s', detail => {
    const message = `IMAGE_INSERTION_FAILED:1/3개 이미지 삽입 실패 — ${detail}`;
    for (const input of [message, new Error(message), { message }]) {
      expect(classifyPublishFailure(input)).toEqual({
        code: 'IMAGE_REJECTED', retryable: false, userActionRequired: true,
      });
    }
  });

  it('honors the explicit image insertion error code before browser-close heuristics', () => {
    expect(classifyPublishFailure({ code: 'IMAGE_INSERTION_FAILED', message: 'Protocol error: Target closed' })).toEqual({
      code: 'IMAGE_REJECTED', retryable: false, userActionRequired: true,
    });
  });

  it('stops the production retry loop after the first partial image insertion failure', async () => {
    const source = ts.createSourceFile('automation.ts', readFileSync(new URL('../naverBlogAutomation.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
    let retryMethod: ts.MethodDeclaration | undefined;
    const visit = (node: ts.Node) => {
      if (ts.isMethodDeclaration(node) && node.name.getText(source) === 'retry') retryMethod = node;
      ts.forEachChild(node, visit);
    };
    visit(source);
    if (!retryMethod) throw new Error('Production retry method missing');
    const compiled = ts.transpileModule(`class RetryHarness { ${retryMethod.getText(source)} }`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    const retry = new Function('classifyPublishFailure', 'getPublicationCommitJournal', `${compiled}; return RetryHarness.prototype.retry;`)(
      classifyPublishFailure, () => ({ hasUnconfirmed: () => false }),
    );
    const error = new Error('IMAGE_INSERTION_FAILED:1/3개 이미지 삽입 실패 — Protocol error: Target closed');
    const insert = vi.fn(async () => { throw error; });
    const context = { options: { naverId: 'test_account' }, ensureNotCancelled: vi.fn(), log: vi.fn() };
    await expect(retry.call(context, insert, 3, '이미지 삽입')).rejects.toBe(error);
    expect(insert).toHaveBeenCalledOnce();
  });

  it('classifies localized browser-session and editor-ready failures as retryable', () => {
    expect(classifyPublishFailure('블로그 발행 실패 - 브라우저 세션이 종료되었습니다. 다시 시작해주세요.')).toMatchObject({
      code: 'BROWSER_CLOSED',
      retryable: true,
      userActionRequired: false,
    });

    expect(classifyPublishFailure('콘텐츠 적용 실패: 제목 입력 필드를 찾을 수 없습니다. selector=.se-section-documentTitle')).toMatchObject({
      code: 'EDITOR_NOT_READY',
      retryable: true,
      userActionRequired: false,
    });
  });

  it('keeps detached Naver login frames retryable instead of requiring user login action', () => {
    expect(classifyPublishFailure('Execution context is not available in detached frame or worker https://nid.naver.com/nidlogin.login')).toEqual({
      code: 'BROWSER_CLOSED',
      retryable: true,
      userActionRequired: false,
    });
  });

  it('classifies Naver challenge/login cases as user-action required', () => {
    expect(classifyPublishFailure('Naver login captcha security verification is required')).toMatchObject({
      code: 'LOGIN_CHALLENGE',
      retryable: false,
      userActionRequired: true,
    });

    expect(classifyPublishFailure('네이버 보안 인증 또는 캡차가 필요합니다')).toMatchObject({
      code: 'LOGIN_CHALLENGE',
      userActionRequired: true,
    });
  });

  it('classifies publish condition failures separately from navigation waits', () => {
    expect(classifyPublishFailure('publish condition is insufficient: body requirement or category requirement')).toMatchObject({
      code: 'PUBLISH_CONDITION',
      userActionRequired: true,
    });

    expect(classifyPublishFailure('본문 조건(글자수·카테고리·이미지)이 부족할 수 있습니다')).toMatchObject({
      code: 'PUBLISH_CONDITION',
      userActionRequired: true,
    });

    expect(classifyPublishFailure('publish navigation timeout: url did not change and no post url was confirmed')).toMatchObject({
      code: 'NAVIGATION_TIMEOUT',
      retryable: true,
    });

    expect(classifyPublishFailure('발행이 완료되지 않았습니다. URL이 변경되지 않았습니다')).toMatchObject({
      code: 'NAVIGATION_TIMEOUT',
      retryable: true,
    });
  });

  it('classifies image upload failures before generic publish conditions', () => {
    expect(classifyPublishFailure('image upload failed: image size exceeds the Naver limit')).toMatchObject({
      code: 'IMAGE_REJECTED',
      userActionRequired: true,
    });

    expect(classifyPublishFailure('IMAGE_PROCESSING_FAILED: failed to copy local image file')).toMatchObject({
      code: 'IMAGE_REJECTED',
      userActionRequired: true,
    });

    expect(classifyPublishFailure('이미지 업로드 실패: 이미지 용량이 네이버 제한을 초과했습니다')).toMatchObject({
      code: 'IMAGE_REJECTED',
      userActionRequired: true,
    });
  });

  it('classifies selector drift as unknown UI change', () => {
    expect(classifyPublishFailure('confirm button selector not found: seOnePublishBtn')).toMatchObject({
      code: 'UNKNOWN_UI_CHANGE',
      retryable: true,
    });

    expect(classifyPublishFailure('발행 확인 버튼을 찾을 수 없습니다: seOnePublishBtn')).toMatchObject({
      code: 'UNKNOWN_UI_CHANGE',
      retryable: true,
    });
  });
});
