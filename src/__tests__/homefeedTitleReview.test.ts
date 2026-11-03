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

  it('a failed final check stops the article (no silent fallback to the unchecked draft)', async () => {
    await expect(generateWithHomefeedReview({ contentMode: 'homefeed', source, generate: async () => article('원래 제목'),
      createCaller: async () => ({ complete: vi.fn(), timeoutMs: 1000 }), review: async () => ({ title: '원래 제목' }),
      validate: async () => { throw new Error('DAILY_TITLE_PAYOFF: 본문이 약속을 회수하지 못했습니다'); } })).rejects.toThrow('DAILY_TITLE_PAYOFF');
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
