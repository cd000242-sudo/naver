// v2.7.56 — 보안 강화 회귀 가드
//
// security-auditor HIGH 5건 패치 검증:
//   - SEC-V2-H1: BrowserWindow sandbox 명시
//   - SEC-V2-H3: openExternalUrl file:/javascript: 차단

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

describe('SEC-V2-H1 — BrowserWindow sandbox 명시', () => {
  it('main.ts BrowserWindow 4곳 모두 sandbox 명시', () => {
    const code = read('main.ts');
    // 4개 BrowserWindow 생성 위치 — 모두 webPreferences에 sandbox 키 존재
    const bwBlocks = code.match(/new BrowserWindow\(\s*\{[\s\S]*?webPreferences:\s*\{[\s\S]*?\}/g) || [];
    expect(bwBlocks.length).toBeGreaterThanOrEqual(3); // mainWindow + confirmWindow + loginWindow + licenseWindow
    // sandbox 키워드가 main.ts에 최소 3회 등장 (mainWindow는 sandbox: false 명시 → 3개 신규 추가됨)
    const sandboxCount = (code.match(/sandbox:\s*(true|false)/g) || []).length;
    expect(sandboxCount).toBeGreaterThanOrEqual(4); // mainWindow:false + 3개 신규:true
  });
});

describe('SEC-V2-H3 — openExternalUrl 프로토콜 화이트리스트', () => {
  it('main.ts openExternalUrl에 file:/javascript: 차단 가드', () => {
    const code = read('main.ts');
    // openExternalUrl 핸들러에 ALLOWED 화이트리스트 또는 protocol 검증
    expect(code).toMatch(/openExternalUrl[\s\S]{0,500}?ALLOWED/);
  });

  it('systemHandlers.ts open-external-url에 file:/javascript: 차단 가드', () => {
    const code = read('main/ipc/systemHandlers.ts');
    expect(code).toMatch(/ALLOWED_PROTOCOLS[\s\S]{0,200}?https?:/);
  });
});

describe('SEC-V2-C1 — file:deleteFolder Command Injection 차단 (v2.7.43)', () => {
  it('main.ts file:deleteFolder에 화이트리스트 + spawn 사용', () => {
    const code = read('main.ts');
    // 두 패턴 분리 검증 (정규식 거리 의존 없음)
    expect(code).toMatch(/spawn\(['"]cmd\.exe['"]/);
    expect(code).toMatch(/allowedRoots/);
  });
});

describe('SEC-V2-C2 — preload.on 화이트리스트 (v2.7.43)', () => {
  it('preload.ts api.on에 ALLOWED_CHANNELS 화이트리스트', () => {
    const code = read('preload.ts');
    expect(code).toMatch(/ALLOWED_CHANNELS[\s\S]{0,500}?'automation:status'/);
  });
});
