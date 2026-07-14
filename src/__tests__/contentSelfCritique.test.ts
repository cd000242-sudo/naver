import { describe, it, expect, vi } from 'vitest';
import {
  parseCritiqueResponse,
  selfCritiqueAndRewrite,
  isSelfCritiqueEnabled,
} from '../contentSelfCritique.js';

const FAKE_PERSONA = '[WRITER PERSONA]\nIT 5년차 화자입니다.\n';

const LONG_BODY = (
  '오늘 새로 구매한 노트북에 대한 리뷰입니다. ' +
  '예전 기기에 비해 가벼워졌고 휴대성이 확실히 좋아졌습니다. ' +
  '배터리 시간은 하루 작업에 부족함이 없는 수준이었습니다. ' +
  '발열은 무거운 작업 시 손등에 느껴지는 정도였습니다. ' +
  '가성비를 따지면 동급 모델 대비 만족스러운 편이라고 봅니다. '
).repeat(3);

describe('parseCritiqueResponse', () => {
  it('parses a well-formed rewrite JSON', () => {
    const raw = '{"rewrote":true,"body":"수정된 본문"}';
    const parsed = parseCritiqueResponse(raw);
    expect(parsed.rewrote).toBe(true);
    expect(parsed.body).toBe('수정된 본문');
  });

  it('handles no-op response (rewrote=false)', () => {
    const raw = '{"rewrote":false,"body":"원본 그대로"}';
    const parsed = parseCritiqueResponse(raw);
    expect(parsed.rewrote).toBe(false);
  });

  it('strips markdown fences', () => {
    const raw = '```json\n{"rewrote":true,"body":"내용"}\n```';
    const parsed = parseCritiqueResponse(raw);
    expect(parsed.body).toBe('내용');
  });
});

