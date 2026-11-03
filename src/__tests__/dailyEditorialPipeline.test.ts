import { describe, it, expect, vi } from 'vitest';
import { generateReviewedDailyHomefeedArticle } from '../main/services/dailyEditorialPipeline.js';
import type { DailyEditorialAngle } from '../main/services/dailyHomefeedEditorialContract.js';

const source = { rawText: '공식 자료에 나온 행동과 실제 선택의 이유입니다.', customPrompt: '기존 문체 유지' };
const original = { selectedTitle: '처음 생성한 제목', bodyPlain: '원문으로 확인한 구체적인 장면과 그 이유를 설명합니다.' };
const editorial: DailyEditorialAngle = {
  scene: '공식 자료에 나온 행동과 실제 선택의 이유입니다.',
  expectationGap: '사람들이 예상한 선택과 다른 장면이었습니다.',
  visualHook: '서로 다른 두 공간의 사진이 나란히 공개됐습니다.',
  bodyPayoff: '본인이 직접 선택 이유를 구체적으로 설명했습니다.',
  targetReader: '같은 가격이라도 다른 공간을 선택하는 이유가 궁금한 독자',
  readerQuestion: '비슷한 평수의 공간에서 선택을 갈랐던 조건은 무엇인가',
  whyCareNow: '최근 공개된 실제 후보 공간을 비교해 볼 수 있다',
  titleDirection: '가격에 대한 예상과 실제 공간 선택 사이의 차이를 보여 준다',
};
const anchoredSource = { ...source, rawText: Object.values(editorial).slice(0, 4).join('\n\n') };
describe('daily editorial generation boundary', () => {
  it('returns the admitted original object without mutating provenance when the title wins', async () => {
    const generate = vi.fn(async () => original), validate = vi.fn();
    const result = await generateReviewedDailyHomefeedArticle({ source }, {
      generate, review: async () => ({ title: original.selectedTitle }), validate,
    });
    expect(result).toBe(original); expect(generate).toHaveBeenCalledTimes(1);
    // 2026-10-21: 원래 제목이 이겨도 최종 제목 · 본문 약속 검증을 건너뛰지 않는다(모든 분기 검증)
    expect(validate).toHaveBeenCalledWith(original, original.selectedTitle); expect(source.customPrompt).toBe('기존 문체 유지');
  });
  it('blocks delivery when the original title wins but its final promise check fails', async () => {
    const audit = vi.fn(async () => {});
    await expect(generateReviewedDailyHomefeedArticle({ source }, {
      generate: async () => original, review: async () => ({ title: original.selectedTitle }),
      validate: async () => { throw Error('PAYOFF_MISSING'); }, audit,
    })).rejects.toThrow('PAYOFF_MISSING');
    expect(audit).not.toHaveBeenCalled();
  });
  it('regenerates once with the winning title and validates the new body before returning its identity', async () => {
    const fresh = { ...original, selectedTitle: '검증한 장면이 드러나는 새 제목' };
    const generate = vi.fn().mockResolvedValueOnce(original).mockResolvedValueOnce(fresh);
    const validate = vi.fn(async () => ({})), audit = vi.fn(async () => {});
    const result = await generateReviewedDailyHomefeedArticle({ source }, {
      generate, review: async () => ({ title: fresh.selectedTitle }), validate, audit,
    });
    expect(result).toBe(fresh); expect(original.selectedTitle).toBe('처음 생성한 제목');
    expect(generate.mock.calls[1][0].manualTitleOverride).toBe(fresh.selectedTitle);
    expect(validate).toHaveBeenCalledWith(fresh, fresh.selectedTitle);
    expect(audit).toHaveBeenCalledTimes(1);
  });
  it('never publishes a regenerated title mismatch or a missing payoff and never retries a third body', async () => {
    const generate = vi.fn(async () => original), validate = vi.fn();
    await expect(generateReviewedDailyHomefeedArticle({ source }, {
      generate, review: async () => ({ title: '선정한 다른 제목' }), validate,
    })).rejects.toThrow('DAILY_TITLE_LOCK_MISMATCH');
    expect(generate).toHaveBeenCalledTimes(2); expect(validate).not.toHaveBeenCalled();
    const fresh = { ...original, selectedTitle: '선정 제목' };
    generate.mockReset().mockResolvedValueOnce(original).mockResolvedValueOnce(fresh);
    await expect(generateReviewedDailyHomefeedArticle({ source }, {
      generate, review: async () => ({ title: fresh.selectedTitle }), validate: async () => { throw Error('PAYOFF_MISSING'); },
    })).rejects.toThrow('PAYOFF_MISSING');
    expect(generate).toHaveBeenCalledTimes(2);
  });
  it('preserves an explicit title and permits only a validation of that title', async () => {
    const locked = { ...original, selectedTitle: '직접 정한 제목' }, review = vi.fn();
    const validate = vi.fn(async () => ({}));
    expect(await generateReviewedDailyHomefeedArticle({ source: { ...source, manualTitleOverride: locked.selectedTitle } }, {
      generate: async () => locked, review, validate,
    })).toBe(locked);
    expect(review).not.toHaveBeenCalled(); expect(validate).toHaveBeenCalledWith(locked, locked.selectedTitle);
  });
  it('cancellation after review prevents regeneration and audit failure prevents completion', async () => {
    const abort = new AbortController(), generate = vi.fn(async () => original);
    await expect(generateReviewedDailyHomefeedArticle({ source, signal: abort.signal }, {
      generate, review: async () => { abort.abort(); return { title: '새 제목' }; }, validate: async () => ({}),
    })).rejects.toThrow('DAILY_CANCELLED');
    expect(generate).toHaveBeenCalledTimes(1);
    await expect(generateReviewedDailyHomefeedArticle({ source }, {
      generate, review: async () => ({ title: original.selectedTitle }), validate: async () => ({}), audit: async () => { throw Error('AUDIT_FAILED'); },
    })).rejects.toThrow('AUDIT_FAILED');
  });
  it('rejects every stale scene/gap/visual/payoff anchor before generation, review or audit', async () => {
    for (const key of ['scene', 'expectationGap', 'visualHook', 'bodyPayoff'] as const) {
      const generate = vi.fn(), review = vi.fn(), audit = vi.fn();
      await expect(generateReviewedDailyHomefeedArticle({ source: anchoredSource, editorial: { ...editorial, [key]: '다른 기사에서 본 장면을 이 자료의 사실처럼 가져왔습니다.' } }, {
        generate, review, audit, validate: vi.fn(),
      })).rejects.toThrow('DAILY_EDITORIAL_STALE');
      expect(generate).not.toHaveBeenCalled(); expect(review).not.toHaveBeenCalled(); expect(audit).not.toHaveBeenCalled();
    }
  });
  it('does not accept missing, nontext or unbounded angle evidence as editorial guidance', async () => {
    for (const value of [undefined, null, '', 123, 'x'.repeat(501)]) {
      const generate = vi.fn();
      await expect(generateReviewedDailyHomefeedArticle({ source: anchoredSource, editorial: { ...editorial, scene: value } as any }, {
        generate, review: vi.fn(), validate: vi.fn(),
      })).rejects.toThrow('DAILY_EDITORIAL_STALE');
      expect(generate).not.toHaveBeenCalled();
    }
    await expect(generateReviewedDailyHomefeedArticle({ source: { ...source, rawText: '' }, editorial }, {
      generate: vi.fn(), review: vi.fn(), validate: vi.fn(),
    })).rejects.toThrow('DAILY_EDITORIAL_STALE');
  });
  it('accepts normalized original evidence and keeps the source and angle unchanged', async () => {
    const normalized = { ...editorial, scene: 'AI 카메라로 공개된 실제 공간의 차이를 설명했습니다.' };
    const rawText = ['ＡＩ  카메라로\n공개된 실제 공간의 차이를 설명했습니다.', ...Object.values(editorial).slice(1, 4)].join('\n\n');
    const originalSource = Object.freeze({ ...source, rawText });
    const angle = Object.freeze(normalized), generate = vi.fn(async () => original);
    expect(await generateReviewedDailyHomefeedArticle({ source: originalSource, editorial: angle }, {
      generate, review: async () => ({ title: original.selectedTitle }), validate: vi.fn(),
    })).toBe(original);
    expect(generate.mock.calls[0][0].customPrompt).toContain(normalized.scene);
    expect(originalSource.customPrompt).toBe(source.customPrompt); expect(angle.scene).toBe(normalized.scene);
  });
  it('does not generate after pre-cancellation and stops before review after cancelled generation', async () => {
    const controller = new AbortController(); controller.abort(); const generate = vi.fn();
    await expect(generateReviewedDailyHomefeedArticle({ source, signal: controller.signal }, { generate, review: vi.fn(), validate: vi.fn() })).rejects.toThrow('DAILY_CANCELLED');
    expect(generate).not.toHaveBeenCalled();
    const late = new AbortController(), review = vi.fn();
    await expect(generateReviewedDailyHomefeedArticle({ source, signal: late.signal }, {
      generate: async () => { late.abort(); return original; }, review, validate: vi.fn(),
    })).rejects.toThrow('DAILY_CANCELLED');
    expect(review).not.toHaveBeenCalled();
  });
  it('rejects absent reviewer choice and a manual title mismatch without title rewriting', async () => {
    await expect(generateReviewedDailyHomefeedArticle({ source }, {
      generate: async () => original, review: async () => ({ title: '' }), validate: vi.fn(),
    })).rejects.toThrow('DAILY_TITLE_REVIEW_REQUIRED');
    const review = vi.fn(), validate = vi.fn();
    await expect(generateReviewedDailyHomefeedArticle({ source: { ...source, manualTitleOverride: '별도 수동 제목' } }, {
      generate: async () => original, review, validate,
    })).rejects.toThrow('DAILY_TITLE_LOCK_MISMATCH');
    expect(review).not.toHaveBeenCalled(); expect(validate).not.toHaveBeenCalled();
  });
});
