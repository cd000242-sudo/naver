import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('publish session recovery hardening', () => {
  const flowSource = readFileSync(
    new URL('../renderer/modules/fullAutoFlow.ts', import.meta.url),
    'utf8',
  );
  const mainSource = readFileSync(
    new URL('../main.ts', import.meta.url),
    'utf8',
  );
  const preloadSource = readFileSync(
    new URL('../preload.ts', import.meta.url),
    'utf8',
  );

  it('does not convert publish recovery into a user cancellation', () => {
    expect(flowSource).toContain('function closeBrowserForPublishRetry');
    expect(flowSource).not.toContain('await window.api?.cancelAutomation?.()');
  });

  it('passes the Naver account id when closing only a dead publish session', () => {
    expect(flowSource).toContain('window.api?.closeBrowser?.(naverId)');
    expect(preloadSource).toContain('closeBrowser: (naverId?: string)');
    expect(mainSource).toContain("ipcMain.handle('automation:closeBrowser', async (_event, naverId?: string)");
    expect(mainSource).toContain('AutomationService.closeSession(normalizedId)');
  });
});
