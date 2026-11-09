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
import { summarizePublishStart } from '../main/ipc/diagnosticsPublishStart';

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

describe('진단 보고서: 마지막 발행 시작 요약', () => {
  const HEADER = '----- 마지막 발행 시작 요약';
  const publish = (tag: string, places: number): string[] => [
    `[t] [LOG] [+1.0s] 🗺️ [장소] ${places}곳 배치 계획: "${tag}" → 1번 소제목(name-mention)`,
    `[t] [LOG] [+1.0s] 🧾 [구조 진단] 소제목 2개 · 전달 이미지 3개 · strategy=미지정 · manualEdited=true`,
    `[t] [LOG] [+1.0s]       [2] heading="둘째 ${tag}" file=b.png saved=(없음) url=(없음)`,
    `[t] [LOG] [+1.0s]    🔎 [대표사진 추적] thumbnailPath=data:(5000자) · images 중 isThumbnail=0개`,
    `[t] [LOG] [+1.0s]       [1] heading="첫째 ${tag}" file=a.png saved=(없음) url=(없음)`,
    `[t] [LOG] [+1.0s]    🔎 [장소 추적] payload places=${places}곳 · placeName=(없음)`,
    `[t] [LOG] [+9.0s] 관련 없는 잡음 줄 ${tag}`,
    `[t] [LOG] [+9.5s]    🔁[중복제거] 이미 삽입된 이미지 1개 제외 (${tag})`,
  ];
  const section = (report: string): string => {
    const start = report.indexOf(HEADER);
    expect(start).toBeGreaterThanOrEqual(0);
    const next = report.indexOf('\n-----', start + HEADER.length);
    return report.slice(start, next < 0 ? undefined : next);
  };

  it('마지막 발행의 진단 줄만 모으고 앞선 발행과 잡음은 뺀다', () => {
    // A real publish logs hundreds of lines between two runs.
    const gap = Array.from({ length: 60 }, (_, i) => `[t] [LOG] 중간 잡음 ${i}`);
    const picked = summarizePublishStart([...publish('FIRSTRUN', 7), ...gap, ...publish('LASTRUN', 1)]).join('\n');
    expect(picked).toContain('LASTRUN');
    expect(picked).toContain('payload places=1곳');
    expect(picked).toContain('[1] heading="첫째 LASTRUN" file=a.png');
    expect(picked).toContain('[중복제거]');
    expect(picked).not.toContain('FIRSTRUN');
    expect(picked).not.toContain('잡음');
  });

  it('병렬 기록으로 [구조 진단] 줄보다 앞에 찍힌 형제 줄도 같은 발행으로 묶는다', () => {
    // Observed in a real log: [대표사진 추적], [n] heading= and [장소 추적] landed BEFORE [구조 진단].
    const picked = summarizePublishStart([
      '[t] [LOG] 이전 줄',
      '[t] [LOG] 🔎 [대표사진 추적] thumbnailPath=data:(367722자) · images 중 isThumbnail=1개',
      '[t] [LOG]       [1] heading="🖼️ 썸네일" file=a.png saved=(없음) url=(없음)',
      '[t] [LOG] 🔎 [장소 추적] payload places=1곳 · placeName=(없음)',
      '[t] [LOG] 🧾 [구조 진단] 소제목 6개 · 전달 이미지 7개',
      '[t] [LOG] 🔁[중복제거] 이미 삽입된 이미지 1개 제외',
    ]).join('\n');
    expect(picked).toContain('[대표사진 추적]');
    expect(picked).toContain('[1] heading="🖼️ 썸네일" file=a.png');
    expect(picked).toContain('payload places=1곳');
    expect(picked).toContain('[중복제거]');
    expect(picked).not.toContain('이전 줄');
  });

  it('base64 본문은 자르고 한 줄은 300자를 넘지 않는다', () => {
    const b64 = 'A'.repeat(5000);
    const picked = summarizePublishStart([
      '[t] [LOG] 🧾 [구조 진단] 소제목 1개',
      `[t] [LOG] 🔎 [대표사진 추적] thumbnailPath=data:image/jpeg;base64,${b64} · images 중 isThumbnail=1개`,
      `[t] [LOG] 🔎 [장소 추적] ${'가'.repeat(900)}`,
    ]);
    expect(picked).toHaveLength(3);
    for (const line of picked) expect(line.length).toBeLessThanOrEqual(300);
    expect(picked.join('\n')).not.toContain('A'.repeat(100));
    expect(picked[1]).toContain('isThumbnail=1개');
  });

  it('80줄을 넘으면 앞뒤를 남기고 중간 생략을 알린다', () => {
    const lines = ['[t] [LOG] 🧾 [구조 진단] 시작'];
    for (let i = 0; i < 200; i++) lines.push(`[t] [LOG] 🔁[중복제거] 제외 번호${i}`);
    const picked = summarizePublishStart(lines);
    expect(picked).toHaveLength(80);
    expect(picked[0]).toContain('[구조 진단]');
    expect(picked[picked.length - 1]).toContain('번호199');
    expect(picked.some((l) => l.includes('생략'))).toBe(true);
  });

  it('보고서는 파일 끝쪽 여러 덩어리를 거슬러 올라가 마지막 발행 시작점까지 읽는다', async () => {
    const logs = path.join(tmp, 'logs');
    fs.mkdirSync(logs, { recursive: true });
    const current = path.join(logs, 'main-2026-10-06.log');
    const filler = `${'가'.repeat(99)}\n`;
    const bytes = (n: number) => filler.repeat(Math.ceil(n / Buffer.byteLength(filler)));
    fs.writeFileSync(current, [
      publish('OLDRUN', 7).join('\n'), '\n',
      bytes(2 * 1024 * 1024),
      publish('NEWRUN', 1).join('\n'), '\n',
      bytes(2.5 * 1024 * 1024),
    ].join(''));
    setMainLogFileGetter(() => current);
    const { report } = await generateDiagnosticReport();
    const body = section(report);
    expect(body).toContain('payload places=1곳');
    expect(body).toContain('NEWRUN');
    expect(body).not.toContain('OLDRUN');
    setMainLogFileGetter(() => null);
  });

  it('시작점이 8MB 밖이거나 없으면 없다고 적는다', async () => {
    const logs = path.join(tmp, 'logs');
    const current = path.join(logs, 'main-2026-10-05.log');
    const filler = `${'가'.repeat(99)}\n`;
    fs.writeFileSync(current, publish('TOOOLD', 3).join('\n') + '\n'
      + filler.repeat(Math.ceil((9 * 1024 * 1024) / Buffer.byteLength(filler))));
    setMainLogFileGetter(() => current);
    const { report } = await generateDiagnosticReport();
    expect(section(report)).toContain('발행 시작 줄을 찾지 못했습니다');
    expect(section(report)).not.toContain('TOOOLD');
    setMainLogFileGetter(() => null);
  });

  it('사용자 이름이 든 경로는 보고서 전체 가리기를 그대로 거친다', async () => {
    const logs = path.join(tmp, 'logs');
    const current = path.join(logs, 'main-2026-10-04.log');
    fs.writeFileSync(current, '[t] [LOG] 🧾 [구조 진단] 소제목 1개\n'
      + '[t] [LOG]       [1] heading="제목" file=C:/Users/홍길동/Desktop/a.png saved=(없음) url=(없음)\n');
    setMainLogFileGetter(() => current);
    const { report } = await generateDiagnosticReport();
    expect(section(report)).toContain('C:/Users/<사용자>/Desktop/a.png');
    expect(report).not.toContain('홍길동');
    setMainLogFileGetter(() => null);
  });
});
