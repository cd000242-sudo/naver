import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGeminiCliImageSession, type GeminiCliImageSessionDeps } from '../image/geminiCli/geminiCliImageSession.js';
import { buildGeminiCliImageInstruction } from '../image/geminiCli/geminiCliImageInstruction.js';
import { listGeneratedImages } from '../image/codex/codexImageFiles.js';
import { AgentCliError } from '../agentCli/types.js';
import type { SpawnArgs, SpawnResult } from '../agentCli/spawnHelper.js';

const PARENT = '5f0c8a3e-1b2d-4c6e-9a7f-0d1e2f3a4b5c';
const CHILD = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const dirs: string[] = [];
async function tempHome(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'gemini-image-test-'));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const ndjson = (...events: unknown[]): string => `${events.map((event) => JSON.stringify(event)).join('\n')}\n`;
const initEvent = (id: unknown) => ({
  event: 'init', conversation_id: id,
  init: { model: 'gemini-3.8-flash-low', cwd: 'C:/tmp', tools: ['invoke_subagent'], permission_mode: 'default' },
});
const echoEvent = (text: string) => ({ event: 'step_update', step_update: { conversation_id: PARENT, step_index: 0, state: 'DONE', step_type: 'user_input', text_delta: text } });
const subagentEvent = {
  event: 'step_update',
  step_update: {
    conversation_id: PARENT, step_index: 1, state: 'DONE', step_type: 'subagent', tool_name: 'invoke_subagent',
    subagent_info: { subagents: [{ type_name: 'image-generator', conversation_id: CHILD }] },
  },
};
const resultEvent = (status: unknown = 'SUCCESS', response = 'teapot_1.jpg\n') => ({
  event: 'result', result: { conversation_id: PARENT, status, response, duration_seconds: 47.8 },
});
const successOut = (): string => ndjson(initEvent(PARENT), echoEvent('Generate exactly one image'), subagentEvent, resultEvent());

interface Drop { folder: string; files: Array<[string, number]> }

/** A fake `agy`: writes the files (name, secondsAgo) into <home>/.gemini/antigravity-cli/brain/<folder>/ like the image tool does. */
function fakeSpawn(home: string, drops: Drop[], overrides: Partial<SpawnResult> = {}) {
  const calls: SpawnArgs[] = [];
  const cwdExisted: boolean[] = [];
  const spawn = vi.fn(async (args: SpawnArgs): Promise<SpawnResult> => {
    calls.push(args);
    cwdExisted.push(existsSync(String(args.cwd)));
    for (const { folder, files } of drops) {
      const dir = join(home, '.gemini', 'antigravity-cli', 'brain', folder);
      await mkdir(join(dir, 'scratch'), { recursive: true });
      await mkdir(join(dir, '.system_generated'), { recursive: true });
      for (const [name, secondsAgo] of files) {
        await writeFile(join(dir, name), 'img');
        const at = new Date(Date.now() - secondsAgo * 1000);
        await utimes(join(dir, name), at, at);
      }
    }
    return { code: 0, stdout: successOut(), stderr: '', ...overrides };
  });
  return { spawn, calls, cwdExisted };
}
const makeDeps = (home: string, spawn: GeminiCliImageSessionDeps['spawn'], listImages: GeminiCliImageSessionDeps['listImages'] = listGeneratedImages): GeminiCliImageSessionDeps => ({
  spawn, env: () => ({ USERPROFILE: home, PATH: 'x' }), now: () => Date.now() - 60_000, listImages,
});
const names = (files: string[]) => files.map((file) => file.replace(/\\/g, '/').split('/').pop());
const fail = (home: string, spawn: GeminiCliImageSessionDeps['spawn'], prompt = 'draw a teapot') =>
  runGeminiCliImageSession(prompt, {}, makeDeps(home, spawn)).catch((error) => error) as Promise<AgentCliError>;

