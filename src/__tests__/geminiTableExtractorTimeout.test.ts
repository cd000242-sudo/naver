// 2026-11-25 live run: the publish typed the last section and then sat at "장단점 비교 표 이미지 생성 중..." until the
// owner closed the app. The side call that extracts pros and cons had no time limit, so a request that never answered
// held the whole automation. These tests pin the limit: a silent side call ends as "no table", never as a hang.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const generateContent = vi.fn();
vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() { return { generateContent }; }
  },
}));

import { TABLE_EXTRACT_TIMEOUT_MS, extractProsConsWithGemini, extractSpecsWithGemini } from '../image/geminiTableExtractor';

describe('table side calls: a request that never answers cannot hold the publish', () => {
  beforeEach(() => { vi.useFakeTimers(); generateContent.mockReset(); });
  afterEach(() => { vi.useRealTimers(); });

  it('pros and cons: gives up after the limit and answers "no table"', async () => {
    generateContent.mockReturnValue(new Promise(() => undefined)); // never settles
    const pending = extractProsConsWithGemini('제품', '본문', 'test-key');
    let settled = false;
    void pending.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(TABLE_EXTRACT_TIMEOUT_MS - 100);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    await expect(pending).resolves.toEqual({ pros: [], cons: [] });
  });

  it('specs: gives up after the limit and answers "no table"', async () => {
    generateContent.mockReturnValue(new Promise(() => undefined));
    const pending = extractSpecsWithGemini('제품', null, '본문', 'test-key');
    await vi.advanceTimersByTimeAsync(TABLE_EXTRACT_TIMEOUT_MS + 100);
    await expect(pending).resolves.toEqual([]);
  });

  it('an answer inside the limit is used as before', async () => {
    generateContent.mockResolvedValue({ response: { text: () => '{"pros":["가볍다"],"cons":["소음이 있다"]}' } });
    await expect(extractProsConsWithGemini('제품', '본문', 'test-key')).resolves.toEqual({ pros: ['가볍다'], cons: ['소음이 있다'] });
  });

  it('the limit is short enough for a publish in progress', () => {
    expect(TABLE_EXTRACT_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });
});
