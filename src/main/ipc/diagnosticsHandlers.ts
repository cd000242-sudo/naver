/**
 * One-click diagnostic report.
 *
 * Breaks the "works on my machine → release → customer broken → no data → guess
 * again" loop. On a publish failure (or on demand) this captures the exact data
 * needed to diagnose environment-specific bugs — app version, OS, WHICH browser
 * the client used (the #1 dev/deploy variable), and the tail of the main log —
 * into a text file on the Desktop the customer can simply send.
 */
import { ipcMain, app } from 'electron';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { getChromiumExecutablePath } from '../../browserUtils.js';

function readRecentMainLog(maxLines = 500): string {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const logFile = path.join(app.getPath('userData'), 'logs', `main-${today}.log`);
    if (!fs.existsSync(logFile)) return '(오늘 날짜 로그 파일이 없습니다)';
    const lines = fs.readFileSync(logFile, 'utf8').split('\n');
    return lines.slice(-maxLines).join('\n');
  } catch (e) {
    return `(로그 읽기 실패: ${(e as Error).message})`;
  }
}

async function describeBrowser(): Promise<string[]> {
  const out: string[] = [];
  try {
    const browserPath = await getChromiumExecutablePath();
    out.push(`발행 브라우저 경로: ${browserPath || '없음 → 최초 발행 시 자동 다운로드 대상'}`);
    const isSystem = !!browserPath && /Program Files|Google\\Chrome|Google Chrome/i.test(browserPath);
    const isManaged = !!browserPath && /browsers[\\/]chrome/i.test(browserPath);
    out.push(`브라우저 종류: ${isSystem ? '시스템 Chrome' : isManaged ? '자동설치 Chrome' : browserPath ? '기타/번들' : '없음'}`);
  } catch (e) {
    out.push(`브라우저 확인 실패: ${(e as Error).message}`);
  }
  out.push(`PUPPETEER_EXECUTABLE_PATH: ${process.env.PUPPETEER_EXECUTABLE_PATH || '(미설정)'}`);
  return out;
}

export async function generateDiagnosticReport(context?: { lastError?: string; stage?: string }): Promise<{ ok: boolean; savedPath: string; report: string }> {
  // [2026-07-03 FIX] 헤더 시각을 KST로 표기 — 기존 UTC(Z) 표기가 실제 로컬(한국) 시간과 9시간
  //   차이나 사용자가 혼동(예: 오전 7시인데 22시로 보임). 로그 파일 조회(readRecentMainLog)는
  //   로거 파일명 규약과 맞춰야 하므로 건드리지 않고, 표시 시각만 KST로 변환한다.
  const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
  const lines: string[] = [];
  lines.push('===== Better Life Naver 진단 리포트 =====');
  lines.push(`생성시각: ${nowKst} (KST)`);
  lines.push(`앱 버전: ${app.getVersion()}`);
  lines.push(`OS: ${process.platform} ${os.release()} (${os.arch()})`);
  try {
    lines.push(`CPU: ${os.cpus()[0]?.model ?? '?'} x${os.cpus().length}`);
    lines.push(`메모리: ${Math.round(os.totalmem() / 1e9)}GB`);
  } catch { /* best-effort */ }
  lines.push(...(await describeBrowser()));
  if (context?.stage) lines.push(`실패 단계: ${context.stage}`);
  if (context?.lastError) {
    lines.push('');
    lines.push('----- 마지막 오류 -----');
    lines.push(context.lastError);
  }
  lines.push('');
  lines.push('----- 최근 로그 (main, 마지막 500줄) -----');
  lines.push(readRecentMainLog());
  const report = lines.join('\n');

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
  const fileName = `BetterLifeNaver-진단리포트-${stamp}.txt`;
  let savedPath = '';
  for (const baseDir of ['desktop', 'userData'] as const) {
    try {
      const candidate = path.join(app.getPath(baseDir), fileName);
      fs.writeFileSync(candidate, report, 'utf8');
      savedPath = candidate;
      break;
    } catch {
      // try next location
    }
  }
  return { ok: !!savedPath, savedPath, report };
}

export function registerDiagnosticsHandlers(): void {
  ipcMain.handle('diagnostics:generateReport', async (_e, context?: { lastError?: string; stage?: string }) => {
    try {
      return await generateDiagnosticReport(context);
    } catch (e) {
      return { ok: false, savedPath: '', report: `진단 리포트 생성 실패: ${(e as Error).message}` };
    }
  });
}
