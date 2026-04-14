/**
 * domDumpManager.ts — 실패 순간 자동 DOM 덤프 시스템
 * ✅ [v1.4.54] 버그 리포트 → 진단 시간 24h → 1h 단축
 *
 * 저장 경로: %APPDATA%/BetterLifeNaver/debug-dumps/
 * 폴더 구조:
 *   {timestamp}_{account}_{action}_{errorCode}_{rand}/
 *     ├── meta.json           — 구조화 메타데이터
 *     ├── screenshot.png      — 실패 순간 전체 화면 (비밀번호 마스킹)
 *     ├── main_frame.html     — 메인 문서 HTML
 *     ├── frames.html         — 모든 iframe 결합 HTML
 *     ├── events.log          — 콘솔+네트워크+에러 시간순
 *     └── PRIVACY_REPORT.txt  — 스크럽 리포트
 */

import type { Page } from 'puppeteer';
import { promises as fs } from 'fs';
import * as fsSync from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { getDiagnosticsBuffer } from './diagnosticsBuffer.js';
import {
  scrubText,
  scrubObject,
  maskAccountId,
  generatePrivacyReport,
} from './privacyScrubber.js';

export interface DumpOptions {
  /** 실패 액션 이름 (예: "LOGIN", "PUBLISH", "IMAGE_UPLOAD") */
  action: string;
  /** 에러 코드 또는 식별자 */
  errorCode?: string;
  /** 에러 객체 */
  error?: Error;
  /** 계정 ID (마스킹 후 저장) */
  accountId?: string;
  /** 실패 단계 (1차/2차/3차/4차 폴백 중 몇 번째) */
  fallbackStage?: number;
  /** 추가 컨텍스트 (임의 데이터) */
  context?: Record<string, unknown>;
  /** 덤프 기본 경로 (test 용, 프로덕션은 app.getPath('userData')) */
  dumpRoot?: string;
}

export interface DumpResult {
  success: boolean;
  dumpPath?: string;
  error?: string;
}

const DEFAULT_MAX_DUMPS = 20;
const DEFAULT_MAX_AGE_DAYS = 7;
const DEFAULT_MAX_SIZE_MB = 200;
const HTML_SIZE_LIMIT_BYTES = 5 * 1024 * 1024; // 5MB per HTML file

/**
 * 앱의 debug-dumps 루트 경로를 반환합니다. Electron 환경이면 userData 하위, 아니면 임시 경로.
 */
export function getDumpRoot(): string {
  try {
    // Electron 환경 감지
     
    const electron = require('electron');
    const app = electron.app || electron.remote?.app;
    if (app?.getPath) {
      return path.join(app.getPath('userData'), 'debug-dumps');
    }
  } catch {
    /* Electron 환경 아님 */
  }
  return path.join(require('os').tmpdir(), 'better-life-naver-debug-dumps');
}

/**
 * 덤프 폴더 이름 생성 (타임스탬프 + 계정 + 액션 + 에러코드 + 랜덤)
 */
function buildDumpFolderName(opts: DumpOptions): string {
  const now = new Date();
  const ts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '_',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');

  const account = maskAccountId(opts.accountId);
  const action = (opts.action || 'UNKNOWN').replace(/[^A-Z0-9_]/gi, '').toUpperCase();
  const errCode = (opts.errorCode || 'E000').replace(/[^A-Z0-9_]/gi, '').toUpperCase();
  const rand = crypto.randomBytes(2).toString('hex');

  return `${ts}_${account}_${action}_${errCode}_${rand}`;
}

/**
 * HTML 크기를 제한 안으로 줄입니다 (base64 제거, script 제거)
 */
function shrinkHtml(html: string): { html: string; truncated: boolean } {
  if (!html) return { html: '', truncated: false };

  let out = html;

  // base64 data URL 제거 (이미지)
  out = out.replace(/src="data:image\/[^"]+"/gi, 'src="[base64-removed]"');
  out = out.replace(/srcset="[^"]*data:image[^"]*"/gi, 'srcset="[base64-removed]"');

  // <script> 태그 제거 (debug 태그만 유지)
  out = out.replace(/<script(?![^>]*\bid="__debug[^"]*")[^>]*>[\s\S]*?<\/script>/gi, '<!-- script removed -->');

  // 5MB 초과 시 자름
  let truncated = false;
  if (Buffer.byteLength(out, 'utf8') > HTML_SIZE_LIMIT_BYTES) {
    out = out.substring(0, HTML_SIZE_LIMIT_BYTES);
    out += '\n<!-- TRUNCATED at 5MB -->';
    truncated = true;
  }

  return { html: out, truncated };
}

/**
 * 비밀번호 필드를 임시로 마스킹합니다. (캡처 후 원복 필수)
 */
async function maskPasswordsTemporarily(page: Page): Promise<() => Promise<void>> {
  const restored: Array<{ restoreFn: () => Promise<void> }> = [];
  try {
    await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input[type="password"]')) as HTMLInputElement[];
      // 각 input에 원래 값을 data 속성으로 백업
      inputs.forEach((input, i) => {
        input.setAttribute('data-debug-orig-value', input.value);
        input.value = '';
      });
    });
  } catch {
    /* 마스킹 실패는 무시 (스크립트 차단 등) */
  }

  return async () => {
    try {
      await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input[type="password"]')) as HTMLInputElement[];
        inputs.forEach((input) => {
          const orig = input.getAttribute('data-debug-orig-value');
          if (orig !== null) {
            input.value = orig;
            input.removeAttribute('data-debug-orig-value');
          }
        });
      });
    } catch {
      /* 원복 실패는 무시 */
    }
  };
}

