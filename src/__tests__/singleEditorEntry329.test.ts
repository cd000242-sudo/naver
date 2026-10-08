/**
 * [2026-10-08 사장님] "10번 다시 열고 20회 재실행하면 당연히 봇 감지" — one post = one editor entry.
 *
 * v2.11.326/327 made the first entry single (navigateToBlogWrite: one goto + readiness wait), but the steps after
 * it still re-opened or reloaded GoBlogWrite on every frame/title miss, publish retried 3 times and the renderer
 * reran the whole publish after login-frame/network errors. This locks the remaining single-entry contract on the
 * shipped code.
 */
import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const engine = fs.readFileSync(path.join(process.cwd(), 'src', 'naverBlogAutomation.ts'), 'utf8').replace(/\r\n/g, '\n');
const renderer = fs.readFileSync(path.join(process.cwd(), 'src', 'renderer', 'modules', 'fullAutoFlow.ts'), 'utf8').replace(/\r\n/g, '\n');

function method(name: string): string {
  const start = engine.indexOf(`  async ${name}(`);
  expect(start).toBeGreaterThan(-1);
  const ends = ['\n  async ', '\n  private ', '\n  public '].map((marker) => engine.indexOf(marker, start + 10)).filter((i) => i > 0);
  return engine.slice(start, Math.min(...ends));
}

describe('one editor entry per post on the shipped (329+) engine', () => {
  it('GoBlogWrite is opened in exactly one place: navigateToBlogWrite', () => {
    const opens = engine.match(/page\.goto\(this\.options\.blogWriteUrl \?\? 'https:\/\/blog\.naver\.com\/GoBlogWrite\.naver'/g) || [];
    expect(opens).toHaveLength(1);
    expect(method('navigateToBlogWrite')).toContain("page.goto(this.options.blogWriteUrl ?? 'https://blog.naver.com/GoBlogWrite.naver'");
  });

  it('switchToMainFrame and inputTitle never navigate or reload (they run mid-post, on every miss)', () => {
    for (const name of ['switchToMainFrame', 'inputTitle']) {
      const body = method(name);
      expect(body.length).toBeGreaterThan(300);
      expect(body).not.toMatch(/page\.goto\(|page\.reload\(/);
    }
  });

  it('publish repairs once on the same page; scheduling repairs once at most', () => {
    expect(engine).toContain("}, 2, '블로그 발행');");
    expect(engine).toContain('const MAX_SCHEDULE_RETRIES = 2;');
  });

  it('the renderer reruns the publish only after the browser itself died', () => {
    expect(renderer).not.toContain('retryRunAutomationAfterDetachedLoginFrame');
    expect(renderer).not.toContain('_networkRetryCount');
    expect(renderer).toMatch(/if \(!closeBeforeRetry\) \{\s*return null;/);
  });
});
