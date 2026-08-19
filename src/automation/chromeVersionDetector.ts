// src/automation/chromeVersionDetector.ts
// 실행될 Chrome 의 실제 버전을 알아낸다.
//
// 왜: UA 를 고정 풀에서 골라 쓰면 크롬이 4주마다 올라가는 동안 값이 굳어 있다가
// 어긋난다. 실측(2026-08-19) 이 PC 의 크롬은 151 인데 풀은 145~149 였고,
// 시스템 크롬(151)을 띄운 위에 147 이라고 적힌 UA 를 씌우고 있었다.
// 진짜 브라우저와 신분증이 다른 상태는 낡은 UA 보다 나쁘다.
//
// Windows 의 `chrome.exe --version` 은 버전을 출력하지 않는다(실측: 현지화 메시지).
// 대신 Chrome 설치 폴더가 버전명 디렉터리를 갖는 구조를 읽는다. 업데이트 직후
// 두 개가 공존하면 실제로 실행되는 쪽(더 높은 버전)을 고른다.

import { promises as fs } from 'fs';
import * as path from 'path';

/** `151.0.7922.138` 형태만 통과시킨다. */
const FULL_VERSION_RE = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/;

let cached: string | null | undefined;

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 4; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

/** 실행 파일과 같은 폴더에 있는 버전명 디렉터리 중 가장 높은 값. */
export async function readChromeVersionFromLayout(executablePath: string): Promise<string> {
  try {
    const dir = path.dirname(executablePath);
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const versions = entries
      .filter((e) => e.isDirectory() && FULL_VERSION_RE.test(e.name))
      .map((e) => e.name)
      .sort(compareVersions);
    return versions.length ? versions[versions.length - 1] : '';
  } catch {
    return '';
  }
}

/**
 * 실행될 Chrome 의 전체 버전(`151.0.7922.138`). 알아내지 못하면 빈 문자열.
 * 프로세스 수명 동안 한 번만 조사한다 — 로그인마다 디스크를 뒤질 이유가 없다.
 */
export async function detectChromeFullVersion(
  resolveExecutablePath: () => Promise<string | undefined>,
): Promise<string> {
  if (cached !== undefined) return cached ?? '';

  const hint = String(process.env.CHROME_VERSION_HINT || '').trim();
  if (FULL_VERSION_RE.test(hint)) {
    cached = hint;
    return cached;
  }

  try {
    const executablePath = await resolveExecutablePath();
    cached = executablePath ? await readChromeVersionFromLayout(executablePath) : '';
  } catch {
    cached = '';
  }
  return cached ?? '';
}

/** 테스트용 — 캐시를 비운다. */
export function resetChromeVersionCache(): void {
  cached = undefined;
}
