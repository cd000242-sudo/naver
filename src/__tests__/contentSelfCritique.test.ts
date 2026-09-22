import { describe, it, expect, vi } from 'vitest';
import {
  CONCLUSION_DELIMITER,
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

/**
 * [2026-09-06 R0] patch 경로가 결론(conclusion)도 고칠 수 있어야 한다.
 * 이전에는 bodyPlain 만 넘겨서 "결론을 고쳐라"는 지시가 고칠 대상에 닿지 못했다.
 */
describe('selfCritiqueAndRewrite — 결론 편입', () => {
  const CONCLUSION = '결국 이 제품은 매일 쓰는 사람에게만 값을 합니다. 가끔 쓸 거면 사지 마세요.';

  it('결론을 주면 구분선 아래에 결론을 붙여 보내고, 구분선을 지키라고 지시한다', async () => {
    const captured: string[] = [];
    const call = vi.fn().mockImplementation(async (prompt: string) => {
      captured.push(prompt);
      return JSON.stringify({ rewrote: false, body: LONG_BODY });
    });
    await selfCritiqueAndRewrite(LONG_BODY, FAKE_PERSONA, call, undefined, CONCLUSION);
    expect(captured[0]).toContain(CONCLUSION_DELIMITER);
    expect(captured[0]).toContain(CONCLUSION);
    expect(captured[0].indexOf(CONCLUSION_DELIMITER)).toBeLessThan(captured[0].indexOf(CONCLUSION));
    expect(captured[0]).toMatch(/구분선.*그대로/);
  });

  it('구분선이 살아 돌아오면 본문과 결론을 갈라서 돌려준다', async () => {
    const newBody = LONG_BODY.replace('가벼워졌고', '한층 가벼워진 느낌이고');
    const newConclusion = '결국 이 제품은 매일 쓰는 사람에게 값을 합니다. 가끔 쓸 거면 사지 않는 편이 낫습니다.';
    const call = vi.fn().mockResolvedValue(
      JSON.stringify({ rewrote: true, body: `${newBody}\n\n${CONCLUSION_DELIMITER}\n${newConclusion}` }),
    );
    const result = await selfCritiqueAndRewrite(LONG_BODY, FAKE_PERSONA, call, undefined, CONCLUSION);
    expect(result.rewrote).toBe(true);
    expect(result.body).toBe(newBody.trim());
    expect(result.conclusion).toBe(newConclusion);
    expect(result.body).not.toContain(CONCLUSION_DELIMITER);
  });

  it('구분선이 사라져 돌아오면 어디까지가 결론인지 모르므로 둘 다 원본을 지킨다', async () => {
    const call = vi.fn().mockResolvedValue(
      JSON.stringify({ rewrote: true, body: `${LONG_BODY}\n\n${CONCLUSION}` }),
    );
    const result = await selfCritiqueAndRewrite(LONG_BODY, FAKE_PERSONA, call, undefined, CONCLUSION);
    expect(result.rewrote).toBe(false);
    expect(result.source).toBe('fallback');
    expect(result.body).toBe(LONG_BODY);
    expect(result.conclusion).toBe(CONCLUSION);
  });

  it('수정 없음(rewrote=false)이면 결론도 원본 그대로다', async () => {
    const call = vi.fn().mockResolvedValue(JSON.stringify({ rewrote: false, body: '' }));
    const result = await selfCritiqueAndRewrite(LONG_BODY, FAKE_PERSONA, call, undefined, CONCLUSION);
    expect(result.rewrote).toBe(false);
    expect(result.conclusion).toBe(CONCLUSION);
  });

  it('결론을 안 주면 프롬프트에 구분선이 없고 결과에도 conclusion 이 없다', async () => {
    const captured: string[] = [];
    const call = vi.fn().mockImplementation(async (prompt: string) => {
      captured.push(prompt);
      return JSON.stringify({ rewrote: false, body: LONG_BODY });
    });
    const result = await selfCritiqueAndRewrite(LONG_BODY, FAKE_PERSONA, call);
    expect(captured[0]).not.toContain(CONCLUSION_DELIMITER);
    expect(result.conclusion).toBeUndefined();
  });
});

/**
 * [2026-09-22 P1] Bodies over MAX_BODY_CHARS_FOR_CRITIQUE (16,000) are no longer skipped:
 * they are critiqued in paragraph-aligned sections so the WHOLE article is evaluated (option B).
 * A partial read is never presented as a full evaluation, and each section keeps the ≤3-sentence rule.
 */
describe('selfCritiqueAndRewrite — 상한 초과 본문은 문단 구간으로 나눠 전체를 본다', () => {
  it('20,000자 본문은 구간별로 LLM 을 호출하고 전 구간을 이어 붙인다', async () => {
    const paragraph = `${LONG_BODY.trim()}`;
    const HUGE_BODY = Array.from({ length: Math.ceil(20000 / paragraph.length) + 1 }, () => paragraph).join('\n\n');
    expect(HUGE_BODY.length).toBeGreaterThan(16000);

    const seen: string[] = [];
    const geminiCall = vi.fn(async (prompt: string) => {
      seen.push(prompt);
      return JSON.stringify({ rewrote: false, body: '' });
    });
    const result = await selfCritiqueAndRewrite(HUGE_BODY, FAKE_PERSONA, geminiCall);
    expect(geminiCall.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(geminiCall.mock.calls.length).toBeLessThanOrEqual(3);
    // every section prompt is under the single-call ceiling and together they cover the text
    for (const prompt of seen) expect(prompt).not.toContain('[...뒷부분 평가 생략]');
    const covered = seen.map((p) => p.slice(p.indexOf('[본문]'))).join('');
    expect(covered).toContain(paragraph.slice(0, 40));
    expect(covered).toContain(paragraph.slice(-40));
    expect(result.rewrote).toBe(false);
    expect(result.body).toBe(HUGE_BODY);
  });

  it('구간 하나만 고쳐도 나머지 구간은 원문 그대로 이어 붙이고 마무리는 보존한다', async () => {
    const paragraph = `${LONG_BODY.trim()}`;
    const HUGE_BODY = Array.from({ length: Math.ceil(20000 / paragraph.length) + 1 }, () => paragraph).join('\n\n');
    let n = 0;
    const geminiCall = vi.fn(async (prompt: string) => {
      n += 1;
      const body = prompt.slice(prompt.indexOf('---\n') + 4);
      return n === 1 ? JSON.stringify({ rewrote: true, body: body.replace('오늘 새로', '오늘 막') }) : JSON.stringify({ rewrote: false, body: '' });
    });
    const result = await selfCritiqueAndRewrite(HUGE_BODY, FAKE_PERSONA, geminiCall, undefined, '마무리 문단입니다.');
    expect(result.rewrote).toBe(true);
    expect(result.body).toContain('오늘 막');
    expect(result.body.length).toBeGreaterThan(HUGE_BODY.length * 0.95);
    expect(result.conclusion).toBe('마무리 문단입니다.');
  });

  it('검토 기준은 기관 귀속·자료 날짜를 지우라고 시키지 않는다 (P0 귀속 보존과 충돌 금지)', async () => {
    let captured = '';
    const geminiCall = vi.fn(async (prompt: string) => { captured = prompt; return JSON.stringify({ rewrote: false, body: '' }); });
    await selfCritiqueAndRewrite(LONG_BODY, FAKE_PERSONA, geminiCall);
    expect(captured).not.toMatch(/출처·날짜 메타만 제거/);
    expect(captured).toContain('절대 지우지 않는다');
    expect(captured).toContain('숫자·금액·날짜·정책명·기관명·제품명·인물명·직접 인용은 한 글자도 바꾸지 않는다');
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
