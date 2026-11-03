// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { blockLdbAutoDraftDialog, runLdbAutoDraftSave } from '../renderer/modules/ldbAutoDraftSave.js';

const request = { postId: 'ldb_job1', accountId: 'a', categoryId: '2' };

function screen(mode = 'draft') {
  document.body.innerHTML = `<input id="unified-publish-mode" value="${mode}">
    <select id="main-account-selector"><option value="a" selected>a</option><option value="b">b</option></select>
    <select id="real-blog-category-select" data-ldb-account-id="a"><option data-real-blog-category-id="2" selected>카테고리</option></select>`;
}
function deps(overrides: Partial<Parameters<typeof runLdbAutoDraftSave>[1]> = {}) {
  return {
    doc: document,
    isBusy: () => false,
    currentPostId: () => 'ldb_job1',
    publish: vi.fn(async () => ({ success: true, publishMode: 'draft' })),
    lastFailure: () => null,
    ...overrides,
  };
}

describe('LDB auto draft renderer trigger', () => {
  beforeEach(() => screen());

  it('runs the semi-auto draft handler once and reports saved from its result', async () => {
    const options = deps();
    await expect(runLdbAutoDraftSave(request, options)).resolves.toMatchObject({ status: 'saved' });
    expect(options.publish).toHaveBeenCalledOnce();
  });
  it('carries draftConfirmed only when the automation reported it', async () => {
    const confirmed = await runLdbAutoDraftSave(request, deps({ publish: async () => ({ success: true, publishMode: 'draft', draftConfirmed: true }) }));
    expect(confirmed).toMatchObject({ status: 'saved', draftConfirmed: true });
    expect(await runLdbAutoDraftSave(request, deps())).not.toHaveProperty('draftConfirmed');
  });
  it('reports busy without starting when another run is active', async () => {
    const options = deps({ isBusy: () => true });
    await expect(runLdbAutoDraftSave(request, options)).resolves.toMatchObject({ status: 'busy' });
    expect(options.publish).not.toHaveBeenCalled();
  });
  it('fails closed when the publish mode is no longer draft', async () => {
    for (const mode of ['publish', 'schedule', '']) {
      screen(mode);
      const options = deps();
      await expect(runLdbAutoDraftSave(request, options)).resolves.toMatchObject({ status: 'failed' });
      expect(options.publish).not.toHaveBeenCalled();
    }
  });
  it('fails when the account, category or displayed post changed after import', async () => {
    (document.getElementById('main-account-selector') as HTMLSelectElement).value = 'b';
    const changedAccount = deps();
    await expect(runLdbAutoDraftSave(request, changedAccount)).resolves.toMatchObject({ status: 'failed' });
    screen();
    document.getElementById('real-blog-category-select')!.dataset.ldbAccountId = 'b';
    await expect(runLdbAutoDraftSave(request, deps())).resolves.toMatchObject({ status: 'failed' });
    screen();
    const otherPost = deps({ currentPostId: () => 'ldb_other' });
    await expect(runLdbAutoDraftSave(request, otherPost)).resolves.toMatchObject({ status: 'failed' });
    expect(changedAccount.publish).not.toHaveBeenCalled();
    expect(otherPost.publish).not.toHaveBeenCalled();
  });
  it('maps a swallowed account mismatch to ACCOUNT_MISMATCH', async () => {
    const outcome = await runLdbAutoDraftSave(request, deps({ publish: async () => null, lastFailure: () => ({ code: 'ACCOUNT_MISMATCH', message: '[ACCOUNT_MISMATCH] 다른 블로그' }) }));
    expect(outcome).toMatchObject({ status: 'failed', failureCode: 'ACCOUNT_MISMATCH' });
  });
  it('fails on unsuccessful, missing or non-draft results and thrown errors', async () => {
    expect(await runLdbAutoDraftSave(request, deps({ publish: async () => ({ success: false, message: '저장 버튼을 찾을 수 없습니다.' }) })))
      .toMatchObject({ status: 'failed', message: expect.stringContaining('저장 버튼') });
    expect(await runLdbAutoDraftSave(request, deps({ publish: async () => undefined }))).toMatchObject({ status: 'failed' });
    expect(await runLdbAutoDraftSave(request, deps({ publish: async () => ({ success: true, publishMode: 'publish' }) }))).toMatchObject({ status: 'failed' });
    expect(await runLdbAutoDraftSave(request, deps({ publish: async () => { throw new Error('소제목을 찾지 못했습니다'); } })))
      .toMatchObject({ status: 'failed', message: expect.stringContaining('소제목') });
  });
  it('blocks confirm dialogs only during an auto draft run and reports the reason', async () => {
    expect(blockLdbAutoDraftDialog('밖에서는 막지 않음')).toBe(false);
    const outcome = await runLdbAutoDraftSave(request, deps({ publish: async () => {
      expect(blockLdbAutoDraftDialog('법적 위험 문장 확인 필요')).toBe(true);
      return null;
    } }));
    expect(outcome).toMatchObject({ status: 'failed', message: expect.stringContaining('법적 위험') });
    expect(blockLdbAutoDraftDialog('끝난 뒤')).toBe(false);
  });
});

describe('LDB auto draft dialog wiring', () => {
  const read = (file: string) => readFileSync(path.join(process.cwd(), file), 'utf8');
  it('never reaches the image or legal-risk confirm during an auto draft run', () => {
    const handlers = read('src/renderer/modules/publishingHandlers.ts');
    const semiAuto = handlers.slice(handlers.indexOf('export async function handleSemiAutoPublish'));
    expect(semiAuto.indexOf('options.ldbAutoDraft')).toBeGreaterThan(-1);
    expect(semiAuto.indexOf('options.ldbAutoDraft')).toBeLessThan(semiAuto.indexOf('window.confirm('));
    expect(semiAuto).toMatch(/options\.ldbAutoDraft && publishMode !== 'draft'/);
    const renderer = read('src/renderer/renderer.ts');
    const gate = renderer.slice(renderer.indexOf('async function celebrityPublishGate'));
    expect(gate.indexOf('blockLdbAutoDraftDialog(')).toBeGreaterThan(-1);
    expect(gate.indexOf('blockLdbAutoDraftDialog(')).toBeLessThan(gate.indexOf('window.confirm('));
  });
});