describe('selfCritiqueAndRewrite', () => {
  it('sends a readable Korean repair prompt instead of mojibake', async () => {
    const captured: string[] = [];
    const modelCall = vi.fn().mockImplementation(async (prompt: string) => {
      captured.push(prompt);
      return JSON.stringify({ rewrote: false, body: LONG_BODY });
    });

    await selfCritiqueAndRewrite(LONG_BODY, FAKE_PERSONA, modelCall, '도입부를 자연스럽게 고치세요.');

    expect(captured[0]).toContain('당신은 한국어 블로그 글의 편집자입니다');
    expect(captured[0]).toContain('JSON으로만 답하세요');
    expect(captured[0]).toContain('도입부를 자연스럽게 고치세요.');
    expect(captured[0]).not.toMatch(/[媛吏諛]/);
  });

  it('skips when body is too short', async () => {
    const geminiCall = vi.fn();
    const result = await selfCritiqueAndRewrite('짧은 본문', FAKE_PERSONA, geminiCall);
    expect(result.source).toBe('skipped');
    expect(result.rewrote).toBe(false);
    expect(geminiCall).not.toHaveBeenCalled();
  });

  it('returns rewritten body when LLM rewrites', async () => {
    const rewritten = LONG_BODY.replace('가벼워졌고', '한층 가벼워진 느낌이고');
    const geminiCall = vi.fn().mockResolvedValue(
      JSON.stringify({ rewrote: true, body: rewritten }),
    );
    const result = await selfCritiqueAndRewrite(LONG_BODY, FAKE_PERSONA, geminiCall);
    expect(result.rewrote).toBe(true);
    expect(result.source).toBe('critique');
    expect(result.body).toBe(rewritten);
  });

  it('preserves original when LLM signals no-op', async () => {
    const geminiCall = vi.fn().mockResolvedValue(
      JSON.stringify({ rewrote: false, body: LONG_BODY }),
    );
    const result = await selfCritiqueAndRewrite(LONG_BODY, FAKE_PERSONA, geminiCall);
    expect(result.rewrote).toBe(false);
    expect(result.body).toBe(LONG_BODY);
  });

  it('rejects rewrites that lose too much content (safety guard)', async () => {
    const truncated = LONG_BODY.substring(0, Math.floor(LONG_BODY.length * 0.5));
    const geminiCall = vi.fn().mockResolvedValue(
      JSON.stringify({ rewrote: true, body: truncated }),
    );
    const result = await selfCritiqueAndRewrite(LONG_BODY, FAKE_PERSONA, geminiCall);
    expect(result.rewrote).toBe(false);
    expect(result.source).toBe('fallback');
    expect(result.body).toBe(LONG_BODY);
  });

  it('rejects rewrites that balloon too much (safety guard)', async () => {
    const inflated = LONG_BODY + LONG_BODY; // 2x size
    const geminiCall = vi.fn().mockResolvedValue(
      JSON.stringify({ rewrote: true, body: inflated }),
    );
    const result = await selfCritiqueAndRewrite(LONG_BODY, FAKE_PERSONA, geminiCall);
    expect(result.rewrote).toBe(false);
    expect(result.source).toBe('fallback');
  });

  it('falls back to original when LLM call throws', async () => {
    const geminiCall = vi.fn().mockRejectedValue(new Error('network'));
    const result = await selfCritiqueAndRewrite(LONG_BODY, FAKE_PERSONA, geminiCall);
    expect(result.rewrote).toBe(false);
    expect(result.source).toBe('fallback');
    expect(result.body).toBe(LONG_BODY);
  });

  it('falls back when LLM returns invalid JSON', async () => {
    const geminiCall = vi.fn().mockResolvedValue('not json');
    const result = await selfCritiqueAndRewrite(LONG_BODY, FAKE_PERSONA, geminiCall);
    expect(result.source).toBe('fallback');
    expect(result.body).toBe(LONG_BODY);
  });

  it('Phase 2.3 — extraDirective가 LLM 프롬프트에 포함됨', async () => {
    const captured: string[] = [];
    const geminiCall = vi.fn().mockImplementation(async (prompt: string) => {
      captured.push(prompt);
      return JSON.stringify({ rewrote: false, body: LONG_BODY });
    });
    const extraDirective = '[Quality Gate 지시] 어미 다양화 필수, AI 보고체 금지';
    await selfCritiqueAndRewrite(LONG_BODY, FAKE_PERSONA, geminiCall, extraDirective);
    expect(captured).toHaveLength(1);
    expect(captured[0]).toContain('Quality Gate 추가 지시');
    expect(captured[0]).toContain('어미 다양화 필수');
  });

  it('Phase 2.3 — extraDirective 없으면 기존 프롬프트 그대로', async () => {
    const captured: string[] = [];
    const geminiCall = vi.fn().mockImplementation(async (prompt: string) => {
      captured.push(prompt);
      return JSON.stringify({ rewrote: false, body: LONG_BODY });
    });
    await selfCritiqueAndRewrite(LONG_BODY, FAKE_PERSONA, geminiCall);
    expect(captured[0]).not.toContain('Quality Gate 추가 지시');
  });
});

describe('isSelfCritiqueEnabled', () => {
  it('respects explicit config flag', () => {
    expect(isSelfCritiqueEnabled({ enableSelfCritique: true })).toBe(true);
    expect(isSelfCritiqueEnabled({ enableSelfCritique: false })).toBe(false);
  });

  it('reads ENABLE_SELF_CRITIQUE env when config omitted', () => {
    const original = process.env.ENABLE_SELF_CRITIQUE;
    process.env.ENABLE_SELF_CRITIQUE = 'true';
    expect(isSelfCritiqueEnabled()).toBe(true);
    process.env.ENABLE_SELF_CRITIQUE = 'false';
    expect(isSelfCritiqueEnabled()).toBe(false);
    delete process.env.ENABLE_SELF_CRITIQUE;
    expect(isSelfCritiqueEnabled()).toBe(false);
    if (original !== undefined) process.env.ENABLE_SELF_CRITIQUE = original;
  });
});
