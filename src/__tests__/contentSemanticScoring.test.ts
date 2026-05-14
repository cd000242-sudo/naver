import { describe, it, expect, vi } from 'vitest';
import {
  buildRubricPrompt,
  parseRubricResponse,
  analyzeContentBySemantic,
  isLlmRubricEnabled,
} from '../contentSemanticScoring.js';

const FAKE_FALLBACK = () => ({
  score: 42,
  details: { expertise: 40, originality: 40, readability: 44, engagement: 44 },
  suggestions: ['fallback-suggestion'],
});

describe('buildRubricPrompt', () => {
  it('embeds short text as-is without trimming marker', () => {
    const prompt = buildRubricPrompt('짧은 본문');
    expect(prompt).toContain('짧은 본문');
    expect(prompt).not.toContain('[...trimmed for evaluation]');
  });

  it('trims long text to 3500 chars and appends marker', () => {
    const long = 'A'.repeat(5000);
    const prompt = buildRubricPrompt(long);
    expect(prompt).toContain('[...trimmed for evaluation]');
    expect(prompt.length).toBeLessThan(RUBRIC_HEADER_LEN + 5000);
  });
});

const RUBRIC_HEADER_LEN = buildRubricPrompt('').length;

describe('parseRubricResponse', () => {
  it('parses well-formed JSON', () => {
    const raw = '{"expertise":85,"originality":75,"readability":90,"engagement":80,"reason":"좋음"}';
    const parsed = parseRubricResponse(raw);
    expect(parsed).toEqual({
      expertise: 85,
      originality: 75,
      readability: 90,
      engagement: 80,
      reason: '좋음',
    });
  });

  it('extracts JSON wrapped in markdown fence', () => {
    const raw = '```json\n{"expertise":50,"originality":60,"readability":70,"engagement":80,"reason":"ok"}\n```';
    const parsed = parseRubricResponse(raw);
    expect(parsed.expertise).toBe(50);
    expect(parsed.reason).toBe('ok');
  });

  it('clamps out-of-range scores to 0-100', () => {
    const raw = '{"expertise":150,"originality":-30,"readability":99,"engagement":"abc","reason":""}';
    const parsed = parseRubricResponse(raw);
    expect(parsed.expertise).toBe(100);
    expect(parsed.originality).toBe(0);
    expect(parsed.readability).toBe(99);
    expect(parsed.engagement).toBe(0);
  });

  it('handles trailing prose before JSON object', () => {
    const raw = '평가 결과입니다: {"expertise":70,"originality":70,"readability":70,"engagement":70,"reason":"보통"} 끝.';
    const parsed = parseRubricResponse(raw);
    expect(parsed.expertise).toBe(70);
  });
});

describe('analyzeContentBySemantic', () => {
  it('returns fallback when text is shorter than 50 chars', async () => {
    const geminiCall = vi.fn();
    const result = await analyzeContentBySemantic('짧음', geminiCall, FAKE_FALLBACK);
    expect(result.source).toBe('fallback');
    expect(result.score).toBe(42);
    expect(geminiCall).not.toHaveBeenCalled();
  });

  it('returns LLM score on successful response', async () => {
    const longText = '본문이 충분히 길어서 LLM rubric을 호출하기에 적합한 한국어 텍스트입니다. ' + 'A'.repeat(100);
    const geminiCall = vi.fn().mockResolvedValue(
      '{"expertise":90,"originality":80,"readability":85,"engagement":75,"reason":"잘 작성된 글"}',
    );
    const result = await analyzeContentBySemantic(longText, geminiCall, FAKE_FALLBACK);
    expect(result.source).toBe('llm');
    expect(result.details.expertise).toBe(90);
    expect(result.score).toBe(Math.round((90 + 80 + 85 + 75) / 4));
    expect(result.suggestions[0]).toBe('잘 작성된 글');
  });

  it('falls back when LLM call throws', async () => {
    const longText = '본문이 충분히 길어서 LLM rubric을 호출하기에 적합한 한국어 텍스트입니다. ' + 'A'.repeat(100);
    const geminiCall = vi.fn().mockRejectedValue(new Error('network failure'));
    const result = await analyzeContentBySemantic(longText, geminiCall, FAKE_FALLBACK);
    expect(result.source).toBe('fallback');
    expect(result.score).toBe(42);
  });

  it('falls back when LLM response is invalid JSON', async () => {
    const longText = '본문이 충분히 길어서 LLM rubric을 호출하기에 적합한 한국어 텍스트입니다. ' + 'A'.repeat(100);
    const geminiCall = vi.fn().mockResolvedValue('이건 JSON이 아닙니다');
    const result = await analyzeContentBySemantic(longText, geminiCall, FAKE_FALLBACK);
    expect(result.source).toBe('fallback');
  });

  it('appends improvement suggestions for low-scoring dimensions', async () => {
    const longText = '본문이 충분히 길어서 LLM rubric을 호출하기에 적합한 한국어 텍스트입니다. ' + 'A'.repeat(100);
    const geminiCall = vi.fn().mockResolvedValue(
      '{"expertise":50,"originality":60,"readability":65,"engagement":55,"reason":"부족"}',
    );
    const result = await analyzeContentBySemantic(longText, geminiCall, FAKE_FALLBACK);
    expect(result.suggestions.length).toBeGreaterThan(1);
    expect(result.suggestions.some((s) => s.includes('직접 경험'))).toBe(true);
  });
});

describe('isLlmRubricEnabled', () => {
  it('returns true when config.useLlmRubric is true', () => {
    expect(isLlmRubricEnabled({ useLlmRubric: true })).toBe(true);
  });

  it('returns false when config.useLlmRubric is false', () => {
    expect(isLlmRubricEnabled({ useLlmRubric: false })).toBe(false);
  });

  it('reads USE_LLM_RUBRIC env when config not set', () => {
    const original = process.env.USE_LLM_RUBRIC;
    process.env.USE_LLM_RUBRIC = 'true';
    expect(isLlmRubricEnabled()).toBe(true);
    process.env.USE_LLM_RUBRIC = 'false';
    expect(isLlmRubricEnabled()).toBe(false);
    delete process.env.USE_LLM_RUBRIC;
    expect(isLlmRubricEnabled()).toBe(false);
    if (original !== undefined) process.env.USE_LLM_RUBRIC = original;
  });
});
