import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildCodexImageInstruction } from '../image/codex/codexImageInstruction.js';
import { extractCodexErrorText, listGeneratedImages, parseCodexThreadId, resolveCodexHome } from '../image/codex/codexImageFiles.js';
import { runCodexImageSession, type CodexImageSessionDeps } from '../image/codex/codexImageSession.js';
import { assertCodexImageReady } from '../image/codex/codexImageReadiness.js';
import { AgentCliError, type AgentCliStatus } from '../agentCli/types.js';
import type { SpawnArgs, SpawnResult } from '../agentCli/spawnHelper.js';

const THREAD = '01a1a02d-33ae-7ff2-96ad-237cbeb342e0';
const dirs: string[] = [];
async function tempHome(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'codex-image-test-'));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

const threadStarted = (id: string) => `${JSON.stringify({ type: 'thread.started', thread_id: id })}\n{"type":"turn.started"}\n`;

/** A fake `codex exec`: writes the given files (name, secondsAgo) into <home>/generated_images/<thread> like image_gen does. */
function fakeSpawn(home: string, files: Array<[string, number]>, overrides: Partial<SpawnResult> = {}) {
  const calls: SpawnArgs[] = [];
  const spawn = vi.fn(async (args: SpawnArgs): Promise<SpawnResult> => {
    calls.push(args);
    const folder = join(home, 'generated_images', THREAD);
    await mkdir(folder, { recursive: true });
    for (const [name, secondsAgo] of files) {
      const path = join(folder, name);
      await writeFile(path, 'png');
      const at = new Date(Date.now() - secondsAgo * 1000);
      await utimes(path, at, at);
    }
    return { code: 0, stdout: threadStarted(THREAD), stderr: '', ...overrides };
  });
  return { spawn, calls };
}
const deps = (home: string, spawn: CodexImageSessionDeps['spawn']): CodexImageSessionDeps => ({
  spawn, env: () => ({ CODEX_HOME: home, PATH: 'x' }), now: () => Date.now() - 60_000,
});

describe('Codex 이미지 지시문', () => {
  it('1장: 실측에서 성공한 형태 그대로 — 프롬프트를 한 글자도 바꾸지 않고 따옴표로 감싼다', () => {
    const text = buildCodexImageInstruction(['A clean 3D icon of a savings book, text "청약통장"']);
    expect(text).toBe(
      '이미지 생성 도구(image_gen.imagegen)에 아래 프롬프트를 한 글자도 바꾸지 말고 그대로 넘겨 이미지 1장만 만드세요. '
      + '다른 작업이나 설명은 하지 마세요. 프롬프트: "A clean 3D icon of a savings book, text "청약통장""',
    );
  });

  it('여러 장: 번호를 붙여 각각 그대로 넘기고 순서대로 N장을 지시한다', () => {
    const text = buildCodexImageInstruction(['first prompt', 'second prompt', 'third prompt']);
    expect(text).toContain('image_gen.imagegen');
    expect(text).toContain('3장');
    expect(text).toContain('순서대로');
    expect(text).toContain('한 글자도 바꾸지 말고');
    expect(text.indexOf('프롬프트 1: "first prompt"')).toBeGreaterThan(-1);
    expect(text.indexOf('프롬프트 1: "first prompt"')).toBeLessThan(text.indexOf('프롬프트 2: "second prompt"'));
    expect(text.indexOf('프롬프트 2: "second prompt"')).toBeLessThan(text.indexOf('프롬프트 3: "third prompt"'));
  });

  it('빈 프롬프트 목록은 거부한다', () => {
    expect(() => buildCodexImageInstruction([])).toThrow();
    expect(() => buildCodexImageInstruction(['  '])).toThrow();
  });
});

