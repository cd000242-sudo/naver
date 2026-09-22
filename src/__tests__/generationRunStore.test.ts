import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  GenerationRun,
  createGenerationRun,
  generateRunId,
  getActiveGenerationRun,
  pruneGenerationRuns,
  redactSecrets,
  resolveGenerationRunsRoot,
  setActiveGenerationRun,
  withActiveRun,
} from '../quality/generationRunStore';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bln-run-store-test-'));
  process.env.GENERATION_RUNS_DIR = tmpRoot;
});

afterEach(() => {
  delete process.env.GENERATION_RUNS_DIR;
  setActiveGenerationRun(null);
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch { /* ignore cleanup failure */ }
});

describe('generateRunId', () => {
  it('produces YYYYMMDD-HHmmss-xxxxxx (6 base36 chars), local time', () => {
    const now = new Date(2026, 8, 22, 13, 5, 9); // 2026-09-22 13:05:09 local
    const id = generateRunId(now);
    expect(id).toMatch(/^20260922-130509-[a-z0-9]{6}$/);
  });

  it('generates unique-ish ids across calls', () => {
    const a = generateRunId();
    const b = generateRunId();
    // Same second collisions are possible but the random suffix should usually differ.
    expect(a === b).toBe(false);
  });
});

describe('resolveGenerationRunsRoot', () => {
  it('honors GENERATION_RUNS_DIR', () => {
    expect(resolveGenerationRunsRoot()).toBe(tmpRoot);
  });

  it('falls back to os.tmpdir()/bln-generation-runs when env unset and electron unavailable', () => {
    delete process.env.GENERATION_RUNS_DIR;
    const root = resolveGenerationRunsRoot();
    expect(root).toBe(path.join(os.tmpdir(), 'bln-generation-runs'));
    process.env.GENERATION_RUNS_DIR = tmpRoot;
  });
});

describe('redactSecrets', () => {
  it('masks OpenAI-style sk- keys', () => {
    const out = redactSecrets('key=sk-abcdefghijklmnopqrstuvwx end');
    expect(out).toContain('sk-***');
    expect(out).not.toContain('abcdefghijklmnopqrstuvwx');
  });

  it('masks Anthropic sk-ant- keys distinctly', () => {
    const out = redactSecrets('key=sk-ant-abcdefghijklmnopqrstuvwx end');
    expect(out).toContain('sk-ant-***');
    expect(out).not.toContain('abcdefghijklmnopqrstuvwx');
  });

  it('masks Google AIza keys', () => {
    const key = 'AIza' + 'x'.repeat(35);
    const out = redactSecrets(`GOOGLE_API_KEY=${key}`);
    expect(out).toContain('AIza***');
    expect(out).not.toContain(key);
  });

  it('masks Perplexity pplx- keys', () => {
    const out = redactSecrets('token pplx-abcdefghijklmnop1234 sent');
    expect(out).toContain('pplx-***');
    expect(out).not.toContain('abcdefghijklmnop1234');
  });

  it('masks Bearer tokens', () => {
    const out = redactSecrets('Authorization: Bearer abcdefgh12345678');
    expect(out).toContain('Bearer ***');
    expect(out).not.toContain('abcdefgh12345678');
  });

  it('masks X-Naver-Client-Secret values', () => {
    const out = redactSecrets('X-Naver-Client-Secret: mySecretValue123');
    expect(out).toContain('X-Naver-Client-Secret: ***');
    expect(out).not.toContain('mySecretValue123');
  });

  it('leaves normal Korean text intact', () => {
    const text = '네이버 블로그 자동화 시스템은 사용자에게 안전한 발행 경험을 제공합니다.';
    expect(redactSecrets(text)).toBe(text);
  });

  it('handles empty string without throwing', () => {
    expect(redactSecrets('')).toBe('');
  });
});

describe('GenerationRun file writes (A-G + meta.json)', () => {
  it('creates all expected files with correct content', () => {
    const run = createGenerationRun({ keyword: '청약통장', mode: 'shopping' });

    run.writeSearchRaw({ news: [{ title: 'n1' }] });
    run.writeResearchInput('연구 입력 텍스트');
    run.writeFinalPrompt({ system: 'SYS', user: 'USR' });
    run.writeModelOutput('첫 번째 출력', { stage: 'draft', provider: 'anthropic', model: 'claude-x' });
    run.appendPostProcess({
      stepName: 'trim',
      beforeChars: 100,
      afterChars: 90,
      deletedChars: 10,
    });
    run.writeFinalBeforePublish('최종 발행 전 본문');
    run.writePublishedPayload({ title: '제목', body: '본문' });
    run.finish({ publishDecision: 'AUTO_PUBLISH' });

    const files = fs.readdirSync(run.dir).sort();
    expect(files).toEqual(
      [
        'A-search-raw.json',
        'B-research-input.txt',
        'C-final-prompt.txt',
        'D-model-output.txt',
        'E-postprocess-history.json',
        'F-final-before-publish.txt',
        'G-published-payload.json',
        'meta.json',
      ].sort(),
    );

    const promptContent = fs.readFileSync(path.join(run.dir, 'C-final-prompt.txt'), 'utf-8');
    expect(promptContent).toBe('SYS\n\n===== USER =====\n\nUSR');

    const outputContent = fs.readFileSync(path.join(run.dir, 'D-model-output.txt'), 'utf-8');
    expect(outputContent).toBe('첫 번째 출력');

    const meta = JSON.parse(fs.readFileSync(path.join(run.dir, 'meta.json'), 'utf-8'));
    expect(meta.runId).toBe(run.runId);
    expect(meta.keyword).toBe('청약통장');
    expect(meta.mode).toBe('shopping');
    expect(meta.publishDecision).toBe('AUTO_PUBLISH');
    expect(meta.postProcessSteps).toBe(1);
    expect(meta.finishedAt).toBeTruthy();
    expect(meta.actualModelsUsed).toEqual([{ stage: 'draft', provider: 'anthropic', model: 'claude-x' }]);
  });

  it('writes object research input as JSON, string as TXT', () => {
    const run = createGenerationRun({ keyword: 'k', mode: 'm' });
    run.writeResearchInput({ foo: 'bar' });
    const files = fs.readdirSync(run.dir);
    expect(files).toContain('B-research-input.json');
    expect(files).not.toContain('B-research-input.txt');
  });

  it('appends subsequent model output writes with an attempt header', () => {
    const run = createGenerationRun({ keyword: 'k', mode: 'm' });
    run.writeModelOutput('attempt one', { stage: 'draft' });
    run.writeModelOutput('attempt two', { stage: 'draft' });
    const content = fs.readFileSync(path.join(run.dir, 'D-model-output.txt'), 'utf-8');
    expect(content).toContain('attempt one');
    expect(content).toContain('===== draft attempt 2 =====');
    expect(content).toContain('attempt two');
  });

  it('redacts secrets in written content', () => {
    const run = createGenerationRun({ keyword: 'k', mode: 'm' });
    run.writeFinalBeforePublish('secret key sk-abcdefghijklmnopqrstuvwx here');
    const content = fs.readFileSync(path.join(run.dir, 'F-final-before-publish.txt'), 'utf-8');
    expect(content).toContain('sk-***');
    expect(content).not.toContain('abcdefghijklmnopqrstuvwx');
  });
});

