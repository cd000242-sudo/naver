import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

describe('content generation timeout policy', () => {
  const src = read('renderer/modules/contentGeneration.ts');
  const apiClientSrc = read('renderer/utils/apiClient.ts');

  it('uses a single explicit timeout budget for long AI content generation calls', () => {
    expect(src).toMatch(/CONTENT_GENERATION_TIMEOUT_MS\s*=\s*360000/);
    expect(src).toMatch(/timeout:\s*CONTENT_GENERATION_TIMEOUT_MS/g);
  });

  it('uses one controlled retry for expensive structured content generation', () => {
    expect(src).toMatch(/CONTENT_GENERATION_RETRY_COUNT\s*=\s*1/);
    expect(src).toMatch(/retryCount:\s*CONTENT_GENERATION_RETRY_COUNT/g);
    expect(src).not.toMatch(/retryCount:\s*2/);
  });

  it('aborts the main content generation request before retrying after a renderer timeout', () => {
    expect(apiClientSrc).toMatch(/abortStaleContentGeneration/);
    expect(apiClientSrc).toMatch(/apiMethod !== 'generateStructuredContent'/);
    expect(apiClientSrc).toMatch(/cancelAutomation/);
  });
});