describe('thread id · 결과 폴더 · 파일 순서', () => {
  it('--json 출력의 thread.started 이벤트에서 thread id 를 읽는다 (깨진 줄·다른 이벤트는 건너뜀)', () => {
    expect(parseCodexThreadId(`not json\n${threadStarted(THREAD)}`)).toBe(THREAD);
    expect(parseCodexThreadId('{"type":"turn.started"}')).toBeUndefined();
    expect(parseCodexThreadId('')).toBeUndefined();
  });

  it('경로를 벗어나는 thread id 는 받아들이지 않는다', () => {
    expect(parseCodexThreadId('{"type":"thread.started","thread_id":"..\\\\..\\\\Windows"}')).toBeUndefined();
    expect(parseCodexThreadId('{"type":"thread.started","thread_id":"../x"}')).toBeUndefined();
  });

  it('CODEX_HOME 이 있으면 그것을, 없으면 사용자 폴더의 .codex 를 쓴다', () => {
    expect(resolveCodexHome({ CODEX_HOME: 'D:\\codex' })).toBe('D:\\codex');
    expect(resolveCodexHome({ USERPROFILE: 'C:\\Users\\a' }).replace(/\\/g, '/')).toBe('C:/Users/a/.codex');
  });

  it('error / turn.failed 이벤트의 문구만 모은다 (프롬프트 에코에 든 낱말은 오판 근거가 아니다)', () => {
    const out = [
      '{"type":"item.completed","item":{"type":"agent_message","text":"quota authentication limit reached"}}',
      '{"type":"error","message":"You\\u2019ve hit your usage limit. try again at Nov 4th, 2026 3:42 PM."}',
      '{"type":"turn.failed","error":{"message":"usage limit"}}',
    ].join('\n');
    const text = extractCodexErrorText(out);
    expect(text).toContain('hit your usage limit');
    expect(text).not.toContain('authentication');
  });

  it('폴더의 새 이미지를 생성 시각 순으로 돌려준다 (파일 이름 순서가 아니다) — 이전 파일·이미지 아닌 파일은 뺀다', async () => {
    const home = await tempHome();
    const dir = join(home, 'g');
    await mkdir(dir);
    const put = async (name: string, secondsAgo: number) => {
      await writeFile(join(dir, name), 'x');
      const at = new Date(Date.now() - secondsAgo * 1000);
      await utimes(join(dir, name), at, at);
    };
    await put('exec-zzz.png', 30);
    await put('exec-aaa.png', 20);
    await put('exec-mmm.png', 10);
    await put('exec-old.png', 3600);
    await put('notes.txt', 5);
    const files = await listGeneratedImages(dir, Date.now() - 120_000);
    expect(files.map(f => f.replace(/\\/g, '/').split('/').pop())).toEqual(['exec-zzz.png', 'exec-aaa.png', 'exec-mmm.png']);
  });
});

describe('runCodexImageSession — spawn 을 가짜로', () => {
  it('gpt-6-luna · effort low · --json 인자로 실행하고 지시문은 stdin 으로만 넘긴다', async () => {
    const home = await tempHome();
    const { spawn, calls } = fakeSpawn(home, [['exec-1.png', 5]]);
    const result = await runCodexImageSession(['draw a cat'], {}, deps(home, spawn));
    const args = calls[0].args;
    expect(calls[0].command).toBe('codex');
    expect(calls[0].provider).toBe('codex');
    expect(args[0]).toBe('exec');
    expect(args).toEqual(expect.arrayContaining(['--skip-git-repo-check', '--ignore-user-config', '--json']));
    expect(args[args.indexOf('-m') + 1]).toBe('gpt-6-luna');
    expect(args[args.indexOf('-c') + 1]).toBe('model_reasoning_effort=low');
    expect(calls[0].stdin).toBe(buildCodexImageInstruction(['draw a cat']));
    expect(args.join(' ')).not.toContain('draw a cat');
    expect(calls[0].env).toMatchObject({ CODEX_HOME: home });
    expect(result.threadId).toBe(THREAD);
    expect(result.files).toHaveLength(1);
  });

  it('thread id → generated_images/<thread id> 폴더 → 파일을 생성 순서대로 돌려준다', async () => {
    const home = await tempHome();
    const { spawn } = fakeSpawn(home, [['exec-c.png', 30], ['exec-a.png', 20], ['exec-b.png', 10]]);
    const result = await runCodexImageSession(['p1', 'p2', 'p3'], {}, deps(home, spawn));
    expect(result.files.map(f => f.replace(/\\/g, '/').split('/').pop())).toEqual(['exec-c.png', 'exec-a.png', 'exec-b.png']);
    expect(result.files[0].replace(/\\/g, '/')).toContain(`generated_images/${THREAD}/`);
  });

  it('thread id 를 읽지 못하면 폴더를 짐작하지 않고 명시 실패한다', async () => {
    const home = await tempHome();
    const spawn = vi.fn(async (): Promise<SpawnResult> => ({ code: 0, stdout: '{"type":"turn.started"}', stderr: '' }));
    await expect(runCodexImageSession(['p'], {}, deps(home, spawn))).rejects.toThrow(/thread/i);
  });

  it('결과 폴더가 없으면(0장) 빈 목록으로 돌려줘 호출자가 칸마다 명시 실패하게 한다', async () => {
    const home = await tempHome();
    const spawn = vi.fn(async (): Promise<SpawnResult> => ({ code: 0, stdout: threadStarted(THREAD), stderr: '' }));
    const result = await runCodexImageSession(['p'], {}, deps(home, spawn));
    expect(result.files).toEqual([]);
  });

  it('한도 초과(종료 코드 1)는 rate_limited 로 분류하고 리셋 시각을 안내한다', async () => {
    const home = await tempHome();
    const spawn = vi.fn(async (): Promise<SpawnResult> => ({
      code: 1, stdout: '', stderr: 'You’ve hit your usage limit. Visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at Nov 4th, 2026 3:42 PM.',
    }));
    const error = await runCodexImageSession(['p'], {}, deps(home, spawn)).catch(e => e) as AgentCliError;
    expect(error).toBeInstanceOf(AgentCliError);
    expect(error.code).toBe('rate_limited');
    expect(error.message).toContain('11월 4일 15시 42분');
  });

  it('종료 코드 0 이어도 error 이벤트의 한도 초과 문구와 0장이면 rate_limited 로 알린다', async () => {
    const home = await tempHome();
    const stdout = `${threadStarted(THREAD)}{"type":"error","message":"You've hit your usage limit. try again at Nov 4th, 2026 3:42 PM."}\n`;
    const spawn = vi.fn(async (): Promise<SpawnResult> => ({ code: 0, stdout, stderr: '' }));
    const error = await runCodexImageSession(['p'], {}, deps(home, spawn)).catch(e => e) as AgentCliError;
    expect(error.code).toBe('rate_limited');
  });

  it('취소 신호와 제한 시간을 spawn 에 그대로 넘긴다', async () => {
    const home = await tempHome();
    const { spawn, calls } = fakeSpawn(home, [['exec-1.png', 5]]);
    const controller = new AbortController();
    await runCodexImageSession(['p'], { signal: controller.signal, timeoutMs: 90_000 }, deps(home, spawn));
    expect(calls[0].signal).toBe(controller.signal);
    expect(calls[0].timeoutMs).toBe(90_000);
  });
});

