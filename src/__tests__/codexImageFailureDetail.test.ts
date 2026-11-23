import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCodexImageSession, type CodexImageSessionDeps } from '../image/codex/codexImageSession.js';
import { AgentCliError } from '../agentCli/types.js';
import type { SpawnResult } from '../agentCli/spawnHelper.js';

// Measured 2026-11-24 with codex-cli 0.166.0: under `--json` the failure text is an `error` event on STDOUT, while stderr only
// carries "Reading prompt from stdin..." (plus websocket / skills noise). The app logs of 2026-11-22/23 show the user-facing
// detail as "상세: Reading prompt from stdin..." for the shopping batches that failed, so the real reason (and the reset time
// the usage tracker parses) never reached the screen, the log or agent-usage.json.
const THREAD = '01a1a02d-33ae-7ff2-96ad-237cbeb342e0';
const STDERR_NOISE = 'Reading prompt from stdin...\n';
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

async function tempHome(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'codex-image-detail-'));
  dirs.push(dir);
  return dir;
}
const deps = (home: string, spawn: CodexImageSessionDeps['spawn']): CodexImageSessionDeps => ({
  spawn, env: () => ({ CODEX_HOME: home, PATH: 'x' }), now: () => Date.now() - 60_000,
});
const events = (...lines: object[]): string => lines.map(line => JSON.stringify(line)).join('\n') + '\n';
const started = { type: 'thread.started', thread_id: THREAD };

async function failWith(result: SpawnResult, options: Parameters<typeof runCodexImageSession>[1] = {}): Promise<AgentCliError> {
  const home = await tempHome();
  const spawn = vi.fn(async (): Promise<SpawnResult> => result);
  return await runCodexImageSession(['p'], options, deps(home, spawn)).catch(e => e) as AgentCliError;
}

describe('Codex 이미지 실패 상세: stdout 의 error 이벤트가 stderr 잡음에 가려지지 않는다', () => {
  it('한도 초과: stderr 가 "Reading prompt from stdin..." 뿐이어도 리셋 시각을 안내한다', async () => {
    const error = await failWith({
      code: 1,
      stdout: events(started, { type: 'turn.started' },
        { type: 'error', message: "You've hit your usage limit. Visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at Nov 4th, 2026 3:42 PM." },
        { type: 'turn.failed', error: { message: "You've hit your usage limit. try again at Nov 4th, 2026 3:42 PM." } }),
      stderr: STDERR_NOISE,
    });
    expect(error).toBeInstanceOf(AgentCliError);
    expect(error.code).toBe('rate_limited');
    expect(error.message).toContain('11월 4일 15시 42분');
    expect(String(error.detail)).toContain('usage limit');
  });

  it('쇼핑 상품 사진을 붙인 세션도 같다', async () => {
    const error = await failWith({
      code: 1,
      stdout: events(started, { type: 'error', message: "You've hit your usage limit. try again at Nov 4th, 2026 3:42 PM." }),
      stderr: STDERR_NOISE,
    }, { referenceImage: { buffer: Buffer.from('png'), fileName: 'reference-01.png' } });
    expect(error.code).toBe('rate_limited');
    expect(error.message).toContain('11월 4일 15시 42분');
  });

  it('로그아웃(401): 상세에 websocket 잡음이 아니라 401 이유가 나온다', async () => {
    const error = await failWith({
      code: 1,
      stdout: events(started, { type: 'error', message: 'Reconnecting... 5/5 (unexpected status 401 Unauthorized: Missing bearer or basic authentication in header, url: wss://api.openai.com/v1/responses)' }),
      stderr: `${STDERR_NOISE}2026-11-23T22:10:44Z ERROR codex_api::endpoint::responses_websocket: failed to connect to Responses WebSocket stage=Unknown\n`,
    });
    expect(error.code).toBe('not_logged_in');
    expect(String(error.detail)).toContain('401 Unauthorized');
    expect(String(error.detail)).not.toContain('failed to connect to Responses WebSocket');
  });

  it('error 이벤트가 없으면 지금처럼 stderr 를 쓰되 "Reading prompt from stdin..." 한 줄은 뺀다', async () => {
    const error = await failWith({
      code: 1,
      stdout: '',
      stderr: `${STDERR_NOISE}You've hit your usage limit. try again at Nov 4th, 2026 3:42 PM.\n`,
    });
    expect(error.code).toBe('rate_limited');
    expect(error.message).toContain('11월 4일 15시 42분');
    expect(String(error.detail)).not.toContain('Reading prompt from stdin');
  });
});
