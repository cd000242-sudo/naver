// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { EnhancedApiClient } from '../renderer/utils/apiClient';

describe('content generation single-flight guard', () => {
  it('also rejects concurrent generation inside the main process', () => {
    const mainSource = readFileSync(path.join(process.cwd(), 'src', 'main.ts'), 'utf8');
    expect(mainSource).toContain('const activeGenerationIds = contentGenerationAbortRegistry.activeIds()');
    expect(mainSource).toContain('if (activeGenerationIds.length > 0)');
    expect(mainSource).toContain('동시 실행 거부');
  });

  it('rejects a different concurrent generation before invoking main twice', async () => {
    let resolveFirst!: (value: unknown) => void;
    const firstResult = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    const generateStructuredContent = vi.fn()
      .mockImplementationOnce(() => firstResult)
      .mockResolvedValue({ success: true });
    (window as any).api = { generateStructuredContent };
    const client = EnhancedApiClient.getInstance();

    const first = client.call('generateStructuredContent', [{ assembly: { keywords: ['first'] } }], {
      retryCount: 0,
      timeout: 0,
    });
    await Promise.resolve();
    const second = await client.call('generateStructuredContent', [{ assembly: { keywords: ['second'] } }], {
      retryCount: 0,
      timeout: 0,
    });

    expect(second.success).toBe(false);
    expect(second.error).toContain('다른 글 생성이 이미 진행 중');
    expect(generateStructuredContent).toHaveBeenCalledTimes(1);

    resolveFirst({ success: true });
    await expect(first).resolves.toMatchObject({ success: true });
  });
});
