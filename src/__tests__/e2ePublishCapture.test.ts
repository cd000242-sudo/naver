import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { captureE2EPublishPayload } from '../main/e2ePublishCapture';

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

async function capturePath(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bln-capture-test-'));
  tempRoots.push(root);
  return path.join(root, 'capture.ndjson');
}

describe('E2E publish capture boundary', () => {
  it('is disabled for packaged-app execution even when test environment variables are present', async () => {
    const filePath = await capturePath();
    const result = await captureE2EPublishPayload(
      { title: 'must not capture', naverPassword: 'secret' },
      { E2E_TEST: '1', E2E_PUBLISH_CAPTURE_FILE: filePath },
      false,
    );

    expect(result).toBeNull();
    await expect(fs.access(filePath)).rejects.toThrow();
  });

  it('redacts credentials while preserving the exact article body order', async () => {
    const filePath = await capturePath();
    const body = ['1. first', '2. second', '3. third'].join('\n');
    const result = await captureE2EPublishPayload(
      { title: 'ordered', content: body, naverPassword: 'secret', publishMode: 'publish' },
      { E2E_TEST: '1', E2E_PUBLISH_CAPTURE_FILE: filePath },
      true,
    );

    expect(result?.url).toMatch(/blog\.naver\.com/);
    const record = JSON.parse((await fs.readFile(filePath, 'utf8')).trim());
    expect(record.payload.content).toBe(body);
    expect(record.payload.naverPassword).toBe('[redacted]');
  });
});
