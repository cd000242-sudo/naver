import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGenerationStopStore, createGenerationStopIpc } from '../main/services/generationStopStore.js';
import { gstopBuildRecord } from '../generationStop/resumeRecord.js';

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });
async function tempDir(): Promise<string> { const dir = await mkdtemp(join(tmpdir(), 'gstop-')); dirs.push(dir); return dir; }
const info = { stage: 'image', cause: 'limit', engine: 'codex-image', detail: 'x' } as const;
const rec = (id: string, kind: 'continuous' | 'daily' = 'continuous') => gstopBuildRecord({ kind, info, label: id, now: 1, id });

describe('이어 가기 기록 저장소(앱을 껐다 켜도 남는다)', () => {
  it('저장한 기록은 새 저장소 객체(재시작)에서도 읽힌다', async () => {
    const dir = await tempDir();
    await createGenerationStopStore(dir).save(rec('a'));
    const reopened = await createGenerationStopStore(dir).list();
    expect(reopened.map((r) => r.id)).toEqual(['a']);
  });

  it('같은 id 는 덮어쓰고, 지우면 사라진다', async () => {
    const store = createGenerationStopStore(await tempDir());
    await store.save(rec('a')); await store.save({ ...rec('a'), label: 'new' }); await store.save(rec('b'));
    expect((await store.list()).find((r) => r.id === 'a')?.label).toBe('new');
    await store.remove('a');
    expect((await store.list()).map((r) => r.id)).toEqual(['b']);
  });

  it('깨진 파일은 빈 목록으로 읽는다(앱이 안 죽는다)', async () => {
    const dir = await tempDir();
    await writeFile(join(dir, 'generation-stops-v1.json'), '{not json');
    expect(await createGenerationStopStore(dir).list()).toEqual([]);
  });

  it('기록이 너무 많이 쌓이지 않는다(최근 20개)', async () => {
    const store = createGenerationStopStore(await tempDir());
    for (let i = 0; i < 25; i++) await store.save({ ...rec(`r${i}`), createdAt: i });
    const ids = (await store.list()).map((r) => r.id);
    expect(ids).toHaveLength(20);
    expect(ids).toContain('r24');
    expect(ids).not.toContain('r0');
  });

  it('파일은 사용자 데이터 폴더 안에 하나로 저장된다', async () => {
    const dir = await tempDir();
    await createGenerationStopStore(dir).save(rec('a'));
    expect(JSON.parse(await readFile(join(dir, 'generation-stops-v1.json'), 'utf8')).records).toHaveLength(1);
  });
});

describe('IPC 처리기', () => {
  it('save → list → remove, 그리고 저장하면 알림 콜백이 한 번 불린다', async () => {
    const store = createGenerationStopStore(await tempDir());
    const notify = vi.fn();
    const ipc = createGenerationStopIpc({ store, notify });
    expect(await ipc.save(rec('a'), { notify: true })).toEqual({ success: true });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][1]).toContain('이미지 생성이 멈췄어요');
    expect((await ipc.list()).records).toHaveLength(1);
    await ipc.remove('a');
    expect((await ipc.list()).records).toEqual([]);
  });

  it('잘못된 기록은 저장하지 않고 실패로 답한다', async () => {
    const ipc = createGenerationStopIpc({ store: createGenerationStopStore(await tempDir()), notify: vi.fn() });
    expect((await ipc.save({ id: 5 } as never, {})).success).toBe(false);
  });
});
