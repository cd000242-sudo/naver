import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'main.ts'), 'utf8');
const blogExecutor = fs.readFileSync(path.join(root, 'main', 'services', 'BlogExecutor.ts'), 'utf8');
const fullAutoFlow = fs.readFileSync(path.join(root, 'renderer', 'modules', 'fullAutoFlow.ts'), 'utf8');
const postManager = fs.readFileSync(path.join(root, 'renderer', 'modules', 'postManager.ts'), 'utf8');
const postListUi = fs.readFileSync(path.join(root, 'renderer', 'modules', 'postListUI.ts'), 'utf8');
const publishingHandlers = fs.readFileSync(path.join(root, 'renderer', 'modules', 'publishingHandlers.ts'), 'utf8');

function between(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe('Content Quality V3 publish handoff production wiring', () => {
  it('issues a bounded main-side handoff with the generation response', () => {
    const generation = between(
      main,
      "'automation:generateStructuredContent'",
      'registerConfigHandlers({',
    );
    expect(generation).toMatch(/forkContentQualityV3PublicationTicket\(\s*contentQualityV3PublicationTicket,?\s*\)/);
    expect(generation).toMatch(/await contentQualityV3PublishHandoffStore\.issue\(/);
    expect(generation).toMatch(/CONTENT_QUALITY_V3_POST_ID_FIELD/);
    expect(generation).toMatch(/CONTENT_QUALITY_V3_PUBLISH_HANDOFF_FIELD/);
    expect(main).toMatch(/app\.getPath\('userData'\)[\s\S]*configureProvenanceRegistry\(/);
  });

  it('configures fail-closed provenance before containing startup recovery errors', () => {
    const startup = between(
      main,
      'const contentQualityV3ProvenanceRegistry = new ContentQualityV3DurableProvenanceRegistry',
      'showSplash();',
    );
    const configureIndex = startup.indexOf('configureProvenanceRegistry(');
    const beginSessionIndex = startup.indexOf('await contentQualityV3ProvenanceRegistry.beginSession()');
    expect(configureIndex).toBeGreaterThanOrEqual(0);
    expect(beginSessionIndex).toBeGreaterThan(configureIndex);
    expect(startup).toMatch(
      /try\s*{\s*await contentQualityV3ProvenanceRegistry\.beginSession\(\);\s*}\s*catch\s*\([^)]*\)\s*{/,
    );
  });

  it('copies only the opaque descriptor into runAutomation', () => {
    const publish = between(
      fullAutoFlow,
      'async function executeBlogPublishing(',
      "apiClient.call('runAutomation', [payload]",
    );
    expect(publish).toMatch(/_contentQualityV3PostId/);
    expect(publish).toMatch(/_contentQualityV3PublishHandoff/);
    expect(publish).not.toMatch(/factualEvidence|businessEvidence|affiliateEvidence|rawText/);
  });

  it('stops V3 handoff failures before renderer publish recovery retries', () => {
    const publish = between(
      fullAutoFlow,
      'async function executeBlogPublishing(',
      'function hydrateNarrativeImageMetadata(',
    );
    const terminalIndex = publish.indexOf('isContentQualityV3TerminalError(errorMsg)');
    const detachedRetryIndex = publish.indexOf('retryRunAutomationAfterDetachedLoginFrame(');
    const recoveryRetryIndex = publish.indexOf('retryRunAutomationAfterRecoverablePublishFailure(');
    expect(fullAutoFlow).toMatch(
      /content-quality-v3-\(\?:publication\|publish-handoff\|durable-provenance\)/,
    );
    expect(terminalIndex).toBeGreaterThanOrEqual(0);
    expect(detachedRetryIndex).toBeGreaterThan(terminalIndex);
    expect(recoveryRetryIndex).toBeGreaterThan(terminalIndex);
  });

  it('binds renderer IPC to a main-derived owner, previews before browser work, and consumes at commit', () => {
    const automation = between(
      main,
      "ipcMain.handle('automation:run'",
      "ipcMain.handle('automation:cancel'",
    );
    expect(automation).toMatch(/createContentQualityV3RendererOwnerKey\(_event\)/);
    expect(automation).toMatch(/_contentQualityV3PublishOwnerKey/);

    const previewIndex = blogExecutor.indexOf('enforceContentQualityV3PublishPayload(');
    const previewConsumeIndex = blogExecutor.indexOf('{ consume: false }', previewIndex);
    const policyIndex = blogExecutor.indexOf('prepareContentPolicyForPublish(effectivePayload');
    const finalPreviewIndex = blogExecutor.indexOf(
      'enforceContentQualityV3PublishPayload(',
      previewIndex + 1,
    );
    const finalPreviewConsumeIndex = blogExecutor.indexOf('{ consume: false }', finalPreviewIndex);
    const appSchedulePersistenceIndex = blogExecutor.indexOf(
      "effectivePayload.scheduleType === 'app-schedule'",
      finalPreviewIndex,
    );
    const strictTextOnlyIndex = blogExecutor.indexOf(
      'assertMainProcessEditorCommitTextOnly(',
      finalPreviewIndex,
    );
    const browserIndex = blogExecutor.indexOf('getOrCreateBrowserSession(account)', finalPreviewIndex);
    const imageProcessingIndex = blogExecutor.indexOf(
      'await processImages(effectivePayload)',
      browserIndex,
    );
    const executeIndex = blogExecutor.indexOf('const result = await executePublishing(', browserIndex);
    const commitConsumeIndex = blogExecutor.indexOf(
      'enforceContentQualityV3EditorCommit(',
      executeIndex,
    );
    expect(previewIndex).toBeGreaterThanOrEqual(0);
    expect(previewConsumeIndex).toBeGreaterThan(previewIndex);
    expect(policyIndex).toBeGreaterThan(previewConsumeIndex);
    expect(finalPreviewIndex).toBeGreaterThan(policyIndex);
    expect(finalPreviewConsumeIndex).toBeGreaterThan(finalPreviewIndex);
    expect(strictTextOnlyIndex).toBeGreaterThan(finalPreviewConsumeIndex);
    expect(appSchedulePersistenceIndex).toBeGreaterThan(strictTextOnlyIndex);
    expect(browserIndex).toBeGreaterThan(appSchedulePersistenceIndex);
    expect(imageProcessingIndex).toBeGreaterThan(browserIndex);
    expect(strictTextOnlyIndex).toBeLessThan(imageProcessingIndex);
    expect(executeIndex).toBeGreaterThan(browserIndex);
    expect(commitConsumeIndex).toBeGreaterThan(executeIndex);
    expect(blogExecutor.slice(executeIndex, commitConsumeIndex + 400))
      .not.toContain('{ consume: true }');

    const publishing = between(
      blogExecutor,
      'export async function executePublishing(',
      'export async function cleanup(',
    );
    const attachIndex = publishing.indexOf('attachMainProcessBeforePublishCommit(');
    const runIndex = publishing.indexOf('automation.run(runOptions)');
    expect(attachIndex).toBeGreaterThanOrEqual(0);
    expect(runIndex).toBeGreaterThan(attachIndex);
    expect(publishing).toContain('skipImages: payload.skipImages');
    expect(blogExecutor).toMatch(
      /requiredMarker\s*&&\s*effectivePayload\.publishMode\s*!==\s*'draft'/,
    );
  });

  it('creates one account-specific handoff per generated multi-account post', () => {
    const multi = between(
      main,
      "ipcMain.handle('multiAccount:publish'",
      "'automation:generateStructuredContent'",
    );
    expect(multi).toMatch(/multiAccountHandoffRunId/);
    expect(multi).toMatch(/contentQualityV3PublishHandoffStore\.issue\([\s\S]*?accountId/);
  });

  it('releases main-internal scheduler and account owner state on every exit path', () => {
    const smartScheduler = between(
      main,
      'smartScheduler.setPublishCallback',
      'let _keywordAnalyzer',
    );
    expect(smartScheduler).toMatch(/let smartSchedulerPublishOwnerKey = ''/);
    expect(smartScheduler).toMatch(
      /finally \{[\s\S]*await contentQualityV3PublishHandoffStore\.releaseOwner\(smartSchedulerPublishOwnerKey\)/,
    );

    const multi = between(
      main,
      "ipcMain.handle('multiAccount:publish'",
      "ipcMain.handle('multiAccount:cancel'",
    );
    expect(multi).toMatch(
      /finally \{[\s\S]*await contentQualityV3PublishHandoffStore\.releaseOwner\(contentQualityV3PublishOwnerKey\)/,
    );
  });

  it('preserves only the bounded durable V3 handoff through both saved-post and semi-auto paths', () => {
    expect(postManager.match(/snapshotContentQualityV3PersistenceFields\(/g)).toHaveLength(4);
    expect(postListUi).toMatch(/reconstructGeneratedPostStructuredContent/);
    expect(publishingHandlers).toMatch(/const updatedStructuredContent = \{[\s\S]*\.\.\.structuredContent/);
    expect(fullAutoFlow).toMatch(
      /_contentQualityV3PostId:\s*structuredContent\?\._contentQualityV3PostId/,
    );
    expect(fullAutoFlow).toMatch(
      /_contentQualityV3Required:\s*structuredContent\?\._contentQualityV3Required/,
    );
    expect(postManager).not.toMatch(/rawText|factualEvidence|businessEvidence|affiliateEvidence/);
    expect(postManager).not.toMatch(/from ['"]\.\.\/\.\.\/contentQualityV3\/publishHandoffStore/);
    expect(postManager).not.toMatch(/from ['"]node:/);
    expect(postListUi).not.toMatch(/from ['"]node:/);
    expect(publishingHandlers).not.toMatch(/from ['"]node:/);
    expect(fullAutoFlow).not.toMatch(/from ['"]node:/);
  });
});
