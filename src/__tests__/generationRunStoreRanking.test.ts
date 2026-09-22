import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { GenerationRun, createGenerationRun, setActiveGenerationRun } from '../quality/generationRunStore';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bln-run-store-ranking-test-'));
  process.env.GENERATION_RUNS_DIR = tmpRoot;
});

afterEach(() => {
  delete process.env.GENERATION_RUNS_DIR;
  setActiveGenerationRun(null);
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch { /* ignore cleanup failure */ }
});

describe('writeSourceRanking', () => {
  it('writes A2-source-ranking.json with keyword/topicType/generatedAt/entries', () => {
    const run = createGenerationRun({ keyword: '청약통장 금리', mode: 'seo' });
    const entries = [
      { id: 'S01', title: '청약통장 금리 인상', score: 0.9, accepted: true },
      { id: 'S02', title: '무관한 글', score: 0.1, accepted: false, reason: 'REJECT_ENTITY_MISMATCH' },
    ];

    run.writeSourceRanking(entries, { keyword: '청약통장 금리', topicType: 'NEWS_ISSUE', generatedAt: '2026-09-22T00:00:00.000Z' });

    const files = fs.readdirSync(run.dir);
    expect(files).toContain('A2-source-ranking.json');

    const payload = JSON.parse(fs.readFileSync(path.join(run.dir, 'A2-source-ranking.json'), 'utf-8'));
    expect(payload.keyword).toBe('청약통장 금리');
    expect(payload.topicType).toBe('NEWS_ISSUE');
    expect(payload.generatedAt).toBe('2026-09-22T00:00:00.000Z');
    expect(payload.entries).toHaveLength(2);
    expect(payload.entries[0].id).toBe('S01');
    expect(payload.entries[1].reason).toBe('REJECT_ENTITY_MISMATCH');
  });

  it('generatedAt 을 생략하면 현재 시각으로 채운다', () => {
    const run = createGenerationRun({ keyword: 'k', mode: 'seo' });
    run.writeSourceRanking([], { keyword: 'k', topicType: 'EVERGREEN' });
    const payload = JSON.parse(fs.readFileSync(path.join(run.dir, 'A2-source-ranking.json'), 'utf-8'));
    expect(typeof payload.generatedAt).toBe('string');
    expect(payload.generatedAt.length).toBeGreaterThan(0);
  });

  it('redacts secrets found inside entries (defense in depth)', () => {
    const run = createGenerationRun({ keyword: 'k', mode: 'seo' });
    run.writeSourceRanking(
      [{ id: 'S01', note: 'key=sk-abcdefghijklmnopqrstuvwx' }],
      { keyword: 'k', topicType: 'EVERGREEN' },
    );
    const content = fs.readFileSync(path.join(run.dir, 'A2-source-ranking.json'), 'utf-8');
    expect(content).toContain('sk-***');
    expect(content).not.toContain('abcdefghijklmnopqrstuvwx');
  });

  it('does not throw when the run directory cannot be created', () => {
    const fileAsRoot = path.join(tmpRoot, 'not-a-directory.txt');
    fs.writeFileSync(fileAsRoot, 'i am a file');
    const run = new GenerationRun({ keyword: 'k', mode: 'seo' }, fileAsRoot);
    expect(() => run.writeSourceRanking([], { keyword: 'k', topicType: 'EVERGREEN' })).not.toThrow();
  });
});
