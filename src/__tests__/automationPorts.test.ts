// v2.7.54 — AutomationContext ports 회귀 가드
//
// 헥사고날 점진 마이그레이션 토대 검증:
//   - ports 인터페이스 export
//   - createAutomationContext provider 메서드 존재
//   - 새 helpers는 self:any 대신 ports 사용 가능

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..');
function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

describe('AutomationContext ports — 헥사고날 토대', () => {
  it('ports.ts export AutomationContext 인터페이스', () => {
    const code = read('automation/ports.ts');
    expect(code).toMatch(/export interface AutomationContext/);
    expect(code).toMatch(/log\(message: string\): void/);
    expect(code).toMatch(/delay\(ms: number\): Promise<void>/);
    expect(code).toMatch(/getFrame\(\): Promise<Frame>/);
    expect(code).toMatch(/getPage\(\): Page/);
    expect(code).toMatch(/isCancelRequested\(\): boolean/);
  });

  it('ports.ts export AutomationOptionsView readonly view', () => {
    const code = read('automation/ports.ts');
    expect(code).toMatch(/export interface AutomationOptionsView/);
    expect(code).toMatch(/readonly\s+naverId\?:\s*string/);
    expect(code).toMatch(/readonly\s+contentMode\?:\s*string/);
  });

  it('ports.ts export PublishPhase FSM 토대', () => {
    const code = read('automation/ports.ts');
    expect(code).toMatch(/export type PublishPhase/);
    expect(code).toMatch(/'browser-session'/);
    expect(code).toMatch(/'auth-login'/);
    expect(code).toMatch(/'editor-bootstrap'/);
    expect(code).toMatch(/'content-author'/);
    expect(code).toMatch(/'image-place'/);
    expect(code).toMatch(/'publish-modal'/);
    expect(code).toMatch(/'post-publish-reflect'/);
  });

  it('NaverBlogAutomation에 createAutomationContext provider 존재', () => {
    const code = read('naverBlogAutomation.ts');
    expect(code).toMatch(/createAutomationContext\(\):\s*import\(['"]\.\/automation\/ports\.js['"]\)\.AutomationContext/);
  });
});
