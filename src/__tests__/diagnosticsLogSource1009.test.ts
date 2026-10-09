/**
 * [2026-10-09] 전수조사 10번 — 진단 보고서의 기록 읽기: 소음 제거·실행 줄 우선·회전본·사용자 이름 가리기.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, describe, expect, it, vi } from 'vitest';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'diag1009-'));
vi.mock('electron', () => ({
  app: { getPath: () => tmp, getVersion: () => '0.0.0' },
  ipcMain: { handle: vi.fn() },
}));
vi.mock('../browserUtils.js', () => ({ getChromiumExecutablePath: async () => null }));

import { maskUserNameInPaths } from '../debug/privacyScrubber';
import { generateDiagnosticReport, setMainLogFileGetter } from '../main/ipc/diagnosticsHandlers';
import { pickProblemLogLines } from '../main/ipc/diagnosticsLogFilter';

const BS = String.fromCharCode(92);
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('진단 필터: 소음과 우선순위', () => {
  const noise = [
    '[2026-10-08T01:00:00Z] [WARN] [Config] ⚠️ primaryGeminiTextModel("x") 는 더 이상 쓰지 않습니다',
    '[2026-10-08T01:00:00Z] [WARN] [LicenseManager] ❌ 검증 실패: AbortError: This operation was aborted',
    '[2026-10-08T01:00:00Z] [WARN] performServerSync: 서버 연결 실패 (This operation was aborted)',
    '[2026-10-08T01:00:00Z] [LOG] 프록시 ❌ 비활성',
    '[2026-10-08T01:00:00Z] [LOG] AdsPower ❌ 비활성',
    '[2026-10-08T01:00:00Z] [LOG] 엔진 실패 시 동작: 중단',
    '[2026-10-08T01:00:00Z] [WARN] [Wipe] ⚠️ 폴더 삭제 실패 EBUSY',
    '[2026-10-08T01:00:00Z] [WARN] Another instance is already running',
  ];
  const keep = [
    '[2026-10-08T01:00:00Z] [ERROR] [Config] 설정 파일 읽기 실패',
    '[2026-10-08T01:00:00Z] [WARN] [LicenseManager] ❌ 검증 실패: fetch failed',
  ];

  it('실제 소음 줄은 빠지고 설정 읽기 실패·fetch failed 는 남는다', () => {
    expect(pickProblemLogLines([...noise, ...keep])).toEqual(keep);
  });

  it('상한을 넘으면 실행 줄을 먼저 남기고 원래 순서로 정렬한다', () => {
    const lines: string[] = [];
    const runs = [10, 80, 200, 300, 399].map((i) => `[RunEnd] ❌ 발행 실패(NETWORK_WAIT) run${i}`);
    for (let i = 0; i < 400; i++) {
      const runIdx = [10, 80, 200, 300, 399].indexOf(i);
      lines.push(runIdx >= 0 ? runs[runIdx] : `❌ 기타 실패 ${i}`);
    }
    const picked = pickProblemLogLines(lines, 300);
    expect(picked).toHaveLength(300);
    expect(picked.filter((l) => l.startsWith('[RunEnd]'))).toEqual(runs);
    expect(picked[picked.length - 1]).toBe(runs[4]);
  });

  it('[RunEnd]·[AccountGuard] 는 ❌ 가 없어도 고른다', () => {
    const lines = ['[RunEnd] 끝남', '[AccountGuard] 확인', '그냥 줄'];
    expect(pickProblemLogLines(lines)).toEqual(['[RunEnd] 끝남', '[AccountGuard] 확인']);
  });

  it('한 줄은 500자에서 자른다', () => {
    expect(pickProblemLogLines([`❌ ${'가'.repeat(900)}`])[0]).toHaveLength(500);
  });
});

describe('maskUserNameInPaths', () => {
  it('세 가지 윈도 모양과 맥·리눅스 경로를 가린다', () => {
    expect(maskUserNameInPaths(`C:${BS}Users${BS}홍길동${BS}Downloads${BS}a.jpg`)).toBe(`C:${BS}Users${BS}<사용자>${BS}Downloads${BS}a.jpg`);
    expect(maskUserNameInPaths('C:/Users/홍길동/Downloads/naver-blog-images/a.jpg')).toBe('C:/Users/<사용자>/Downloads/naver-blog-images/a.jpg');
    expect(maskUserNameInPaths(`path=C:${BS}${BS}Users${BS}${BS}홍길동${BS}${BS}AppData${BS}${BS}x`)).toBe(`path=C:${BS}${BS}Users${BS}${BS}<사용자>${BS}${BS}AppData${BS}${BS}x`);
    expect(maskUserNameInPaths(`unlink 'c:${BS}users${BS}John Smith${BS}AppData${BS}x'`)).toBe(`unlink 'c:${BS}users${BS}<사용자>${BS}AppData${BS}x'`);
    const unix = maskUserNameInPaths('/Users/hong/Library/a.png and /home/hong/a.png');
    expect(unix).toBe('/Users/<사용자>/Library/a.png and /home/<사용자>/a.png');
    expect(maskUserNameInPaths('file:///C:/Users/홍길동/a.png')).not.toContain('홍길동');
  });
  it('프로그램 설치 경로는 그대로 둔다', () => {
    const p = `C:${BS}Program Files${BS}Better Life Naver${BS}resources${BS}app.asar`;
    expect(maskUserNameInPaths(p)).toBe(p);
  });
});

describe('진단 보고서: 회전본까지 읽는다', () => {
  it('.1 에만 있는 실패 줄과 기록 파일 이름이 보이고 사용자 이름은 없다', async () => {
    const logs = path.join(tmp, 'logs');
    fs.mkdirSync(logs, { recursive: true });
    const current = path.join(logs, 'main-2026-10-08.log');
    fs.writeFileSync(`${current}.1`, `[t] [LOG] ❌ 회전본에만 있는 실패 줄 C:/Users/홍길동/Downloads/a.jpg\n`);
    fs.writeFileSync(current, '[t] [LOG] ✅ 정상 줄\n');
    setMainLogFileGetter(() => current);
    const { report } = await generateDiagnosticReport();
    expect(report).toContain('기록 파일: main-2026-10-08.log (+.1)');
    expect(report).toContain('회전본에만 있는 실패 줄');
    expect(report).toContain('----- 오늘 기록 중 오류·경고 줄');
    expect(report).toContain('----- 최근 로그 (main, 마지막 500줄) -----');
    expect(report).not.toContain('홍길동');
    expect(report).toContain('C:/Users/<사용자>/Downloads/a.jpg');
    setMainLogFileGetter(() => null);
  });

  it('파일마다 끝 8MB만 읽는다(잘린 첫 줄은 버림)', async () => {
    const logs = path.join(tmp, 'logs');
    const current = path.join(logs, 'main-2026-10-07.log');
    const old = '❌ 아주 오래된 줄\n';
    const filler = `${'가'.repeat(99)}\n`;
    fs.writeFileSync(current, old + filler.repeat(Math.ceil((9 * 1024 * 1024) / Buffer.byteLength(filler))) + '❌ 마지막 줄\n');
    setMainLogFileGetter(() => current);
    const { report } = await generateDiagnosticReport();
    expect(report).not.toContain('아주 오래된 줄');
    expect(report).toContain('마지막 줄');
    setMainLogFileGetter(() => null);
  });
});
