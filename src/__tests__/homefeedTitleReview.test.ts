import { describe, expect, it, vi } from 'vitest';
import { generateWithHomefeedReview, titleReviewGrounding } from '../content/homefeedTitleReview.js';

// 2026-10-21: 발행 화면 [글 생성] · 화면 다중계정 큐 · main 다중계정이 같은 홈판 제목 검수를 쓴다.
const article = (title: string) => ({ selectedTitle: title, bodyPlain: `${title} 본문입니다. 촬영하는 날이면 직접 집 앞으로 데리러 왔다고 말했습니다.` });
const source = { rawText: '촬영하는 날이면 직접 집 앞으로 데리러 왔다고 말했습니다. 두 배우는 30년 우정을 이어왔습니다.' };

describe('homefeed title review wrapper', () => {
  it('non-homefeed modes generate once without any review call', async () => {
    const generate = vi.fn(async () => article('검색형 제목'));
    const createCaller = vi.fn();
    const r = await generateWithHomefeedReview({ contentMode: 'seo', source, generate, createCaller });
    expect(r.titleReview).toBe('not-homefeed');
    expect(generate).toHaveBeenCalledTimes(1);
    expect(createCaller).not.toHaveBeenCalled();
  });

  it('homefeed runs the tournament review and the final promise check, and regenerates for a better title', async () => {
    const generate = vi.fn(async (s: { manualTitleOverride?: string }) => article(s.manualTitleOverride || '원래 제목'));
    const review = vi.fn(async () => ({ title: '토너먼트가 고른 제목' }));
    const validate = vi.fn(async () => ({}));
    const audit = vi.fn(async () => {});
    const r = await generateWithHomefeedReview({ contentMode: 'homefeed', source, generate, createCaller: async () => ({ complete: vi.fn(), timeoutMs: 1000 }), review, validate, audit });
    expect(r.titleReview).toBe('reviewed');
    expect(r.article.selectedTitle).toBe('토너먼트가 고른 제목');
    expect(review.mock.calls[0][1]).toMatchObject({ tournament: true });
    expect(validate).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledTimes(1);
  });

  // 2026-11-03 사장님 "DAILY_TITLE_QUALITY … 이러면서 글생성이안되네": [글 생성] 20분 결과(생성 → 토너먼트가 고른 제목으로
  //   재생성)를 마지막 제목 검수 한 번이 통째로 버렸다. 사람이 보는 [글 생성]은 판정을 그대로 기록 · 경고하고 글은 돌려준다.
  //   무인 매일 발행(main.ts dailyContext 경로)은 generateReviewedDailyHomefeedArticle 를 직접 써서 지금처럼 보류한다.
  const titleError = (code: string, extra: Record<string, unknown> = {}) => Object.assign(new Error(`${code}: 검수 실패`), { code, ...extra });

  it('a failed final quality check keeps the reviewed article and warns with the critic reason (not silent)', async () => {
    const generate = vi.fn(async (s: { manualTitleOverride?: string }) => article(s.manualTitleOverride || '원래 제목'));
    const audit = vi.fn(async () => {});
    const log = vi.fn();
    const r = await generateWithHomefeedReview({ contentMode: 'homefeed', source, generate, log, audit,
      createCaller: async () => ({ complete: vi.fn(), timeoutMs: 1000 }), review: async () => ({ title: '토너먼트가 고른 제목' }),
      validate: async () => { throw titleError('DAILY_TITLE_QUALITY', { reasons: ['본문이 확정액인지 답하지 않는다'] }); } });
    expect(r.titleReview).toBe('review-warning');
    expect(r.article.selectedTitle).toBe('토너먼트가 고른 제목');
    expect(generate).toHaveBeenCalledTimes(2);
    const warning = log.mock.calls.map(c => c[0]).find(m => m.startsWith('⚠️'));
    expect(warning).toMatch(/제목을 확인/);
    expect(warning).toContain('본문이 확정액인지 답하지 않는다');
    expect(log.mock.calls.map(c => c[0]).join(' ')).not.toMatch(/통과했습니다/);
    // The verdict is recorded as it came back: never rewritten into a pass.
    expect((audit.mock.calls[0] as any)[0].validation).toMatchObject({ failed: 'DAILY_TITLE_QUALITY' });
  });

  it('a failed candidate review keeps the first article, does not regenerate and skips the final check', async () => {
    const generate = vi.fn(async () => article('원래 제목'));
    const validate = vi.fn(async () => ({}));
    const log = vi.fn();
    const r = await generateWithHomefeedReview({ contentMode: 'homefeed', source, generate, validate, log,
      createCaller: async () => ({ complete: vi.fn(), timeoutMs: 1000 }),
      review: async () => { throw titleError('DAILY_TITLE_ENGINE_FAILED'); } });
    expect(r.titleReview).toBe('review-warning');
    expect(r.article.selectedTitle).toBe('원래 제목');
    expect(generate).toHaveBeenCalledTimes(1);
    expect(validate).not.toHaveBeenCalled();
    expect(log.mock.calls.map(c => c[0]).find(m => m.startsWith('⚠️'))).toMatch(/제목 검수를 끝내지 못했습니다/);
  });

  it('number or quote mismatches warn to check the title figures by hand', async () => {
    const log = vi.fn();
    const r = await generateWithHomefeedReview({ contentMode: 'homefeed', source, generate: async () => article('원래 제목'), log,
      createCaller: async () => ({ complete: vi.fn(), timeoutMs: 1000 }), review: async () => ({ title: '원래 제목' }),
      validate: async () => { throw titleError('DAILY_TITLE_NUMBER'); } });
    expect(r.titleReview).toBe('review-warning');
    expect(log.mock.calls.map(c => c[0]).find(m => m.startsWith('⚠️'))).toMatch(/숫자 · 인용/);
  });

  it('cancellation and non-title errors still stop the article', async () => {
    const base = { contentMode: 'homefeed', source, generate: async () => article('원래 제목'),
      createCaller: async () => ({ complete: vi.fn(), timeoutMs: 1000 }), review: async () => ({ title: '원래 제목' }) };
    await expect(generateWithHomefeedReview({ ...base, validate: async () => { throw titleError('DAILY_TITLE_CANCELLED'); } })).rejects.toThrow('DAILY_TITLE_CANCELLED');
    await expect(generateWithHomefeedReview({ ...base, validate: async () => { throw new Error('네트워크 끊김'); } })).rejects.toThrow('네트워크 끊김');
  });

  it('a long collected source fits the 48,000-char title input and keeps the answer from its tail', async () => {
    // 2026-10-21 실측: 키워드 수집 원문 61,209자가 그대로 넘어가 DAILY_TITLE_INPUT 으로 멈췄다.
    const tail = '결국 그 장면은 미리 약속한 깜짝 선물이었다고 밝혔습니다.';
    const long = { rawText: `${'방송 이야기와 출연자 근황을 길게 정리한 문장입니다. '.repeat(2400)}
${tail}` };
    expect(long.rawText.length).toBeGreaterThan(61_000);
    const grounding = titleReviewGrounding(long.rawText);
    expect(grounding.length).toBeLessThanOrEqual(48_000);
    expect(grounding).toContain(tail);
    const review = vi.fn(async () => ({ title: '원래 제목' }));
    const validate = vi.fn(async () => ({}));
    await generateWithHomefeedReview({ contentMode: 'homefeed', source: long, generate: async () => article('원래 제목'),
      createCaller: async () => ({ complete: vi.fn(), timeoutMs: 1000 }), review, validate });
    for (const fn of [review, validate]) expect((fn.mock.calls[0] as any)[0].sourceGrounding).toBe(grounding);
  });

  it('an engine without a review route or a source without original text is reported, not hidden', async () => {
    const log = vi.fn();
    const unsupported = await generateWithHomefeedReview({ contentMode: 'homefeed', source, generate: async () => article('제목'), createCaller: async () => null, log });
    expect(unsupported.titleReview).toBe('unsupported-engine');
    const noSource = await generateWithHomefeedReview({ contentMode: 'homefeed', source: { rawText: '' }, generate: async () => article('제목'), createCaller: async () => ({ complete: vi.fn(), timeoutMs: 1000 }), log });
    expect(noSource.titleReview).toBe('no-source');
    expect(log.mock.calls.map(c => c[0]).join(' ')).toMatch(/제목 검수를 하지 못했습니다/);
  });
});
