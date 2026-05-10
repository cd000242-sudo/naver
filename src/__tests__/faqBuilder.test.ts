/**
 * SPEC-CONVERSION-001 L2-3.2 — faqBuilder 단위 테스트.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildFaqSection, isFaqBuilderEnabled } from '../content/faqBuilder';
import type { LLMProvider } from '../content/draftWriter';
import type { PersonaProfile } from '../content/personaBuilder';

const persona: PersonaProfile = {
  name: '지영', age: '30대', occupation: '직장인', experienceYears: 5,
  tone: 'casual',
  vocabularyHints: ['실사용', '솔직히'],
  forbiddenPhrases: ['최고의', '무조건'],
  category: 'general',
};

const sampleVoice = [
  '이 카페 가격대는 어느 정도인가요?',
  '주차는 가능한가요?',
  '메뉴 추천 부탁드려요',
  '아이 동반 가능한지 궁금해요',
  '주말에도 운영하나요?',
];

function fakeLLM(text: string): LLMProvider {
  return { complete: vi.fn(async () => text) };
}

const longFaq = `### Q. 가격대는 어느 정도인가요?
본문에서 언급한 평균 12,000원대입니다.

### Q. 주차는 가능한가요?
본문 좌석·공간 단락에 안내되어 있습니다.

### Q. 메뉴 추천은?
디저트와 라떼가 인상적이었어요.`;

describe('isFaqBuilderEnabled', () => {
  beforeEach(() => { delete process.env.FAQ_BUILDER_V1; });
  it('기본 OFF', () => expect(isFaqBuilderEnabled()).toBe(false));
  it('forceFlag=true → ON', () => expect(isFaqBuilderEnabled(true)).toBe(true));
  it('env=on → ON', () => {
    process.env.FAQ_BUILDER_V1 = 'on';
    expect(isFaqBuilderEnabled()).toBe(true);
  });
});

describe('buildFaqSection — flag OFF', () => {
  it('flag OFF면 빈 결과 + 명시 reason + LLM 호출 없음', async () => {
    const llm = fakeLLM(longFaq);
    const r = await buildFaqSection({
      userVoice: sampleVoice,
      persona,
      bodyFactsSummary: '본문 사실 요약',
      llmProvider: llm,
      forceFlag: false,
    });
    expect(r.enabled).toBe(false);
    expect(r.faqMarkdown).toBe('');
    expect(r.fallbackReason).toMatch(/FAQ_BUILDER_V1 미활성화/);
    expect((llm.complete as any).mock.calls).toHaveLength(0);
  });
});

describe('buildFaqSection — 정상 흐름', () => {
  it('userVoice 충분 + LLM 정상 → markdown 반환', async () => {
    const r = await buildFaqSection({
      userVoice: sampleVoice,
      persona,
      bodyFactsSummary: '본문 사실: 가격대 12,000원, 디저트 인상적',
      llmProvider: fakeLLM(longFaq),
      forceFlag: true,
    });
    expect(r.enabled).toBe(true);
    expect(r.faqMarkdown).toContain('### Q.');
    expect(r.itemCount).toBe(sampleVoice.length);
  });

  it('userVoice 15개 초과는 prompt에 15개로 제한', async () => {
    const many = Array(20).fill(0).map((_, i) => `질문 ${i}?`);
    const llm = fakeLLM(longFaq);
    const r = await buildFaqSection({
      userVoice: many,
      persona,
      bodyFactsSummary: 'x',
      llmProvider: llm,
      forceFlag: true,
    });
    expect(r.itemCount).toBe(15);
  });
});

describe('buildFaqSection — fallback (silent 폴백 X)', () => {
  it('userVoice 3개 미만은 명시 reason + 빈 결과', async () => {
    const r = await buildFaqSection({
      userVoice: ['질문 1', '질문 2'],
      persona,
      bodyFactsSummary: 'x',
      llmProvider: fakeLLM(longFaq),
      forceFlag: true,
    });
    expect(r.faqMarkdown).toBe('');
    expect(r.fallbackReason).toMatch(/USER_VOICE_TOO_FEW/);
  });

  it('LLM 실패는 명시 reason — throw X (FAQ는 보조 섹션이라 본문 흐름 보존)', async () => {
    const failing: LLMProvider = {
      complete: vi.fn(async () => { throw new Error('rate limit'); }),
    };
    const r = await buildFaqSection({
      userVoice: sampleVoice,
      persona,
      bodyFactsSummary: 'x',
      llmProvider: failing,
      forceFlag: true,
    });
    expect(r.faqMarkdown).toBe('');
    expect(r.fallbackReason).toMatch(/LLM_FAILED.*rate limit/);
  });

  it('LLM 응답 너무 짧으면 명시 reason', async () => {
    const r = await buildFaqSection({
      userVoice: sampleVoice,
      persona,
      bodyFactsSummary: 'x',
      llmProvider: fakeLLM('짧은 응답'),
      forceFlag: true,
    });
    expect(r.faqMarkdown).toBe('');
    expect(r.fallbackReason).toMatch(/OUTPUT_TOO_SHORT/);
  });

  it('LLM provider null은 throw', async () => {
    await expect(buildFaqSection({
      userVoice: sampleVoice,
      persona,
      bodyFactsSummary: 'x',
      llmProvider: null as any,
      forceFlag: true,
    })).rejects.toThrow(/LLM_PROVIDER_INVALID/);
  });
});

describe('buildFaqSection — 보안 (sanitize)', () => {
  it('전화·이메일·@핸들 제거', async () => {
    let capturedPrompt = '';
    const provider: LLMProvider = {
      complete: vi.fn(async (p) => { capturedPrompt = p; return longFaq; }),
    };
    await buildFaqSection({
      userVoice: [
        '전화 010-1234-5678 가능?',
        '이메일 abc@x.com으로 답변?',
        '@user_handle 추천 부탁',
        '진짜 일반 질문',
        '메뉴 추천?',
      ],
      persona,
      bodyFactsSummary: 'x',
      llmProvider: provider,
      forceFlag: true,
    });
    expect(capturedPrompt).not.toMatch(/010-\d+-\d+/);
    expect(capturedPrompt).not.toMatch(/abc@x\.com/);
    expect(capturedPrompt).not.toMatch(/@user_handle/);
  });
});
