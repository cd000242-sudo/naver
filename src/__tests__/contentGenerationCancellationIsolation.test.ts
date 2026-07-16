import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

describe('content-generation cancellation isolation wiring', () => {
  it('uses a scoped registry instead of the shared general abort controller', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/main.ts'), 'utf8');
    const channel = source.indexOf("'automation:generateStructuredContent'");
    const start = source.lastIndexOf('ipcMain.handle(', channel);
    const end = source.indexOf('registerConfigHandlers({', start);
    expect(channel).toBeGreaterThanOrEqual(0);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const handler = source.slice(start, end);

    expect(handler).toContain('contentGenerationAbortRegistry.begin');
    expect(handler).toContain('contentGenerationAbortRegistry.release');
    expect(handler).not.toContain('createGeneralAbortController');
  });

  it('routes renderer timeouts through the exact content request id', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/renderer/utils/apiClient.ts'), 'utf8');
    const start = source.indexOf('private async abortStaleContentGeneration');
    const end = source.indexOf('// ✅ [2026-01-29] 상태 조회', start);
    const timeoutAbort = source.slice(start, end);
    expect(timeoutAbort).toContain('cancelContentGeneration({ requestId');
    expect(timeoutAbort).not.toContain('cancelAutomation');
  });

  it('keeps internal publish cancellation from aborting unrelated content generation', () => {
    const service = fs.readFileSync(
      path.resolve(process.cwd(), 'src/main/services/AutomationService.ts'),
      'utf8',
    );
    const start = service.indexOf('requestCancel(): void');
    const end = service.indexOf('isCancelRequested()', start);
    expect(service.slice(start, end)).not.toContain('abortGeneralOperation');
  });

  it('requires an exact content request id even for the generic automation cancel route', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/main.ts'), 'utf8');
    const start = source.indexOf("ipcMain.handle('automation:cancel'");
    const end = source.indexOf("ipcMain.handle('automation:resetImageState'", start);
    const cancelHandler = source.slice(start, end);

    expect(cancelHandler).toContain('cancelMeta.contentRequestId');
    expect(cancelHandler).toContain('contentGenerationAbortRegistry.abort(contentRequestId');
    expect(cancelHandler).not.toContain('contentGenerationAbortRegistry.abortAll');
  });
});