describe('runGeminiCliImageSession - 실행 방식', () => {
  it('agy 를 stream-json · 모델 인자로 실행하고 --print / -p / 권한 자동 승인은 붙이지 않는다', async () => {
    const home = await tempHome();
    const { spawn, calls } = fakeSpawn(home, [{ folder: PARENT, files: [['teapot_1.jpg', 5]] }]);
    await runGeminiCliImageSession('draw a teapot', { timeoutMs: 240_000 }, makeDeps(home, spawn));
    const { args } = calls[0];
    expect(calls[0].command).toBe('agy');
    expect(calls[0].provider).toBe('gemini');
    expect(args[args.indexOf('--output-format') + 1]).toBe('stream-json');
    expect(args[args.indexOf('--model') + 1]).toBe('gemini-3.8-flash-low');
    expect(args[args.indexOf('--print-timeout') + 1]).toBe('235s');
    for (const banned of ['--print', '-p', '--dangerously-skip-permissions']) expect(args).not.toContain(banned);
    expect(args.join(' ')).not.toContain('draw a teapot');
  });

  it('지시문은 stdin 으로만 넘기고, 그림 설명은 표식 사이에 넣는다 (비율 줄이 붙은 프롬프트도 그대로)', async () => {
    const home = await tempHome();
    const { spawn, calls } = fakeSpawn(home, [{ folder: PARENT, files: [['teapot_1.jpg', 5]] }]);
    const prompt = 'draw a teapot\nASPECT RATIO: portrait 3:4.';
    await runGeminiCliImageSession(prompt, {}, makeDeps(home, spawn));
    expect(calls[0].stdin).toBe(buildGeminiCliImageInstruction(prompt));
    expect(calls[0].stdin).toContain('<<<IMAGE\ndraw a teapot\nASPECT RATIO: portrait 3:4.\nIMAGE>>>');
    expect(calls[0].env).toMatchObject({ USERPROFILE: home });
  });

  it('이름을 준 모델이 앱 기본 모델보다 먼저다', async () => {
    const home = await tempHome();
    const { spawn, calls } = fakeSpawn(home, [{ folder: PARENT, files: [['a.jpg', 5]] }]);
    await runGeminiCliImageSession('p', { model: ' gemini-3.8-flash-high ' }, makeDeps(home, spawn));
    expect(calls[0].args[calls[0].args.indexOf('--model') + 1]).toBe('gemini-3.8-flash-high');
  });

  it('취소 신호와 제한 시간을 spawn 에 그대로 넘긴다', async () => {
    const home = await tempHome();
    const { spawn, calls } = fakeSpawn(home, [{ folder: PARENT, files: [['a.jpg', 5]] }]);
    const controller = new AbortController();
    await runGeminiCliImageSession('p', { signal: controller.signal, timeoutMs: 90_000 }, makeDeps(home, spawn));
    expect(calls[0].signal).toBe(controller.signal);
    expect(calls[0].timeoutMs).toBe(90_000);
  });

  it('빈 프롬프트는 작업 폴더도 만들기 전에 거부한다', async () => {
    const home = await tempHome();
    const { spawn } = fakeSpawn(home, []);
    await expect(runGeminiCliImageSession('  ', {}, makeDeps(home, spawn))).rejects.toThrow();
    expect(spawn).not.toHaveBeenCalled();
  });
});

