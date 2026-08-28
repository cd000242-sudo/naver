import { describe, expect, it, vi, beforeEach } from 'vitest';
import { applyPostDraftFactCheck } from '../content/postDraftFactCheck';

const runFactCheck = vi.fn();
const resolveFactCheckEngine = vi.fn();

vi.mock('../factCheckRouter.js', () => ({
  get runFactCheck() { return runFactCheck; },
  get resolveFactCheckEngine() { return resolveFactCheckEngine; },
}));

const loadConfig = async () => ({ factCheckEngine: 'auto' });

beforeEach(() => {
  runFactCheck.mockReset();
  resolveFactCheckEngine.mockReset();
  resolveFactCheckEngine.mockReturnValue('auto');
});

describe('applyPostDraftFactCheck', () => {
  it('applies corrections to both plain and html bodies', async () => {
    runFactCheck.mockResolvedValue({
      corrected: '공연은 8월 29일입니다.',
      suspicious: [{ original: '29일', replacement: '8월 29일', reason: '월 누락' }],
      engineUsed: 'auto→crawl',
      notes: [],
    });
    const draft = { bodyPlain: '공연은 29일입니다.', bodyHtml: '<p>공연은 29일입니다.</p>' };

    const result = await applyPostDraftFactCheck(draft, { keyword: '공연' }, loadConfig);

    expect(result).toEqual({ ran: true, engineUsed: 'auto→crawl', correctedCount: 1 });
    expect(draft.bodyPlain).toBe('공연은 8월 29일입니다.');
    expect(draft.bodyHtml).toBe('<p>공연은 8월 29일입니다.</p>');
  });

  it('runs on a short draft — the branch that used to skip fact-check entirely', async () => {
    runFactCheck.mockResolvedValue({ corrected: '짧은 글', suspicious: [], engineUsed: 'auto→naver', notes: [] });

    const result = await applyPostDraftFactCheck({ bodyPlain: '짧은 글' }, {}, loadConfig);

    expect(result.ran).toBe(true);
    expect(runFactCheck).toHaveBeenCalledOnce();
  });

  it('skips when the engine is off', async () => {
    resolveFactCheckEngine.mockReturnValue('off');
    const result = await applyPostDraftFactCheck({ bodyPlain: '본문' }, {}, loadConfig);
    expect(result.ran).toBe(false);
    expect(runFactCheck).not.toHaveBeenCalled();
  });

  it('skips when there is no body', async () => {
    expect((await applyPostDraftFactCheck({}, {}, loadConfig)).ran).toBe(false);
  });

  it('never throws — a fact-check failure must not block publishing', async () => {
    runFactCheck.mockRejectedValue(new Error('network down'));
    const draft = { bodyPlain: '원본 본문' };

    const result = await applyPostDraftFactCheck(draft, {}, loadConfig);

    expect(result.ran).toBe(false);
    expect(draft.bodyPlain).toBe('원본 본문');
  });
});
