import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const readSrc = (p: string) => fs.readFileSync(path.join(PROJECT_ROOT, p), 'utf-8');

describe('P5 humanBehavior 모듈 존재 보호 (v2.10.381)', () => {
  it('src/automation/humanBehavior.ts 파일 존재', () => {
    const abs = path.join(PROJECT_ROOT, 'src/automation/humanBehavior.ts');
    expect(fs.existsSync(abs)).toBe(true);
  });

  it('performIdleMouseShake 함수 export', () => {
    const src = readSrc('src/automation/humanBehavior.ts');
    expect(src).toMatch(/export\s+(async\s+)?function\s+performIdleMouseShake/);
  });

  it('performIdleMouseShake 내부에서 page.mouse.move 사용', () => {
    const src = readSrc('src/automation/humanBehavior.ts');
    expect(src).toMatch(/page\.mouse\.move/);
  });

  it('performIdleMouseShake 내부에서 steps 옵션 명시 (가변 곡선)', () => {
    const src = readSrc('src/automation/humanBehavior.ts');
    expect(src).toMatch(/steps:/);
  });

  it('performIdleMouseShake 내부에서 randomness 사용 (Math.random)', () => {
    const src = readSrc('src/automation/humanBehavior.ts');
    expect(src).toMatch(/Math\.random/);
  });
});

describe('automatic publishing does not synthesize idle human activity', () => {
  it('does not import idle-motion behavior into publishing', () => {
    const source = readSrc('src/naverBlogAutomation.ts');
    expect(/from\s+['"]\.\/automation\/humanBehavior(?:\.js)?['"]/.test(source)).toBe(false);
  });
  it('does not execute idle mouse movement or warmup browsing', () => {
    const source = readSrc('src/naverBlogAutomation.ts');
    expect(/performIdleMouseShake\s*\(|warmupSession\s*\(/.test(source)).toBe(false);
  });
  it('checks the persistent account stop state at automation cancellation checkpoints', () => {
    const source = readSrc('src/naverBlogAutomation.ts');
    const start = source.indexOf('private ensureNotCancelled(');
    expect(start).toBeGreaterThan(-1);
    const checkpoint = source.slice(start, start + 1600);
    expect(checkpoint.includes('assertAllowed(this.options.naverId)')).toBe(true);
    expect(checkpoint.includes('isLoginChallengeUrl')).toBe(true);
  });
});
