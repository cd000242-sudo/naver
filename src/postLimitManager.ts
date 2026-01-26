import { app } from 'electron';
import fs from 'fs/promises';
import path from 'path';

interface PostLimitState {
  date: string;
  count: number;
}

let dailyLimit = Number(process.env.DAILY_POST_LIMIT ?? 3);

// 지연 초기화: app.getPath는 app이 ready된 후에만 사용 가능
function getStorageFile(): string {
  try {
    return path.join(app.getPath('userData'), 'post-limit.json');
  } catch {
    // app이 아직 ready되지 않은 경우 임시 경로 사용
    return path.join(process.cwd(), 'post-limit.json');
  }
}

async function readState(): Promise<PostLimitState> {
  try {
    const storageFile = getStorageFile();
    const raw = await fs.readFile(storageFile, 'utf-8');
    const parsed = JSON.parse(raw) as PostLimitState;
    if (!parsed || typeof parsed.date !== 'string' || typeof parsed.count !== 'number') {
      throw new Error('Invalid state');
    }
    return parsed;
  } catch {
    return {
      date: new Date().toISOString().slice(0, 10),
      count: 0,
    };
  }
}

async function writeState(state: PostLimitState): Promise<void> {
  const storageFile = getStorageFile();
  await fs.mkdir(path.dirname(storageFile), { recursive: true });
  await fs.writeFile(storageFile, JSON.stringify(state), 'utf-8');
}

export async function getTodayCount(): Promise<number> {
  const state = await readState();
  const today = new Date().toISOString().slice(0, 10);
  if (state.date !== today) {
    return 0;
  }
  return state.count;
}

export function getDailyLimit(): number {
  return dailyLimit;
}

export function setDailyLimit(limit: number): void {
  if (Number.isFinite(limit) && limit >= 0) {
    dailyLimit = Math.floor(limit);
    process.env.DAILY_POST_LIMIT = String(dailyLimit);
  }
}

export async function incrementTodayCount(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const state = await readState();
  if (state.date !== today) {
    const nextState: PostLimitState = { date: today, count: 1 };
    await writeState(nextState);
    return nextState.count;
  }
  const nextState: PostLimitState = { date: today, count: state.count + 1 };
  await writeState(nextState);
  return nextState.count;
}

export async function resetCount(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  await writeState({ date: today, count: 0 });
}

