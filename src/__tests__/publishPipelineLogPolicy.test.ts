import { describe, expect, it } from 'vitest';
import {
  PUBLISH_PIPELINE_LOG_MESSAGES,
  formatElapsedPipelineLog,
  formatPipelineUrlLog,
} from '../automation/publishPipelineLogPolicy';

describe('publishPipelineLogPolicy', () => {
  it('keeps the high-risk publish pipeline step messages stable', () => {
    expect(PUBLISH_PIPELINE_LOG_MESSAGES).toEqual({
      loginStart: '[Pipeline] login step start',
      openingWriteEditor: '[Pipeline] opening Naver write editor',
      switchingEditorFrame: '[Pipeline] switching to main editor frame',
      editorFrameReady: '[Pipeline] editor frame ready',
    });
  });

  it('formats URL-bearing pipeline logs with a deterministic unknown fallback', () => {
    expect(formatPipelineUrlLog('loginDone', 'https://blog.naver.com/PostWriteForm.naver')).toBe(
      '[Pipeline] login step done url=https://blog.naver.com/PostWriteForm.naver',
    );

    expect(formatPipelineUrlLog('writeEditorNavigationDone', '')).toBe(
      '[Pipeline] write editor navigation done url=(unknown)',
    );
  });

  it('prepends elapsed seconds only after a run clock has started', () => {
    expect(formatElapsedPipelineLog('ready', 0, 12_345)).toBe('ready');
    expect(formatElapsedPipelineLog('ready', 10_000, 12_345)).toBe('[+2.3s] ready');
  });
});