/**
 * 메인 덤프 함수 — 실패 순간 전체 상태를 폴더에 저장
 */
export async function dumpFailure(
  page: Page | null | undefined,
  opts: DumpOptions
): Promise<DumpResult> {
  if (!page) {
    return { success: false, error: 'page is null/undefined' };
  }

  try {
    const dumpRoot = opts.dumpRoot || getDumpRoot();
    await fs.mkdir(dumpRoot, { recursive: true });

    const folderName = buildDumpFolderName(opts);
    const dumpPath = path.join(dumpRoot, folderName);
    await fs.mkdir(dumpPath, { recursive: true });

    const totalDetections: Record<string, number> = {};
    const addDetections = (d: Record<string, number>) => {
      for (const [k, v] of Object.entries(d)) {
        totalDetections[k] = (totalDetections[k] || 0) + v;
      }
    };

    // 1) 비밀번호 임시 마스킹
    const restorePasswords = await maskPasswordsTemporarily(page);

    // 2) 스크린샷 (fullPage, PNG)
    try {
      await page.screenshot({
        path: path.join(dumpPath, 'screenshot.png') as any,
        fullPage: true,
        type: 'png',
      });
    } catch (e) {
      // 스크린샷 실패해도 다른 덤프는 진행
    }

    // 3) 메인 프레임 HTML
    try {
      const mainHtml = await page
        .evaluate(() => document.documentElement.outerHTML)
        .catch(() => '');
      const { text: scrubbed, detections } = scrubText(mainHtml);
      addDetections(detections);
      const { html: shrunk, truncated } = shrinkHtml(scrubbed);
      await fs.writeFile(
        path.join(dumpPath, 'main_frame.html'),
        shrunk,
        'utf8'
      );
      if (truncated) {
        await fs.writeFile(
          path.join(dumpPath, 'TRUNCATED.flag'),
          'main_frame.html was truncated at 5MB\n',
          'utf8'
        );
      }
    } catch {}

    // 4) 모든 iframe HTML (단일 파일에 구분자로 결합)
    try {
      const frames = page.frames();
      const parts: string[] = [];
      for (const frame of frames) {
        try {
          const url = frame.url();
          const html = await frame.evaluate(() => document.documentElement?.outerHTML || '').catch(() => '');
          if (html) {
            const { text: scrubbed, detections } = scrubText(html);
            addDetections(detections);
            parts.push(`<!-- FRAME: ${url} -->\n${scrubbed}\n<!-- /FRAME -->\n`);
          }
        } catch {}
      }
      if (parts.length > 0) {
        const combined = parts.join('\n');
        const { html: shrunk } = shrinkHtml(combined);
        await fs.writeFile(path.join(dumpPath, 'frames.html'), shrunk, 'utf8');
      }
    } catch {}

    // 5) events.log (콘솔 + 네트워크 + 페이지 에러)
    try {
      const buf = getDiagnosticsBuffer(page);
      if (buf) {
        const log = buf.toEventLog();
        // 로그 전체를 한 번 더 스크럽 (이중 안전)
        const { text: scrubbed, detections } = scrubText(log);
        addDetections(detections);
        await fs.writeFile(path.join(dumpPath, 'events.log'), scrubbed, 'utf8');
      } else {
        await fs.writeFile(
          path.join(dumpPath, 'events.log'),
          '(no diagnostics buffer attached)\n',
          'utf8'
        );
      }
    } catch {}

    // 6) meta.json (구조화 메타데이터)
    try {
      let currentUrl = '';
      let viewport: any = null;
      let userAgent = '';
      try {
        currentUrl = page.url();
        const vp = page.viewport();
        viewport = vp ? { width: vp.width, height: vp.height } : null;
        userAgent = await page.evaluate(() => navigator.userAgent).catch(() => '');
      } catch {}

      const rawMeta = {
        appVersion: process.env.npm_package_version || 'unknown',
        timestamp: new Date().toISOString(),
        account: maskAccountId(opts.accountId),
        action: opts.action,
        errorCode: opts.errorCode || null,
        errorMessage: opts.error?.message || null,
        errorStack: opts.error?.stack || null,
        fallbackStage: opts.fallbackStage || null,
        pageUrl: currentUrl,
        userAgent,
        viewport,
        context: opts.context || {},
      };

      const { data: scrubbed, detections } = scrubObject(rawMeta);
      addDetections(detections);

      await fs.writeFile(
        path.join(dumpPath, 'meta.json'),
        JSON.stringify(scrubbed, null, 2),
        'utf8'
      );
    } catch {}

    // 7) PRIVACY_REPORT.txt
    try {
      const report = generatePrivacyReport(dumpPath, totalDetections);
      await fs.writeFile(path.join(dumpPath, 'PRIVACY_REPORT.txt'), report, 'utf8');
    } catch {}

    // 8) 비밀번호 복원
    await restorePasswords();

    return { success: true, dumpPath };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

/**
 * 덤프 폴더 정리 — age → count → size 순서로 오래된 것부터 삭제
 */
export async function cleanupOldDumps(
  dumpRoot?: string,
  opts?: { maxDumps?: number; maxAgeDays?: number; maxTotalSizeMB?: number }
): Promise<{ deleted: number; remainingCount: number; remainingSizeMB: number }> {
  const root = dumpRoot || getDumpRoot();
  const maxDumps = opts?.maxDumps ?? DEFAULT_MAX_DUMPS;
  const maxAgeDays = opts?.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS;
  const maxSizeBytes = (opts?.maxTotalSizeMB ?? DEFAULT_MAX_SIZE_MB) * 1024 * 1024;

  let deleted = 0;

  try {
    const exists = await fs.stat(root).then(() => true).catch(() => false);
    if (!exists) return { deleted: 0, remainingCount: 0, remainingSizeMB: 0 };

    // 덤프 폴더 목록 + 메타 정보 수집
    interface Entry {
      name: string;
      fullPath: string;
      createdAt: number;
      sizeBytes: number;
    }

    const entries: Entry[] = [];
    const names = await fs.readdir(root);

    for (const name of names) {
      const fullPath = path.join(root, name);
      try {
        const stat = await fs.stat(fullPath);
        if (!stat.isDirectory()) continue;

        // 안전장치: meta.json 존재 확인 (덤프 폴더 증명)
        const metaPath = path.join(fullPath, 'meta.json');
        const metaExists = await fs.stat(metaPath).then(() => true).catch(() => false);
        if (!metaExists) continue;

        // 경로 안전장치: 루트의 직계 자식인지
        if (path.dirname(fullPath) !== path.resolve(root)) continue;

        // 크기 계산
        const sizeBytes = await getDirectorySize(fullPath);

        entries.push({
          name,
          fullPath,
          createdAt: stat.mtimeMs,
          sizeBytes,
        });
      } catch {}
    }

    // 오래된 순 정렬
    entries.sort((a, b) => a.createdAt - b.createdAt);

    // Stage 1: age 초과 삭제
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    const aged = entries.filter((e) => e.createdAt < cutoff);
    for (const e of aged) {
      if (await safeDelete(e.fullPath, root)) {
        deleted++;
      }
    }

    // 남은 엔트리만 필터
    const remaining = entries.filter((e) => e.createdAt >= cutoff);

    // Stage 2: count 초과 삭제 (오래된 순)
    while (remaining.length > maxDumps) {
      const oldest = remaining.shift();
      if (oldest && (await safeDelete(oldest.fullPath, root))) {
        deleted++;
      }
    }

    // Stage 3: size 초과 삭제 (오래된 순)
    let totalSize = remaining.reduce((s, e) => s + e.sizeBytes, 0);
    while (totalSize > maxSizeBytes && remaining.length > 0) {
      const oldest = remaining.shift();
      if (oldest && (await safeDelete(oldest.fullPath, root))) {
        deleted++;
        totalSize -= oldest.sizeBytes;
      }
    }

    return {
      deleted,
      remainingCount: remaining.length,
      remainingSizeMB: Math.round((totalSize / 1024 / 1024) * 10) / 10,
    };
  } catch {
    return { deleted, remainingCount: 0, remainingSizeMB: 0 };
  }
}

/**
 * 폴더 크기 계산 (재귀)
 */
async function getDirectorySize(dir: string): Promise<number> {
  let total = 0;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      try {
        if (entry.isDirectory()) {
          total += await getDirectorySize(full);
        } else {
          const stat = await fs.stat(full);
          total += stat.size;
        }
      } catch {}
    }
  } catch {}
  return total;
}

/**
 * 안전 삭제 — 경로 검증 후 rm -rf. 실패 시 false 반환.
 */
async function safeDelete(target: string, dumpRoot: string): Promise<boolean> {
  try {
    // 경로 안전 검증
    const resolvedTarget = path.resolve(target);
    const resolvedRoot = path.resolve(dumpRoot);
    if (!resolvedTarget.startsWith(resolvedRoot + path.sep)) {
      console.warn(`[DumpCleaner] 경로 밖 삭제 거부: ${resolvedTarget}`);
      return false;
    }
    // meta.json 존재 재확인
    const metaPath = path.join(target, 'meta.json');
    if (!fsSync.existsSync(metaPath)) {
      return false;
    }
    await fs.rm(target, { recursive: true, force: true });
    return true;
  } catch (e) {
    console.warn(`[DumpCleaner] 삭제 실패: ${target} — ${(e as Error).message}`);
    return false;
  }
}
