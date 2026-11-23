// src/main/services/generationStopStore.ts
// Saves "generation stopped here" records in the user-data folder so a stopped run can be continued after the app is
// closed and opened again, and so the main process (daily auto-publisher, tray) can leave one when no window can be asked.

import { randomBytes } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { renameWithRetry } from '../../automation/safeStateRename.js';
import { gstopParseRecords, type GstopRecord } from '../../generationStop/resumeRecord.js';

const FILE_NAME = 'generation-stops-v1.json';
const MAX_RECORDS = 20;
const MAX_BYTES = 8_000_000;

async function readAll(file: string): Promise<GstopRecord[]> {
  try {
    const content = await readFile(file, 'utf8');
    if (Buffer.byteLength(content) > MAX_BYTES) return [];
    return gstopParseRecords((JSON.parse(content) as { records?: unknown }).records);
  } catch { return []; }
}

async function writeAll(file: string, records: readonly GstopRecord[]): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify({ version: 1, records }), 'utf8');
    renameWithRetry(temporary, file);
  } finally { await unlink(temporary).catch(() => undefined); }
}

export function createGenerationStopStore(directory: string) {
  const file = path.join(directory, FILE_NAME);
  // Saves and removals queue behind each other so two quick stops cannot overwrite one another.
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const turn = chain.then(work);
    chain = turn.catch(() => undefined);
    return turn;
  };
  return {
    list: (): Promise<GstopRecord[]> => serial(() => readAll(file)),
    save: (record: GstopRecord): Promise<void> => serial(async () => {
      const others = (await readAll(file)).filter((entry) => entry.id !== record.id);
      await writeAll(file, [...others, record].sort((a, b) => a.createdAt - b.createdAt).slice(-MAX_RECORDS));
    }),
    remove: (id: string): Promise<void> => serial(async () => {
      await writeAll(file, (await readAll(file)).filter((entry) => entry.id !== id));
    }),
  };
}
export type GenerationStopStore = ReturnType<typeof createGenerationStopStore>;

export interface GenerationStopIpcDeps {
  readonly store: GenerationStopStore;
  /** Desktop notification (title, body): the owner is told when no window could be asked. */
  readonly notify: (title: string, body: string) => void;
}

/** Plain async handlers; main.ts binds them to ipcMain so tests can call them directly. */
export function createGenerationStopIpc(deps: GenerationStopIpcDeps) {
  return {
    list: async (): Promise<{ success: true; records: GstopRecord[] }> => ({ success: true, records: await deps.store.list() }),
    save: async (record: GstopRecord, options: { notify?: boolean }): Promise<{ success: boolean; message?: string }> => {
      const [valid] = gstopParseRecords([record]);
      if (!valid) return { success: false, message: '이어 가기 기록 형식이 올바르지 않습니다.' };
      await deps.store.save(valid);
      if (options?.notify) deps.notify('발행이 멈췄어요', `${valid.summary} — 앱을 열어 [이어서 발행]을 눌러 주세요.`);
      return { success: true };
    },
    remove: async (id: string): Promise<{ success: true }> => {
      await deps.store.remove(String(id || ''));
      return { success: true };
    },
  };
}
