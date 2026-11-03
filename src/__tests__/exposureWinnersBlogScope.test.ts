import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { buildExposureWinnersBlock } from '../content/exposureWinnersBlock';

// 2026-10-21: 노출 성공 제목은 그 블로그 것만 — 다른 블로그의 성공 사례가 섞이지 않게.
const post = (title: string, blogId: string) => ({
  id: `${title}_${blogId}`, publishedAt: '2026-06-01T00:00:00.000Z', keyword: 'kw', mode: 'homefeed', blogId, logNo: '100',
  url: `https://blog.naver.com/${blogId}/100`, title,
  evaluator: { finalScore: 80, modeScore: 80, safetyScore: 80, humanlikeScore: 70, decision: 'pass', details: {} },
  exposureChecks: [{ checkedAt: '2026-06-02T00:00:00.000Z', hoursAfter: 24, searchedKeyword: 'kw', position: 2, hasSmartblock: false }],
});
let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'expwin-scope-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });
const write = (posts: unknown[]) => fs.writeFileSync(path.join(dir, 'published-posts.json'), JSON.stringify(posts), 'utf-8');

describe('exposure winners per blog', () => {
  it('uses only the given blog winners', () => {
    write([post('자동차 성공 1', 'car'), post('자동차 성공 2', 'car'), post('자동차 성공 3', 'car'), post('연예 성공 1', 'issue')]);
    const block = buildExposureWinnersBlock('homefeed', dir, 'car');
    expect(block).toContain('자동차 성공 1');
    expect(block).not.toContain('연예 성공 1');
    expect(buildExposureWinnersBlock('homefeed', dir, 'issue')).toBe('');
  });
  it('without a known blog, refuses to mix winners of several blogs', () => {
    write([post('자동차 성공 1', 'car'), post('자동차 성공 2', 'car'), post('연예 성공 1', 'issue'), post('연예 성공 2', 'issue')]);
    expect(buildExposureWinnersBlock('homefeed', dir)).toBe('');
  });
});
