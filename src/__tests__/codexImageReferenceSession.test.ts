// A Codex image session with a product reference photo: the file is written into the session work folder,
// its slash path goes to the model on stdin, and the existing cleanup removes it afterwards.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCodexImageSession, type CodexImageSessionDeps } from '../image/codex/codexImageSession.js';
import { buildCodexImageInstruction } from '../image/codex/codexImageInstruction.js';
import type { SpawnArgs, SpawnResult } from '../agentCli/spawnHelper.js';

const THREAD = '01a1a02d-33ae-7ff2-96ad-237cbeb342e0';
const homes: string[] = [];
afterEach(async () => {
  await Promise.all(homes.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const reference = { buffer: PNG, fileName: 'reference-01.png' };

interface Seen { cwd?: string; stdin?: string; fileExists?: boolean; fileBytes?: Buffer }

async function setup(overrides: Partial<SpawnResult> = {}) {
  const home = await mkdtemp(join(tmpdir(), 'codex-ref-test-'));
  homes.push(home);
  const seen: Seen = {};
  const spawn = vi.fn(async (args: SpawnArgs): Promise<SpawnResult> => {
    seen.cwd = args.cwd;
    seen.stdin = args.stdin;
    const referenceFile = join(String(args.cwd), 'reference-01.png');
    seen.fileExists = existsSync(referenceFile);
    if (seen.fileExists) seen.fileBytes = await readFile(referenceFile);
    const folder = join(home, 'generated_images', THREAD);
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, 'ig_1.png'), 'png');
    return { code: 0, stdout: `${JSON.stringify({ type: 'thread.started', thread_id: THREAD })}\n`, stderr: '', ...overrides };
  });
  const deps: CodexImageSessionDeps = { spawn, env: () => ({ CODEX_HOME: home, PATH: 'x' }), now: () => Date.now() - 60_000 };
  return { spawn, deps, seen };
}

describe('runCodexImageSession — referenceImage', () => {
  it('세션 작업 폴더에 reference-01.png 를 쓰고, 지시문에 그 슬래시 경로를 넣는다', async () => {
    const { deps, seen } = await setup();
    const result = await runCodexImageSession(['scene prompt'], { referenceImage: reference }, deps);

    expect(result.threadId).toBe(THREAD);
    expect(result.files).toHaveLength(1);
    expect(seen.fileExists).toBe(true);
    expect(seen.fileBytes?.equals(PNG)).toBe(true);
    const slashPath = `${String(seen.cwd).replace(/\\/g, '/')}/reference-01.png`;
    expect(seen.stdin).toBe(buildCodexImageInstruction(['scene prompt'], slashPath));
    expect(seen.stdin).toContain(`referenced_image_paths`);
    expect(seen.stdin).toContain(`["${slashPath}"]`);
    expect(seen.stdin).not.toContain('\\');
    expect(seen.cwd).toContain('agentcli-codex-image-');
  });

  it('끝나면 작업 폴더가 참고 사진과 함께 지워진다', async () => {
    const { deps, seen } = await setup();
    await runCodexImageSession(['p'], { referenceImage: reference }, deps);
    expect(existsSync(String(seen.cwd))).toBe(false);
  });

  it('실행이 실패해도 작업 폴더(참고 사진 포함)는 지워지고, 오류는 그대로 올라온다', async () => {
    const { deps, seen } = await setup({ code: 1, stderr: 'boom', stdout: '' });
    await expect(runCodexImageSession(['p'], { referenceImage: reference }, deps)).rejects.toThrow();
    expect(seen.fileExists).toBe(true);
    expect(existsSync(String(seen.cwd))).toBe(false);
  });

  it('참고 사진이 없으면 파일도 경로도 없고 지시문은 종전 그대로다', async () => {
    const { deps, seen } = await setup();
    await runCodexImageSession(['p'], {}, deps);
    expect(seen.fileExists).toBe(false);
    expect(seen.stdin).toBe(buildCodexImageInstruction(['p']));
    expect(seen.stdin).not.toContain('referenced_image_paths');
  });

  it('여러 장 + 참고 사진은 실행 전에 오류로 멈춘다', async () => {
    const { deps, spawn } = await setup();
    await expect(runCodexImageSession(['a', 'b'], { referenceImage: reference }, deps)).rejects.toThrow(/참고 사진/);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('파일 이름에 경로가 섞여 있으면 거부한다 (작업 폴더 밖에 쓰지 않는다)', async () => {
    const { deps, spawn } = await setup();
    for (const fileName of ['../evil.png', 'sub/ref.png', 'sub\\ref.png', '']) {
      await expect(runCodexImageSession(['p'], { referenceImage: { buffer: PNG, fileName } }, deps)).rejects.toThrow(/참고 사진/);
    }
    expect(spawn).not.toHaveBeenCalled();
  });
});