describe('runGeminiCliImageSession - 그림 파일 찾기', () => {
  it('실측 NDJSON 의 성공 경로: 대화 id 폴더 바로 아래의 그림을 돌려주고 하위 폴더·이미지 아닌 파일은 무시한다', async () => {
    const home = await tempHome();
    const { spawn } = fakeSpawn(home, [{ folder: PARENT, files: [['ceramic_teapot_1794889758706.jpg', 5], ['notes.txt', 4]] }]);
    const result = await runGeminiCliImageSession('p', {}, makeDeps(home, spawn));
    expect(result.conversationId).toBe(PARENT);
    expect(names(result.files)).toEqual(['ceramic_teapot_1794889758706.jpg']);
    expect(result.files[0].replace(/\\/g, '/')).toContain(`/brain/${PARENT}/`);
  });

  // Measured 2026-11-17 (live): the image tool refined its own picture three times in one request (v1 had text the
  // prompt forbade) and the reply named the one it settled on. The first file is a draft, not the result.
  it('도구가 스스로 다듬어 파일이 셋이면(v1 · v2 · final) CLI 가 답으로 알려준 최종본이 files[0] 이다', async () => {
    const home = await tempHome();
    const { spawn } = fakeSpawn(
      home,
      [{ folder: PARENT, files: [['corner_final_3.jpg', 20], ['corner_1.jpg', 30], ['corner_v2_2.jpg', 10]] }],
      { stdout: ndjson(initEvent(PARENT), subagentEvent, resultEvent('SUCCESS', 'I refined it.\nCorner_Final_3.jpg\n')) },
    );
    const result = await runGeminiCliImageSession('p', {}, makeDeps(home, spawn));
    expect(names(result.files)).toEqual(['corner_final_3.jpg', 'corner_1.jpg', 'corner_v2_2.jpg']);
  });

  it('답에 파일 이름이 없으면 가장 나중에 만든 파일이 files[0] 이다', async () => {
    const home = await tempHome();
    const { spawn } = fakeSpawn(
      home,
      [{ folder: PARENT, files: [['newest_zzz.jpg', 3], ['oldest_aaa.jpg', 9]] }],
      { stdout: ndjson(initEvent(PARENT), subagentEvent, resultEvent('SUCCESS', 'Done.\n')) },
    );
    const result = await runGeminiCliImageSession('p', {}, makeDeps(home, spawn));
    expect(names(result.files)).toEqual(['newest_zzz.jpg', 'oldest_aaa.jpg']);
  });

  it('부모 폴더가 비어 있으면 image-generator 하위 대화 폴더를 본다', async () => {
    const home = await tempHome();
    const { spawn } = fakeSpawn(home, [{ folder: PARENT, files: [] }, { folder: CHILD, files: [['child_1.jpg', 5]] }]);
    const result = await runGeminiCliImageSession('p', {}, makeDeps(home, spawn));
    expect(names(result.files)).toEqual(['child_1.jpg']);
    expect(result.files[0].replace(/\\/g, '/')).toContain(`/brain/${CHILD}/`);
  });

  it('시작 시각 2초 여유 안의 파일은 받고, 그 전의 옛 파일은 받지 않는다', async () => {
    const home = await tempHome();
    const { spawn } = fakeSpawn(home, [{ folder: PARENT, files: [['in_slack.jpg', 61], ['too_old.jpg', 70]] }]);
    const result = await runGeminiCliImageSession('p', {}, makeDeps(home, spawn));
    expect(names(result.files)).toEqual(['in_slack.jpg']);
  });

  it('그림 나열 함수는 주입한 것을 쓴다 (부모 폴더 → 하위 폴더 순)', async () => {
    const home = await tempHome();
    const { spawn } = fakeSpawn(home, []);
    const listImages = vi.fn(async (dir: string) => (dir.endsWith(CHILD) ? [join(dir, 'x.jpg')] : []));
    const result = await runGeminiCliImageSession('p', {}, makeDeps(home, spawn, listImages));
    expect(listImages.mock.calls.map((call) => String(call[0]).replace(/\\/g, '/').split('/').pop())).toEqual([PARENT, CHILD]);
    expect(names(result.files)).toEqual(['x.jpg']);
  });
});

