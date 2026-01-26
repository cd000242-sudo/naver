import { app } from 'electron';
import fs from 'fs/promises';
import path from 'path';

export type QuotaType = 'publish' | 'content' | 'media';

export type QuotaLimits = {
  publish: number;
  content: number;
  media: number;
};

export type QuotaUsage = {
  publish: number;
  content: number;
  media: number;
};

export type QuotaStatus = {
  date: string;
  limits: QuotaLimits;
  usage: QuotaUsage;
  isPaywalled: boolean;
};

interface QuotaState extends QuotaUsage {
  date: string;
}

function getLocalDateKey(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getStorageFile(): string {
  try {
    return path.join(app.getPath('userData'), 'quota-state.json');
  } catch {
    return path.join(process.cwd(), 'quota-state.json');
  }
}

async function readState(): Promise<QuotaState> {
  const today = getLocalDateKey();
  try {
    const storageFile = getStorageFile();
    const raw = await fs.readFile(storageFile, 'utf-8');
    const parsed = JSON.parse(raw) as QuotaState;

    if (!parsed || typeof parsed.date !== 'string') {
      throw new Error('Invalid state');
    }

    if (parsed.date !== today) {
      return { date: today, publish: 0, content: 0, media: 0 };
    }

    return {
      date: parsed.date,
      publish: Number(parsed.publish) || 0,
      content: Number(parsed.content) || 0,
      media: Number(parsed.media) || 0,
    };
  } catch {
    return { date: today, publish: 0, content: 0, media: 0 };
  }
}

async function writeState(state: QuotaState): Promise<void> {
  const storageFile = getStorageFile();
  await fs.mkdir(path.dirname(storageFile), { recursive: true });
  await fs.writeFile(storageFile, JSON.stringify(state, null, 2), 'utf-8');
}

export async function getUsageToday(type: QuotaType): Promise<number> {
  const state = await readState();
  return state[type];
}

export async function getStatus(limits: QuotaLimits): Promise<QuotaStatus> {
  const state = await readState();
  return {
    date: state.date,
    limits,
    usage: {
      publish: state.publish,
      content: state.content,
      media: state.media,
    },
    // ✅ 발행 쿼터만 체크 (글생성+발행 = 1세트)
    isPaywalled: state.publish >= limits.publish,
  };
}

export async function canConsume(type: QuotaType, limits: QuotaLimits, amount: number = 1): Promise<boolean> {
  const state = await readState();
  const next = state[type] + amount;
  return next <= limits[type];
}

export async function consume(type: QuotaType, amount: number = 1): Promise<QuotaState> {
  const today = getLocalDateKey();
  const state = await readState();
  const base: QuotaState = state.date === today ? state : { date: today, publish: 0, content: 0, media: 0 };

  const next: QuotaState = {
    ...base,
    [type]: (base[type] || 0) + amount,
  } as QuotaState;

  await writeState(next);
  return next;
}

export async function resetAll(): Promise<void> {
  const today = getLocalDateKey();
  await writeState({ date: today, publish: 0, content: 0, media: 0 });
}
