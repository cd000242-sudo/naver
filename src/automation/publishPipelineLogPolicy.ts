export const PUBLISH_PIPELINE_LOG_MESSAGES = {
  loginStart: '[Pipeline] login step start',
  openingWriteEditor: '[Pipeline] opening Naver write editor',
  switchingEditorFrame: '[Pipeline] switching to main editor frame',
  editorFrameReady: '[Pipeline] editor frame ready',
} as const;

export type PipelineUrlLogStep = 'loginDone' | 'writeEditorNavigationDone';

const PIPELINE_URL_PREFIX: Record<PipelineUrlLogStep, string> = {
  loginDone: '[Pipeline] login step done url=',
  writeEditorNavigationDone: '[Pipeline] write editor navigation done url=',
};

export function formatPipelineUrlLog(step: PipelineUrlLogStep, url: string | null | undefined): string {
  return `${PIPELINE_URL_PREFIX[step]}${url || '(unknown)'}`;
}

export function formatElapsedPipelineLog(message: string, startedAtMs: number, nowMs = Date.now()): string {
  if (!startedAtMs || startedAtMs <= 0) {
    return message;
  }

  const elapsed = ((nowMs - startedAtMs) / 1000).toFixed(1);
  return `[+${elapsed}s] ${message}`;
}
