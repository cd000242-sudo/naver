import { describe, expect, it } from 'vitest';
import {
  getContentProviderTimeoutMs,
  getOpenAiContentTimeoutMs,
} from '../contentProviderTimeoutPolicy';

describe('contentProviderTimeoutPolicy', () => {
  it('uses bounded generation timeouts by requested article length', () => {
    expect(getContentProviderTimeoutMs(500)).toBe(60_000);
    expect(getContentProviderTimeoutMs(1800)).toBe(90_000);
    expect(getContentProviderTimeoutMs(3500)).toBe(120_000);
    expect(getContentProviderTimeoutMs(7000)).toBe(150_000);
    expect(getContentProviderTimeoutMs(12_000)).toBe(180_000);
  });

  /*
   * [2026-09-22 실사고 20260922-231111] 창을 출력 목표 글자수만으로 정해, 입력 96,272자
   * (≈56,600 토큰)짜리 요청이 90초에서 잘리고 글이 통째로 버려졌다(GENERATION_FAILED,
   * engine=claude/claude-sonnet-5). 입력 크기를 창에 반영한다.
   */
  it('widens the window for a large prompt — the same 2,500-char article with a 96K input', () => {
    expect(getContentProviderTimeoutMs(2500, 0, 0)).toBe(90_000);
    expect(getContentProviderTimeoutMs(2500, 0, 20_000)).toBe(90_000); // 기준선 이하는 그대로
    expect(getContentProviderTimeoutMs(2500, 0, 96_272)).toBe(147_204); // 실사고 입력 → 147초
    expect(getContentProviderTimeoutMs(2500, 0, 500_000)).toBe(180_000); // 가산 상한 90초
  });

  it('keeps the input bonus inside the renderer 360s budget even at the largest base', () => {
    expect(getContentProviderTimeoutMs(12_000, 2, 500_000)).toBeLessThan(360_000);
    expect(getOpenAiContentTimeoutMs(2500, 'gpt-4.1-mini', 0, 96_272)).toBeGreaterThan(90_000);
  });

  it('adds only a small retry multiplier so retries do not create long hangs', () => {
    expect(getContentProviderTimeoutMs(1800, 1)).toBe(94_500);
    expect(getContentProviderTimeoutMs(1800, 2)).toBe(99_000);
    expect(getContentProviderTimeoutMs(1800, 99)).toBe(99_000);
  });

  it('normalizes invalid input to the short-content timeout', () => {
    expect(getContentProviderTimeoutMs(Number.NaN)).toBe(60_000);
    expect(getContentProviderTimeoutMs(-100)).toBe(60_000);
  });

  it('gives GPT-5.6 long-form reasoning enough time without exceeding the renderer budget', () => {
    expect(getOpenAiContentTimeoutMs(1800, 'gpt-5.6-sol')).toBe(240_000);
    expect(getOpenAiContentTimeoutMs(1800, 'gpt-5.6-terra')).toBe(180_000);
    expect(getOpenAiContentTimeoutMs(1800, 'gpt-5.6-luna')).toBe(90_000);
    expect(getOpenAiContentTimeoutMs(650, 'gpt-5.6-sol')).toBe(120_000);
    expect(getOpenAiContentTimeoutMs(12_000, 'gpt-5.6-sol')).toBe(240_000);
  });
});
