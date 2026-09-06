// src/main/ipc/imageDiversityHandler.ts
// `image:diversityReport` — aHash the post's image files and report pairwise Hamming
// distances so the renderer can log `[ImageDiversity]` before publishing. This is a
// measurement channel only: it never blocks, and every failure degrades to null.

import { ipcMain, app } from 'electron';
import * as fsp from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { IpcContext } from '../types';
import { assertPathWithinAllowedRoots } from './imageHandlers.js';
import { computeAHash64 } from '../../image/imageHashUtils.js';
import {
  buildImageDiversityReport,
  formatImageDiversitySummary,
  type ImageDiversityReport,
} from '../../image/imageDiversityReport.js';

const MAX_IMAGE_PATHS = 24;
const LOG_FILE_NAME = 'image-diversity.jsonl';

interface DiversityReportPayload {
  paths?: unknown;
  postTitle?: unknown;
}

export interface DiversityReportResult extends ImageDiversityReport {
  summary: string;
  skipped: number[];
}

function safeHandle(channel: string, handler: (...args: any[]) => any): void {
  try {
    ipcMain.handle(channel, handler);
  } catch {
    console.log(`[imageDiversityHandler] ⏭️ ${channel} — 이미 등록됨, 건너뛰기`);
  }
}

// Generated/collected images live under the app home, userData, or the OS temp dir.
function allowedImageRoots(): string[] {
  return [
    path.join(os.homedir(), '.naver-blog-automation'),
    app.getPath('pictures'),
    app.getPath('downloads'),
  ];
}

async function hashImagePath(
  targetPath: string,
  index: number,
  skipped: number[],
): Promise<bigint | null> {
  try {
    assertPathWithinAllowedRoots(targetPath, `image:diversityReport[${index}]`, allowedImageRoots());
    const buffer = await fsp.readFile(targetPath);
    return await computeAHash64(buffer);
  } catch (error) {
    skipped.push(index);
    console.warn(`[imageDiversityHandler] 해시 건너뜀 [${index}]: ${(error as Error).message}`);
    return null;
  }
}

async function appendJsonlRecord(record: Record<string, unknown>): Promise<void> {
  try {
    const logDir = path.join(app.getPath('userData'), 'logs');
    await fsp.mkdir(logDir, { recursive: true });
    await fsp.appendFile(path.join(logDir, LOG_FILE_NAME), `${JSON.stringify(record)}\n`, 'utf8');
  } catch (error) {
    console.warn(`[imageDiversityHandler] jsonl 기록 실패: ${(error as Error).message}`);
  }
}

function normalizePaths(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .slice(0, MAX_IMAGE_PATHS);
}

export async function buildDiversityReportForPaths(
  paths: string[],
  postTitle: string,
): Promise<DiversityReportResult> {
  const skipped: number[] = [];
  const hashes = await Promise.all(paths.map((p, index) => hashImagePath(p, index, skipped)));
  const report = buildImageDiversityReport(hashes);
  const summary = formatImageDiversitySummary(report);
  await appendJsonlRecord({
    at: new Date().toISOString(),
    postTitle: postTitle.slice(0, 120),
    ...report,
    skipped,
    files: paths.map((p) => path.basename(p)),
  });
  return { ...report, summary, skipped };
}

export function registerImageDiversityHandler(_ctx: IpcContext): void {
  safeHandle('image:diversityReport', async (_event, payload: DiversityReportPayload) => {
    try {
      const paths = normalizePaths(payload?.paths);
      const postTitle = typeof payload?.postTitle === 'string' ? payload.postTitle : '';
      if (paths.length < 2) return null;
      return await buildDiversityReportForPaths(paths, postTitle);
    } catch (error) {
      console.warn(`[imageDiversityHandler] 리포트 실패: ${(error as Error).message}`);
      return null;
    }
  });
  console.log('[imageDiversityHandler] ✅ image:diversityReport 등록');
}
