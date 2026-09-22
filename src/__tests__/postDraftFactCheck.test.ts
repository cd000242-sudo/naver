/**
 * [2026-09-22] 검수자는 삭제자가 아니다.
 *
 * applyPostDraftFactCheck 는 더 이상 기본으로 본문을 고치지 않는다 — runFactCheck 가
 * 돌려준 issues 를 그대로 보고할 뿐이다. `applyCorrections: true` 를 명시한 경우에만,
 * 그것도 원문에 그대로 있는 claim + 비어 있지 않은 suggestedCorrection 쌍만 치환한다.
 *
 * 예전 계약(기본으로 본문을 고치고 { ran, engineUsed, correctedCount } 를 돌려줌)은
 * "검수자가 몰래 삭제자가 된다"는 정확히 그 문제를 낳았다 — 이 테스트 파일은 새 계약으로
 * 전면 교체됐다.
 */
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

describe('applyPostDraftFactCheck — 기본값은 비파괴 (applyCorrections 없음)', () => {
  it('issues가 있어도 본문/HTML을 고치지 않는다', async () => {
    runFactCheck.mockResolvedValue({
      corrected: '이 값은 절대 쓰지 않는다 — 무시되어야 한다',
      issues: [{ claim: '29일', status: 'TIME_MISMATCH', issue: '월 누락', suggestedCorrection: '8월 29일' }],
      engineUsed: 'auto→crawl',
      notes: [],
    });
    const draft = { bodyPlain: '공연은 29일입니다.', bodyHtml: '<p>공연은 29일입니다.</p>' };

    const result = await applyPostDraftFactCheck(draft, { keyword: '공연' }, loadConfig);

    expect(result.applied).toBe(false);
    expect(result.content).toBe('공연은 29일입니다.');
    expect(result.issues).toHaveLength(1);
    expect(result.changes).toEqual([]);
    expect(draft.bodyPlain).toBe('공연은 29일입니다.');
    expect(draft.bodyHtml).toBe('<p>공연은 29일입니다.</p>');
  });

  it('runs on a short draft — the branch that used to skip fact-check entirely', async () => {
    runFactCheck.mockResolvedValue({ corrected: '짧은 글', issues: [], engineUsed: 'auto→naver', notes: [] });

    const result = await applyPostDraftFactCheck({ bodyPlain: '짧은 글' }, {}, loadConfig);

    expect(result.applied).toBe(false);
    expect(runFactCheck).toHaveBeenCalledOnce();
  });

  it('skips when the engine is off', async () => {
    resolveFactCheckEngine.mockReturnValue('off');
    const result = await applyPostDraftFactCheck({ bodyPlain: '본문' }, {}, loadConfig);
    expect(result.applied).toBe(false);
    expect(result.content).toBe('본문');
    expect(runFactCheck).not.toHaveBeenCalled();
  });

  it('skips when there is no body', async () => {
    const result = await applyPostDraftFactCheck({}, {}, loadConfig);
    expect(result.applied).toBe(false);
    expect(result.content).toBe('');
  });

  it('never throws — a fact-check failure must not block publishing', async () => {
    runFactCheck.mockRejectedValue(new Error('network down'));
    const draft = { bodyPlain: '원본 본문' };

    const result = await applyPostDraftFactCheck(draft, {}, loadConfig);

    expect(result.applied).toBe(false);
    expect(result.content).toBe('원본 본문');
    expect(draft.bodyPlain).toBe('원본 본문');
  });
});

describe('applyPostDraftFactCheck — applyCorrections: true (명시적 옵트인)', () => {
  it('빈 suggestedCorrection은 적용하지 않는다 (삭제 지시 금지)', async () => {
    runFactCheck.mockResolvedValue({
      corrected: '이 값은 무시된다',
      issues: [{ claim: '근거 없는 이유 문장입니다', status: 'OVERCLAIM', issue: '근거 없음' }],
      engineUsed: 'gpt-claude',
      notes: [],
    });
    const draft = { bodyPlain: '서론입니다. 근거 없는 이유 문장입니다. 결론입니다.' };

    const result = await applyPostDraftFactCheck(draft, {}, loadConfig, { applyCorrections: true });

    expect(result.applied).toBe(false);
    expect(result.changes).toEqual([]);
    expect(result.content).toBe(draft.bodyPlain);
    expect(draft.bodyPlain).toContain('근거 없는 이유 문장입니다');
  });

  it('claim이 원문에 그대로 있고 correction이 비어 있지 않으면 치환하고 기록한다', async () => {
    runFactCheck.mockResolvedValue({
      corrected: '무시됨',
      issues: [{ claim: '2020년에 출시됐다', status: 'UNSUPPORTED', issue: '연도 오류', suggestedCorrection: '2021년에 출시됐다' }],
      engineUsed: 'crawl',
      notes: [],
    });
    const draft = { bodyPlain: '서론. 2020년에 출시됐다. 결론.', bodyHtml: '<p>서론. 2020년에 출시됐다. 결론.</p>' };

    const result = await applyPostDraftFactCheck(draft, {}, loadConfig, { applyCorrections: true });

    expect(result.applied).toBe(true);
    expect(result.content).toContain('2021년에 출시됐다');
    expect(result.changes).toEqual([
      { before: '2020년에 출시됐다', after: '2021년에 출시됐다', status: 'UNSUPPORTED' },
    ]);
    expect(draft.bodyPlain).toContain('2021년에 출시됐다');
    expect(draft.bodyHtml).toContain('2021년에 출시됐다');
  });

  it('claim이 원문에 없으면(변형 가능성) 건너뛴다', async () => {
    runFactCheck.mockResolvedValue({
      corrected: '무시됨',
      issues: [{ claim: '본문에 없는 문장', status: 'UNSUPPORTED', issue: 'x', suggestedCorrection: 'y' }],
      engineUsed: 'crawl',
      notes: [],
    });
    const draft = { bodyPlain: '원본 그대로.' };

    const result = await applyPostDraftFactCheck(draft, {}, loadConfig, { applyCorrections: true });

    expect(result.applied).toBe(false);
    expect(draft.bodyPlain).toBe('원본 그대로.');
  });
});

describe('applyPostDraftFactCheck — caller 전달', () => {
  it('caller 옵션을 runFactCheck에 그대로 넘긴다', async () => {
    runFactCheck.mockResolvedValue({ corrected: '무시됨', issues: [], engineUsed: 'crawl', model: 'selected-model', notes: [] });
    const caller = { engine: 'selected-model', callText: vi.fn() };

    const result = await applyPostDraftFactCheck({ bodyPlain: '본문입니다.' }, {}, loadConfig, { caller });

    expect(runFactCheck).toHaveBeenCalledWith('auto', expect.objectContaining({ caller }));
    expect(result.model).toBe('selected-model');
  });
});
