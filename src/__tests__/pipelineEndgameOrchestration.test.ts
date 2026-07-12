import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readSource(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

function extractFunction(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex, `${start} not found`).toBeGreaterThanOrEqual(0);
  expect(endIndex, `${end} not found`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe('top-level pipeline ownership', () => {
  const renderer = readSource('renderer/renderer.ts');
  const unifiedBlock = extractFunction(
    renderer,
    'async function executeUnifiedAutomation',
    'const yieldToUI',
  );

  it('acquires one shared run lease and always releases it', () => {
    expect(renderer).toContain('tryAcquirePipelineRun');
    expect(unifiedBlock).toContain("tryAcquirePipelineRun('unified')");
    expect(unifiedBlock).toContain('finally');
    expect(unifiedBlock).toContain('releasePipelineRun(runLease)');
  });

  it('restores the initiating button synchronously without a stale timer', () => {
    expect(unifiedBlock).not.toMatch(/setTimeout\([\s\S]{0,350}startBtn\.disabled\s*=\s*false/);
    expect(unifiedBlock).toContain('startBtn.disabled = originalButtonState.disabled');
  });

  it('routes the legacy direct automation button through the same lease', () => {
    const legacyBlock = extractFunction(
      renderer,
      '  async function runAutomation',
      '  async function cancelAutomation',
    );
    expect(legacyBlock).toContain("tryAcquirePipelineRun('legacy')");
    expect(legacyBlock).toContain('releasePipelineRun(runLease)');
  });
});

describe('continuous publishing stop and config invariants', () => {
  const source = readSource('renderer/modules/continuousPublishing.ts');

  it('drains or quarantines an in-flight operation instead of abandoning it', () => {
    const stopBlock = extractFunction(source, 'function withStopCheck', 'function cancellableSleep');
    expect(stopBlock).toContain('cancelAutomation');
    expect(stopBlock).toContain('abortImageGeneration');
    expect(stopBlock).toContain('_continuousDrainPromise');
    expect(source).toMatch(/startContinuousPublishingV2[\s\S]{0,700}_continuousDrainPromise/);
    expect(source).toContain("'uncertain'");
    expect(source).toContain('operationPending');
    expect(source).toContain("item.status === 'uncertain' ? '결과 확인 필요'");
    const recoverFilter = source.match(/const recoverableItems = continuousQueueV2\.filter\(([\s\S]{0,220}?)\);/);
    expect(recoverFilter).toBeTruthy();
    expect(recoverFilter![1]).not.toContain("'uncertain'");
  });

  it('passes one image config snapshot through the full-auto handoff', () => {
    expect(source).toMatch(
      /const skipImages =[\s\S]{0,220}itemPipelineCfg\.image\.headingImageMode\s*===\s*'none'/,
    );
    const handoff = source.slice(source.indexOf('const formData = {', source.indexOf('const skipImages =')));
    expect(handoff).toContain('headingImageMode: itemPipelineCfg.image.headingImageMode');
    expect(handoff).toContain('imageStyle: itemPipelineCfg.image.imageStyle');
    expect(handoff).toContain('imageRatio: itemPipelineCfg.image.imageRatio');
    expect(handoff).toContain('thumbnailImageRatio: itemPipelineCfg.image.thumbnailImageRatio');
    expect(handoff).toContain('subheadingImageRatio: itemPipelineCfg.image.subheadingImageRatio');
  });
});

describe('multi-account replay protection', () => {
  const source = readSource('renderer/modules/multiAccountManager.ts');

  it('scopes image single-flight by account/job as well as title', () => {
    expect(source).toContain('options.flightScope');
    expect(source).toMatch(/flightKey\s*=\s*\[[\s\S]{0,180}postTitle/);
    expect(source).toContain('flightScope: queueItem.accountId || queueItem.id');
  });

  it('uses newly edited schedule controls instead of retaining old values', () => {
    expect(source).toContain('publishMode: publishMode');
    expect(source).toContain('scheduleDate: scheduleDate');
    expect(source).toContain('scheduleTime: scheduleTime');
    expect(source).not.toContain('publishMode: existingItem?.publishMode || publishMode');
  });

  it('never automatically replays completed or indeterminate publish items', () => {
    expect(source).toMatch(/queueSnapshot\s*=\s*publishQueue\.filter\([\s\S]{0,240}completed[\s\S]{0,240}uncertain/);
    expect(source).toContain("queueItem.pipelineStatus = 'completed'");
    expect(source).toContain('if (publishStarted)');
    expect(source).toContain("resolveInterruptedPublishStatus(true, 'failed')");
    expect(source).toMatch(/publishQueue\s*=\s*publishQueue\.filter\([\s\S]{0,180}completed/);
  });
});
