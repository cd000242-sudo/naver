import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = process.cwd();
const read = (relativePath: string): string => readFileSync(join(root, relativePath), 'utf8');

describe('automation login and image pipeline contracts', () => {
  it('exposes the image matching IPC used by renderer publishing flows', () => {
    const preload = read('src/preload.ts');
    const globalTypes = read('src/renderer/global.d.ts');

    expect(preload).toContain('matchImages:');
    expect(preload).toContain("ipcRenderer.invoke('automation:matchImages', payload)");
    expect(globalTypes).toContain('matchImages: (payload:');
  });

  it('places collected originals directly in multi-account flow without AI matching', () => {
    const source = read('src/renderer/modules/multiAccountManager.ts');

    expect(source).toContain('createShoppingCollectedPublishImages({');
    expect(source).toContain('AI 이미지 호출 없음');
    expect(source).not.toContain("const shouldMatchCollected = scSubImageModePre === 'collected';");
  });

  it('does not hammer Gemini prompt translation after a 429 response', () => {
    const source = read('src/renderer/modules/promptTranslation.ts');

    expect(source).toContain('geminiPromptCooldownUntil');
    expect(source).toContain('response.status === 429');
    expect(source).toContain('falling back to next prompt engine');
  });

  it('only hard-fails empty image management lists when that source was explicitly selected', () => {
    const source = read('src/renderer/modules/fullAutoFlow.ts');

    expect(source).toContain("formData.imageSource === 'image-management'");
    expect(source).toContain("formData.imageSource === 'saved'");
    expect(source).toContain("formData.imageSource === 'local-folder'");
  });

  it('recognizes current Naver writer URL variants after manual login', () => {
    const source = read('src/naverBlogAutomation.ts');
    const navigationPolicy = read('src/automation/editorNavigationUrlPolicy.ts');
    const loginStatusPolicy = read('src/automation/loginStatusUrlPolicy.ts');
    const loginPageNavigationPolicy = read('src/automation/loginPageNavigationPolicy.ts');
    const urlState = read('src/automation/editorUrlState.ts');
    const manualLoginPolicy = read('src/automation/manualLoginRecoveryPolicy.ts');
    const pipelineLogPolicy = read('src/automation/publishPipelineLogPolicy.ts');

    expect(source).toContain('classifyLoginStatusUrl(currentUrl)');
    expect(loginStatusPolicy).toContain("includes('blog.naver.com')");
    expect(loginStatusPolicy).toContain("includes('naver.com')");
    expect(loginPageNavigationPolicy).toContain('resolveLoginPageNavigationUrl');
    expect(loginPageNavigationPolicy).toContain('classifyLoginGotoError');
    expect(loginPageNavigationPolicy).toContain('isLoginProxyFailureBody');
    expect(loginPageNavigationPolicy).toContain('resolvePostLoginProgressUrl');
    expect(loginPageNavigationPolicy).toContain('isPostLoginFinalCheckSuccess');
    expect(loginPageNavigationPolicy).toContain('isLoginChallengeUrl');
    expect(loginPageNavigationPolicy).toContain('shouldInspectLoginPageDom');
    expect(loginPageNavigationPolicy).toContain('shouldReportFinalLoginUrlFailure');
    expect(loginPageNavigationPolicy).toContain('shouldNavigateToLoginPageFromCurrentUrl');
    expect(loginPageNavigationPolicy).toContain('shouldVerifyExistingSessionAfterMissingLoginInput');
    expect(source).toContain('resolveLoginPageNavigationUrl(loadedUrl)');
    expect(source).toContain('classifyLoginGotoError(errorMsg)');
    expect(source).toContain('isLoginProxyFailureBody(failBodySnippet)');
    expect(source).toContain('resolvePostLoginProgressUrl(currentUrl, loginUrl)');
    expect(source).toContain('isPostLoginFinalCheckSuccess(finalCheckUrl)');
    expect(source).toContain('isLoginChallengeUrl(currentUrl)');
    expect(source).toContain('shouldInspectLoginPageDom(currentUrl)');
    expect(source).toContain('shouldReportFinalLoginUrlFailure(finalUrl)');
    expect(source).toContain('shouldNavigateToLoginPageFromCurrentUrl(currentUrl)');
    expect(source).toContain('shouldVerifyExistingSessionAfterMissingLoginInput(diagUrl)');
    expect(source).toContain('resolveBlogWriteFrameSwitchSurface(currentUrl)');
    expect(source).toContain('classifyBlogWriteNavigationUrl(finalUrl)');
    expect(source).toContain('classifyBlogWriteNavigationUrl(retryUrl)');
    expect(navigationPolicy).toContain('isNaverWriteEditorUrl(value)');
    expect(navigationPolicy).toContain('isNaverBlogDomainUrl(value)');
    expect(navigationPolicy).toContain('isNaverLoginUrl(value)');
    expect(navigationPolicy).toContain('shouldSkipBlogWriteWarmup');
    expect(source).toContain('shouldSkipBlogWriteWarmup(currentUrl)');
    expect(navigationPolicy).toContain('isBlogWriteLoginRedirect');
    expect(source).toContain('isBlogWriteLoginRedirect(currentUrl)');
    expect(navigationPolicy).toContain('resolveBlogWriteFrameSwitchSurface');
    expect(navigationPolicy).toContain('resolveManualLoginRetryWriteNavigation');
    expect(source).toContain('resolveManualLoginRetryWriteNavigation(retryUrl, retryHasEditorFrame)');
    expect(manualLoginPolicy).toContain('isManualLoginBlogLandingSuccessful');
    expect(source).toContain('isManualLoginBlogLandingSuccessful(newUrl)');
    expect(source).toContain('resolveManualLoginCheckpoint({');
    expect(manualLoginPolicy).toContain('needsWriteEditorNavigationAfterManualLogin(currentUrl)');
    expect(urlState).toContain('PostWriteForm');
    expect(urlState).toContain('[?&]Redirect=Write');
    expect(source).toContain('PUBLISH_PIPELINE_LOG_MESSAGES.loginStart');
    expect(source).toContain('PUBLISH_PIPELINE_LOG_MESSAGES.editorFrameReady');
    expect(pipelineLogPolicy).toContain('[Pipeline] login step start');
    expect(pipelineLogPolicy).toContain('[Pipeline] editor frame ready');
  });
});
