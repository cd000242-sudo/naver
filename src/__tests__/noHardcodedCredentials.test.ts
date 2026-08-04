import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';

/**
 * [2026-08-05] 소스에 실제 자격증명이 박히는 것을 막는다.
 *
 * 실사례 2건:
 *  - src/crawler/utils/proxyManager.ts — SmartProxy 구독 계정 (v2.11.156에서 제거)
 *  - src/index.ts — 개발자 본인의 네이버 ID·비밀번호 (2026-01-26부터 노출)
 *
 * 둘 다 "환경변수 우선, 리터럴 폴백" 형태였다. 이 저장소는 공개(public)이고
 * package.json build.files의 `dist/**` 규칙 때문에 패키징된 asar에도 들어간다.
 * 폴백이 있으면 값이 없어도 조용히 동작해서 아무도 눈치채지 못한다.
 *
 * 계약: 비밀번호·토큰류는 환경변수에서만 읽고, 없으면 명시 실패한다.
 */
const SRC_ROOT = resolve(__dirname, '..');
const SCAN_EXTENSIONS = ['.ts', '.js', '.mjs'];
const SKIP_DIRS = new Set(['__tests__', 'node_modules', 'tests']);

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      collectSourceFiles(full, acc);
      continue;
    }
    if (SCAN_EXTENSIONS.some((ext) => entry.endsWith(ext))) acc.push(full);
  }
  return acc;
}

describe('소스에 하드코딩된 자격증명이 없다', () => {
  const files = collectSourceFiles(SRC_ROOT);

  it('과거 노출된 실제 값이 남아 있지 않다', () => {
    // 이미 노출된 값들 — 다시 들어오면 즉시 잡는다.
    const leaked = ['tjdgus24280', 'Qkrtjdgus', 'tT3=bhH71lailX8bWj', 'user-sproqjsqtg'];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      for (const secret of leaked) {
        expect(src.includes(secret), `${file} 에 노출 이력 값이 있습니다: ${secret}`).toBe(false);
      }
    }
  });

  it('환경변수에 리터럴 비밀번호/토큰 폴백을 붙이지 않는다', () => {
    // process.env.XXX_PASSWORD ?? '리터럴'  /  || "리터럴"  형태를 잡는다.
    // 빈 문자열 폴백('')은 "미설정"을 뜻하므로 허용한다.
    const literalFallback =
      /process\.env\.[A-Z0-9_]*(?:PASSWORD|SECRET|TOKEN|APIKEY|API_KEY|PASS)[A-Z0-9_]*\s*(?:\?\?|\|\|)\s*(['"])(?!\1)[^'"]+\1/;

    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      const match = literalFallback.exec(src);
      expect(match?.[0], `${file} 에 리터럴 폴백이 있습니다: ${match?.[0]}`).toBeUndefined();
    }
  });

  it('CLI 진입점은 자격증명이 없으면 실패한다 (경고 후 진행 금지)', () => {
    const src = readFileSync(join(SRC_ROOT, 'index.ts'), 'utf8');
    expect(src).toContain('function readCredentialsOrExit()');
    expect(src).toContain('process.exit(1)');

    // 옛 형태(경고만 하고 리터럴 폴백으로 진행) 재도입 금지.
    // 주석에 남긴 이력 설명이 걸리지 않도록 코드 라인만 검사한다.
    const codeLines = src
      .split(/\r?\n/)
      .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
      .join('\n');
    expect(codeLines).not.toContain('function checkCredentials(');
    // 빈 문자열 폴백('')은 "미설정"을 뜻하므로 허용 — 값이 든 리터럴만 잡는다.
    expect(codeLines).not.toMatch(/process\.env\.NAVER_ID\s*(?:\?\?|\|\|)\s*'[^']+'/);
    expect(codeLines).not.toMatch(/process\.env\.NAVER_PASSWORD\s*(?:\?\?|\|\|)\s*'[^']+'/);
  });
});
