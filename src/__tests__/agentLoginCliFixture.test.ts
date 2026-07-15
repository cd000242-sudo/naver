import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  createAgentLoginCodePromptObserver,
  createAgentLoginUrlObserver,
} from '../agentCli/loginUrl';
import { startSpawnSession, type SpawnWriteStatus } from '../agentCli/spawnHelper';

describe('real streamed Agent login CLI fixture', () => {
  it('extracts the exact URL and supports an invalid-code retry over real stdin', async () => {
    const urls: string[] = [];
    const attempts: number[] = [];
    const writeStatuses: SpawnWriteStatus[] = [];
    let writeChain = Promise.resolve();
    let session!: ReturnType<typeof startSpawnSession>;
    const observeUrl = createAgentLoginUrlObserver('claude', (url) => urls.push(url));
    const observeCode = createAgentLoginCodePromptObserver((attempt) => {
      attempts.push(attempt);
      const code = attempt === 1 ? 'wrong-code' : 'right-code';
      writeChain = writeChain.then(async () => {
        writeStatuses.push(await session.writeLine(code));
      });
    });
    const observe = (chunk: string): void => {
      observeUrl(chunk);
      observeCode(chunk);
    };

    session = startSpawnSession({
      command: process.execPath,
      args: [resolve('src', '__tests__', 'fixtures', 'agent-login-cli-fixture.mjs')],
      provider: 'claude',
      timeoutMs: 8_000,
      onStdoutChunk: observe,
      onStderrChunk: observe,
    });

    const result = await session.result;
    await writeChain;

    expect(result.code).toBe(0);
    expect(urls).toEqual([
      'https://claude.com/cai/oauth/authorize?state=fixture-secret',
    ]);
    expect(attempts).toEqual([1, 2]);
    expect(writeStatuses).toEqual(['accepted', 'accepted']);
  });
});
