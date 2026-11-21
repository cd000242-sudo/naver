// runGeminiCliImageSession with a reference photo: the cleaned PNG is written into the session's work folder (cwd) as
// reference-01.png BEFORE agy starts, the instruction carries the reference sentence, and the folder is removed after.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runGeminiCliImageSession, type GeminiCliImageSessionDeps } from '../image/geminiCli/geminiCliImageSession.js';
import { buildGeminiCliImageInstruction } from '../image/geminiCli/geminiCliImageInstruction.js';
import { listGeneratedImages } from '../image/codex/codexImageFiles.js';
import type { SpawnArgs, SpawnResult } from '../agentCli/spawnHelper.js';

const PARENT = '5f0c8a3e-1b2d-4c6e-9a7f-0d1e2f3a4b5c';
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const reference = { buffer: PNG, fileName: 'reference-01.png' };
const dirs: string[] = [];
async function tempHome(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'gemini-ref-test-'));
  dirs.push(dir);
  return dir;
}
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

const ndjson = (...events: unknown[]): string => `${events.map((event) => JSON.stringify(event)).join('\n')}\n`;
const successOut = (): string => ndjson(
  { event: 'init', conversation_id: PARENT, init: { model: 'gemini-3.8-flash-low' } },
  { event: 'result', result: { conversation_id: PARENT, status: 'SUCCESS', response: 'teapot_1.jpg\n' } },
);

interface Seen { cwd: string; listing: string[]; referenceBytes: Buffer | null; stdin: string }

/** A fake `agy`: records what the work folder held when it started, then drops one result picture. */
function fakeSpawn(home: string, overrides: Partial<SpawnResult> = {}) {
  const seen: Seen[] = [];
  const spawn = vi.fn(async (args: SpawnArgs): Promise<SpawnResult> => {
    const cwd = String(args.cwd);
    const referencePath = join(cwd, 'reference-01.png');
    seen.push({
      cwd,
      listing: await readdir(cwd),
      referenceBytes: existsSync(referencePath) ? await readFile(referencePath) : null,
      stdin: String(args.stdin),
    });
    const brain = join(home, '.gemini', 'antigravity-cli', 'brain', PARENT);
    await mkdir(brain, { recursive: true });
    await writeFile(join(brain, 'teapot_1.jpg'), 'img');
    return { code: 0, stdout: successOut(), stderr: '', ...overrides };
  });
  return { spawn, seen };
}
const makeDeps = (home: string, spawn: GeminiCliImageSessionDeps['spawn']): GeminiCliImageSessionDeps => ({
  spawn, env: () => ({ USERPROFILE: home, PATH: 'x' }), now: () => Date.now() - 60_000, listImages: listGeneratedImages,
});

describe('runGeminiCliImageSession - 참고 사진', () => {
  it('agy 를 시작하기 전에 참고 사진을 작업 폴더에 reference-01.png 로 쓴다 (정리된 바이트 그대로)', async () => {
    const home = await tempHome();
    const { spawn, seen } = fakeSpawn(home);
    const result = await runGeminiCliImageSession('draw a teapot', { referenceImage: reference }, makeDeps(home, spawn));
    expect(result.files).toHaveLength(1);
    expect(seen).toHaveLength(1);
    expect(seen[0].listing).toEqual(['reference-01.png']);
    expect(seen[0].referenceBytes?.equals(PNG)).toBe(true);
  });

  it('지시문(stdin)에 참조 문장과 파일 이름이 들어가고, agy 의 작업 폴더가 곧 참고 사진이 있는 폴더다', async () => {
    const home = await tempHome();
    const { spawn, seen } = fakeSpawn(home);
    await runGeminiCliImageSession('draw a teapot\nASPECT RATIO: portrait 3:4.', { referenceImage: reference }, makeDeps(home, spawn));
    expect(seen[0].stdin).toBe(buildGeminiCliImageInstruction('draw a teapot\nASPECT RATIO: portrait 3:4.', 'reference-01.png'));
    expect(seen[0].stdin).toContain('Use the product photo reference-01.png in the current folder as the reference image input');
    expect(spawn.mock.calls[0][0].cwd).toBe(seen[0].cwd);
  });

  it('끝나면 작업 폴더(참고 사진 포함)를 지운다', async () => {
    const home = await tempHome();
    const { spawn, seen } = fakeSpawn(home);
    await runGeminiCliImageSession('p', { referenceImage: reference }, makeDeps(home, spawn));
    expect(existsSync(seen[0].cwd)).toBe(false);
  });

  it('실행이 실패해도 작업 폴더를 지운다', async () => {
    const home = await tempHome();
    const { spawn, seen } = fakeSpawn(home, { code: 1, stderr: 'boom' });
    await expect(runGeminiCliImageSession('p', { referenceImage: reference }, makeDeps(home, spawn))).rejects.toBeTruthy();
    expect(existsSync(seen[0].cwd)).toBe(false);
  });

  it('참고 사진이 없으면 작업 폴더는 비어 있고 지시문도 지금 그대로다', async () => {
    const home = await tempHome();
    const { spawn, seen } = fakeSpawn(home);
    await runGeminiCliImageSession('draw a teapot', {}, makeDeps(home, spawn));
    expect(seen[0].listing).toEqual([]);
    expect(seen[0].stdin).toBe(buildGeminiCliImageInstruction('draw a teapot'));
    expect(seen[0].stdin).not.toContain('reference-01.png');
  });

  it('참고 사진 바이트가 비어 있으면 agy 를 시작하지 않고 멈춘다 (참고 없이 그리지 않는다)', async () => {
    const home = await tempHome();
    const { spawn } = fakeSpawn(home);
    await expect(
      runGeminiCliImageSession('p', { referenceImage: { buffer: Buffer.alloc(0), fileName: 'reference-01.png' } }, makeDeps(home, spawn)),
    ).rejects.toThrow(/참고 사진/);
    expect(spawn).not.toHaveBeenCalled();
  });

  it.each(['../evil.png', 'a/b.png', 'a\\b.png', '', '..'])('참고 파일 이름 "%s" 는 작업 폴더 밖으로 나갈 수 있어 거부한다 (agy 를 시작하지 않는다)', async (fileName) => {
    const home = await tempHome();
    const { spawn } = fakeSpawn(home);
    await expect(
      runGeminiCliImageSession('p', { referenceImage: { buffer: PNG, fileName } }, makeDeps(home, spawn)),
    ).rejects.toThrow(/참고 사진 파일 이름/);
    expect(spawn).not.toHaveBeenCalled();
  });
});
