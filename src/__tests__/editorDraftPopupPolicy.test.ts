import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  DRAFT_POPUP_CANCEL_SELECTORS,
  isEditorDraftConflictMessage,
} from '../automation/editorDraftPopupPolicy';

describe('Naver editor draft-conflict recovery policy', () => {
  it.each([
    '작성중인 글이 있습니다.',
    '작성 중인 글이 있습니다.',
    '이어서 작성하시겠어요?',
    '임시저장된 글을 이어서 작성하시겠습니까?',
  ])('recognizes draft conflict copy: %s', (message) => {
    expect(isEditorDraftConflictMessage(message)).toBe(true);
  });

  it('does not confuse ordinary editor copy with a draft conflict', () => {
    expect(isEditorDraftConflictMessage('새 글을 작성합니다.')).toBe(false);
    expect(isEditorDraftConflictMessage('발행되었습니다.')).toBe(false);
  });

  it('covers both production and live-harness cancel selectors', () => {
    expect(DRAFT_POPUP_CANCEL_SELECTORS).toContain('.se-popup-button-cancel');
    expect(DRAFT_POPUP_CANCEL_SELECTORS).toContain('button.se__cancel');
    expect(DRAFT_POPUP_CANCEL_SELECTORS).toContain('.btn_cancel');
  });

  it('wires recovery into both run paths and immediately before title typing', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src', 'naverBlogAutomation.ts'),
      'utf8',
    );
    const runPostOnly = source.slice(
      source.indexOf('async runPostOnly('),
      source.indexOf('async run(runOptions'),
    );
    const inputTitle = source.slice(
      source.indexOf('async inputTitle('),
      source.indexOf('async typePlainContent('),
    );

    expect(runPostOnly).toContain('this.ensureDialogHandler()');
    expect(inputTitle).toContain('await this.closeDraftPopup(');
    expect(source).toContain('page.mainFrame()');
  });

  it('never auto-accepts a native draft-conflict dialog before the fresh-post resolver runs', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src', 'naverBlogAutomation.ts'),
      'utf8',
    );
    const dialogHandler = source.slice(
      source.indexOf('private ensureDialogHandler()'),
      source.indexOf('private async saveCookies()'),
    );

    expect(dialogHandler).toContain('const isDraftConflict = isEditorDraftConflictMessage(message);');
    expect(dialogHandler).toContain('this.pendingDraftConflictDialog = true;');
    expect(dialogHandler).toContain('await dialog.dismiss();');
    expect(dialogHandler).not.toMatch(/isDraftConflict[\s\S]{0,500}dialog\.accept\(\)/);
  });

  it('invalidates ambiguous editor state and checks a fresh draft before writing again', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src', 'naverBlogAutomation.ts'),
      'utf8',
    );
    const runPostOnly = source.slice(
      source.indexOf('async runPostOnly('),
      source.indexOf('async run(runOptions'),
    );
    const run = source.slice(source.indexOf('async run(runOptions'));

    expect(source).toContain('private async assertFreshDraftContext()');
    expect(source).toContain('private invalidateEditorStateAfterAmbiguousPublish()');
    expect(source).toContain('await this.assertFreshDraftContext();');
    expect(runPostOnly).toContain('this.invalidateEditorStateAfterAmbiguousPublish();');
    expect(run).toContain('this.invalidateEditorStateAfterAmbiguousPublish();');
  });
});