describe('runGeminiCliImageSession - 실패는 명시 오류로', () => {
  it('그림이 0장이면 empty_output — 엔진을 바꾸지도 다시 보내지도 않았다고 알린다', async () => {
    const home = await tempHome();
    const { spawn } = fakeSpawn(home, [{ folder: PARENT, files: [['old.jpg', 3600]] }]);
    const error = await fail(home, spawn);
    expect(error).toBeInstanceOf(AgentCliError);
    expect(error.code).toBe('empty_output');
    expect(error.provider).toBe('gemini');
    expect(error.message).toContain('다른 이미지 엔진으로 바꾸지 않았고 같은 요청은 다시 보내지 않았습니다');
  });

  it('종료 코드가 0 이 아니면 classifyExit 로 분류한다 (한도 · 로그아웃 · 그 밖)', async () => {
    const home = await tempHome();
    const run = (stderr: string) => fail(home, fakeSpawn(home, [], { code: 1, stdout: '', stderr }).spawn);
    expect((await run('RESOURCE_EXHAUSTED: quota exceeded')).code).toBe('rate_limited');
    expect((await run('Please sign in to continue')).code).toBe('not_logged_in');
    expect((await run('something odd happened')).code).toBe('nonzero_exit');
  });

  it('프롬프트가 되돌아온 user_input 글의 낱말(quota 등)로 한도 초과를 오판하지 않는다', async () => {
    const home = await tempHome();
    const stdout = ndjson(initEvent(PARENT), echoEvent('a poster about quota 429 limit reached'));
    const { spawn } = fakeSpawn(home, [], { code: 1, stdout, stderr: 'Please sign in to continue' });
    expect((await fail(home, spawn)).code).toBe('not_logged_in');
  });

  it('result.status 가 SUCCESS 가 아니면 파일이 있어도 response 글로 분류해 실패한다', async () => {
    const home = await tempHome();
    const withStatus = (status: unknown, response: string) => fakeSpawn(
      home, [{ folder: PARENT, files: [['a.jpg', 5]] }], { stdout: ndjson(initEvent(PARENT), resultEvent(status, response)) },
    ).spawn;
    expect((await fail(home, withStatus('FAILED', 'You have exceeded your quota'))).code).toBe('rate_limited');
    expect((await fail(home, withStatus('ERROR', 'the image tool refused'))).code).toBe('nonzero_exit');
  });

  it('result 이벤트가 아예 없으면 성공으로 보지 않는다', async () => {
    const home = await tempHome();
    const { spawn } = fakeSpawn(home, [{ folder: PARENT, files: [['a.jpg', 5]] }], { stdout: ndjson(initEvent(PARENT)) });
    expect(await fail(home, spawn)).toBeInstanceOf(AgentCliError);
  });

  it('대화 id 가 위험한 글자면 폴더를 읽지도 만들지도 않고 실패한다', async () => {
    const home = await tempHome();
    const listImages = vi.fn(async () => [] as string[]);
    const { spawn } = fakeSpawn(home, [], { stdout: ndjson(initEvent('..\\x'), resultEvent()) });
    const error = await runGeminiCliImageSession('p', {}, makeDeps(home, spawn, listImages)).catch((e) => e) as AgentCliError;
    expect(error.code).toBe('empty_output');
    expect(error.message).toContain('대화 id');
    expect(error.message).toContain('다른 이미지 엔진으로 바꾸지 않았고 같은 요청은 다시 보내지 않았습니다');
    expect(listImages).not.toHaveBeenCalled();
    expect(existsSync(join(home, '.gemini'))).toBe(false);
  });
});

describe('runGeminiCliImageSession - 임시 작업 폴더', () => {
  it('실행 중에는 agentcli-gemini-image- 임시 폴더가 cwd 이고, 성공 뒤 그 폴더만 지운다 (brain 폴더는 남긴다)', async () => {
    const home = await tempHome();
    const { spawn, calls, cwdExisted } = fakeSpawn(home, [{ folder: PARENT, files: [['a.jpg', 5]] }]);
    const result = await runGeminiCliImageSession('p', {}, makeDeps(home, spawn));
    const cwd = String(calls[0].cwd);
    expect(cwd).toContain('agentcli-gemini-image-');
    expect(cwdExisted).toEqual([true]);
    expect(existsSync(cwd)).toBe(false);
    expect(existsSync(result.files[0])).toBe(true);
  });

  it('실패해도 임시 폴더는 지운다', async () => {
    const home = await tempHome();
    const { spawn, calls } = fakeSpawn(home, [], { code: 1, stdout: '', stderr: 'boom' });
    await fail(home, spawn);
    expect(existsSync(String(calls[0].cwd))).toBe(false);
  });
});