describe('실행 전 준비 확인', () => {
  const status = (patch: Partial<AgentCliStatus>): AgentCliStatus => ({ provider: 'codex', installed: true, loggedIn: true, available: true, ...patch });
  const check = (patch: Partial<AgentCliStatus>) => assertCodexImageReady(async () => status(patch));

  it('준비된 상태면 통과한다', async () => {
    await expect(check({})).resolves.toBeUndefined();
  });

  it('미설치 · 미로그인 · 버전 낮음은 [연결하기] 안내로 실행 전에 막는다', async () => {
    for (const patch of [
      { installed: false, loggedIn: false, available: false },
      { loggedIn: false, available: false },
      { available: false, errorCode: 'update_required' as const, detail: 'Codex CLI 0.150.0 은 낮습니다 (0.159.0 이상 필요)' },
    ]) {
      const error = await check(patch).catch(e => e) as AgentCliError;
      expect(error).toBeInstanceOf(AgentCliError);
      expect(error.message).toContain('Codex 구독 이미지는 Codex 연결이 필요합니다 — 설정에서 [연결하기]');
    }
  });

  it('버전이 낮으면 update_required 코드와 필요한 버전 안내를 함께 준다', async () => {
    const error = await check({ available: false, errorCode: 'update_required', detail: '0.159.0 이상 필요' }).catch(e => e) as AgentCliError;
    expect(error.code).toBe('update_required');
    expect(error.message).toContain('0.159.0');
  });

  it('한도 초과는 리셋 시각을 안내한다', async () => {
    const error = await check({ available: false, errorCode: 'rate_limited', detail: 'try again at Nov 4th, 2026 3:42 PM.' }).catch(e => e) as AgentCliError;
    expect(error.code).toBe('rate_limited');
    expect(error.message).toContain('11월 4일 15시 42분');
  });

  it('상태 확인 시간 초과는 로그아웃으로 몰지 않고 그대로 알린다', async () => {
    const error = await check({ installed: false, loggedIn: false, available: false, errorCode: 'timeout' }).catch(e => e) as AgentCliError;
    expect(error.code).toBe('timeout');
    expect(error.message).not.toContain('[연결하기]');
  });
});
