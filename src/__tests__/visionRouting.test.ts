// v2.7.62 — 다중 vendor vision 라우팅 회귀 가드
//
// Opus 5인 팀 토론 결론:
//   - 글 생성 AI에 따라 vision도 동일 vendor 사용
//   - vision 미지원 모델(Perplexity)은 Gemini Flash 폴백 (B안: 사용자에게 알림)

import { describe, it, expect } from 'vitest';
import { routeTextToVision, VISION_MODELS } from '../runtime/modelRegistry';

describe('routeTextToVision — 글 생성 AI → vision provider 매핑', () => {
  it('Gemini Flash → 동일 모델 (폴백 없음)', () => {
    const r = routeTextToVision('gemini-2.5-flash');
    expect(r.vendor).toBe('gemini');
    expect(r.model).toBe(VISION_MODELS.GEMINI_FLASH);
    expect(r.fellBack).toBe(false);
  });

  it('Gemini Pro → 동일 모델', () => {
    const r = routeTextToVision('gemini-2.5-pro');
    expect(r.vendor).toBe('gemini');
    expect(r.model).toBe(VISION_MODELS.GEMINI_PRO);
    expect(r.fellBack).toBe(false);
  });

  it('Gemini Flash-Lite → Flash로 자동 폴백 (Lite는 vision 없음)', () => {
    const r = routeTextToVision('gemini-2.5-flash-lite');
    expect(r.vendor).toBe('gemini');
    expect(r.model).toBe(VISION_MODELS.GEMINI_FLASH);
    expect(r.fellBack).toBe(true);
    expect(r.reason).toContain('Lite');
  });

  it('Claude Sonnet → 동일 모델 (Anthropic vision)', () => {
    const r = routeTextToVision('claude-sonnet');
    expect(r.vendor).toBe('claude');
    expect(r.model).toBe(VISION_MODELS.CLAUDE_SONNET);
    expect(r.fellBack).toBe(false);
  });

  it('OpenAI GPT-4.1 → 동일 모델 (OpenAI vision)', () => {
    const r = routeTextToVision('openai-gpt41');
    expect(r.vendor).toBe('openai');
    expect(r.model).toBe(VISION_MODELS.OPENAI_41);
    expect(r.fellBack).toBe(false);
  });

  it('OpenAI 4.1 mini → 동일 모델', () => {
    const r = routeTextToVision('openai-gpt4o-mini');
    expect(r.vendor).toBe('openai');
    expect(r.model).toBe(VISION_MODELS.OPENAI_41_MINI);
    expect(r.fellBack).toBe(false);
  });

  it('Perplexity Sonar → Gemini Flash 폴백 (Perplexity vision 미지원)', () => {
    const r = routeTextToVision('perplexity-sonar');
    expect(r.vendor).toBe('gemini');
    expect(r.model).toBe(VISION_MODELS.GEMINI_FLASH);
    expect(r.fellBack).toBe(true);
    expect(r.reason).toContain('Perplexity');
  });

  it('미지원 키 → Gemini Flash 기본 폴백 (안전)', () => {
    const r = routeTextToVision('unknown-future-model');
    expect(r.vendor).toBe('gemini');
    expect(r.model).toBe(VISION_MODELS.GEMINI_FLASH);
    expect(r.fellBack).toBe(true);
    expect(r.reason).toContain('미지원');
  });
});

describe('VISION_MODELS — SSOT 회귀 가드', () => {
  it('vision 모델 ID는 modelRegistry SSOT에서만 가져옴', () => {
    expect(VISION_MODELS.GEMINI_FLASH).toMatch(/^gemini-/);
    expect(VISION_MODELS.GEMINI_PRO).toMatch(/^gemini-/);
    expect(VISION_MODELS.CLAUDE_SONNET).toMatch(/^claude-/);
    expect(VISION_MODELS.OPENAI_41).toMatch(/^gpt-/);
    expect(VISION_MODELS.OPENAI_41_MINI).toMatch(/^gpt-/);
  });

  it('금지된 deprecate 모델 ID 미사용', () => {
    const ids = Object.values(VISION_MODELS) as string[];
    expect(ids).not.toContain('gpt-4o');
    expect(ids).not.toContain('gpt-4o-mini');
    expect(ids).not.toContain('claude-3-opus');
  });
});