describe('appendPostProcess', () => {
  it('accumulates steps and increments meta.postProcessSteps', () => {
    const run = createGenerationRun({ keyword: 'k', mode: 'm' });
    run.appendPostProcess({ stepName: 'a', beforeChars: 10, afterChars: 9, deletedChars: 1 });
    run.appendPostProcess({ stepName: 'b', beforeChars: 9, afterChars: 7, deletedChars: 2 });

    expect(run.meta.postProcessSteps).toBe(2);

    const history = JSON.parse(fs.readFileSync(path.join(run.dir, 'E-postprocess-history.json'), 'utf-8'));
    expect(history).toHaveLength(2);
    expect(history[0].stepName).toBe('a');
    expect(history[1].stepName).toBe('b');
    expect(history[0].at).toBeTruthy();
  });
});

describe('recordModel', () => {
  it('dedupes identical (stage, provider, model) triples', () => {
    const run = createGenerationRun({ keyword: 'k', mode: 'm' });
    run.recordModel('draft', 'anthropic', 'claude-x');
    run.recordModel('draft', 'anthropic', 'claude-x');
    run.recordModel('revise', 'anthropic', 'claude-x');

    expect(run.meta.actualModelsUsed).toEqual([
      { stage: 'draft', provider: 'anthropic', model: 'claude-x' },
      { stage: 'revise', provider: 'anthropic', model: 'claude-x' },
    ]);
  });
});

describe('active run helpers', () => {
  it('setActiveGenerationRun / getActiveGenerationRun / withActiveRun', () => {
    expect(getActiveGenerationRun()).toBeNull();
    expect(withActiveRun((run) => run.runId)).toBeUndefined();

    const run = createGenerationRun({ keyword: 'k', mode: 'm' });
    setActiveGenerationRun(run);
    expect(getActiveGenerationRun()).toBe(run);
    expect(withActiveRun((r) => r.runId)).toBe(run.runId);

    setActiveGenerationRun(null);
    expect(getActiveGenerationRun()).toBeNull();
  });
});

describe('pruneGenerationRuns', () => {
  it('keeps only the newest N run directories', () => {
    const names = ['20260101-000000-aaaaaa', '20260102-000000-bbbbbb', '20260103-000000-cccccc', '20260104-000000-dddddd'];
    for (const name of names) {
      fs.mkdirSync(path.join(tmpRoot, name), { recursive: true });
      fs.writeFileSync(path.join(tmpRoot, name, 'meta.json'), '{}');
    }

    pruneGenerationRuns(tmpRoot, 2);

    const remaining = fs.readdirSync(tmpRoot).sort();
    expect(remaining).toEqual(['20260103-000000-cccccc', '20260104-000000-dddddd']);
  });

  it('does nothing when entries are within the keep limit', () => {
    fs.mkdirSync(path.join(tmpRoot, '20260101-000000-aaaaaa'));
    pruneGenerationRuns(tmpRoot, 200);
    expect(fs.readdirSync(tmpRoot)).toEqual(['20260101-000000-aaaaaa']);
  });

  it('does not throw when root does not exist', () => {
    expect(() => pruneGenerationRuns(path.join(tmpRoot, 'nonexistent'), 5)).not.toThrow();
  });
});

describe('write failure resilience', () => {
  it('does not throw when root points at a file (ENOTDIR on mkdir)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fileAsRoot = path.join(tmpRoot, 'not-a-directory.txt');
    fs.writeFileSync(fileAsRoot, 'i am a file');

    let run: GenerationRun | undefined;
    expect(() => {
      run = new GenerationRun({ keyword: 'k', mode: 'm' }, fileAsRoot);
    }).not.toThrow();

    expect(() => run!.writeSearchRaw({ a: 1 })).not.toThrow();
    expect(() => run!.writeFinalBeforePublish('text')).not.toThrow();
    expect(() => run!.finish()).not.toThrow();

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
