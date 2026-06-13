/**
 * SPEC-IMAGE-NARRATIVE-2026 Phase 2 — NarrativeBuilder tests.
 *
 * Covers:
 * - buildNarrativeContent: mode-based prompt routing
 * - NarrativePlan → StructuredContent conversion
 * - Provider dispatch (gemini / openai / claude)
 * - JSON parse error handling
 * - Empty AI response handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  NarrativePlan,
  InferenceMode,
  InferenceResponse,
  EnrichedInferenceResponse,
} from '../imageNarrative/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEnrichedResponse(imageId: string, mode: InferenceMode = 'travel'): EnrichedInferenceResponse {
  return {
    imageId,
    result: {
      scene_type: mode,
      location_hint: '서울 홍대',
      food_items: [],
      mood_keywords: ['활기찬'],
      description_ko: `${imageId} 사진의 멋진 장면입니다.`,
      confidence: 0.85,
    },
    provider: 'gemini',
    latencyMs: 100,
    exif: { takenAt: '2024-07-15T10:00:00Z' },
  };
}

function makePlan(mode: InferenceMode = 'travel'): NarrativePlan {
  return {
    mode,
    sections: [
      {
        heading: '도착 장면',
        imageRefs: ['img-001'],
        beats: ['홍대 거리에 도착했습니다.'],
      },
      {
        heading: '탐방 시작',
        imageRefs: ['img-002'],
        beats: ['골목골목을 탐험했습니다.'],
      },
    ],
    needsUserReview: false,
    warnings: [],
    orderedResults: [
      makeEnrichedResponse('img-001', mode),
      makeEnrichedResponse('img-002', mode),
    ],
  };
}

const MOCK_AI_RESPONSE = JSON.stringify({
  title: '홍대 여행기 — 활기찬 거리를 걷다',
  introduction: '오랜만에 홍대를 방문했어요. 설레는 마음으로 골목에 들어섰습니다.',
  sections: [
    {
      heading: '도착, 첫인상',
      content: '홍대 입구역에서 내렸을 때 느낀 첫 인상은 정말 특별했어요.\n\n사람들의 활기찬 에너지가 느껴졌습니다.',
      imageRef: 'img-001',
    },
    {
      heading: '골목 탐방',
      content: '좁은 골목을 따라 걷다 보니 작은 카페들이 눈에 들어왔어요.\n\n각자의 개성이 넘치는 가게들이 매력적이었습니다.',
      imageRef: 'img-002',
    },
  ],
  conclusion: '홍대는 언제 가도 새로운 매력이 있는 곳이에요. 다음에 또 오고 싶습니다.',
  tags: ['홍대', '서울여행', '데이트코스', '카페거리', '주말여행'],
  seoKeyword: '홍대 여행',
});

describe('buildNarrativeContent hardening', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env['GEMINI_API_KEY'] = 'test-key';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env['GEMINI_API_KEY'];
  });

  it('parses a JSON object even when the model wraps it with prose', async () => {
    vi.doMock('../gemini', () => ({
      getGeminiModel: vi.fn().mockReturnValue({
        model: {
          generateContent: vi.fn().mockResolvedValue({
            response: { text: () => `Here is the post:\n${MOCK_AI_RESPONSE}\nDone.` },
          }),
        },
        modelName: 'gemini-test',
      }),
    }));

    const { buildNarrativeContent } = await import('../imageNarrative/narrativeBuilder/builder');
    const content = await buildNarrativeContent(makePlan('travel'));

    expect(content.status).toBe('success');
    expect(content.bodyHtml.length).toBeGreaterThan(0);
  });

  it('does not pass model-returned script tags into bodyHtml', async () => {
    vi.doMock('../gemini', () => ({
      getGeminiModel: vi.fn().mockReturnValue({
        model: {
          generateContent: vi.fn().mockResolvedValue({
            response: {
              text: () => JSON.stringify({
                title: '<script>alert(1)</script>safe title',
                introduction: '<img src=x onerror=alert(1)>intro',
                sections: [
                  {
                    heading: '<script>alert(2)</script>heading',
                    content: 'content <script>alert(3)</script>',
                  },
                ],
                conclusion: 'done',
                tags: ['<b>tag</b>'],
              }),
            },
          }),
        },
        modelName: 'gemini-test',
      }),
    }));

    const { buildNarrativeContent } = await import('../imageNarrative/narrativeBuilder/builder');
    const content = await buildNarrativeContent(makePlan('travel'));

    expect(content.bodyHtml).not.toContain('<script');
    expect(content.bodyHtml).not.toContain('onerror');
    expect(content.selectedTitle).toBe('safe title');
    expect(content.hashtags).toEqual(['tag']);
  });
});

// ---------------------------------------------------------------------------
// Builder tests
// ---------------------------------------------------------------------------

describe('buildNarrativeContent — provider dispatch', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env['GEMINI_API_KEY'] = 'test-gemini-key';
    process.env['OPENAI_API_KEY'] = 'test-openai-key';
    process.env['ANTHROPIC_API_KEY'] = 'test-claude-key';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env['GEMINI_API_KEY'];
    delete process.env['OPENAI_API_KEY'];
    delete process.env['ANTHROPIC_API_KEY'];
  });

  it('calls Gemini provider when provider is gemini', async () => {
    const mockGenerateContent = vi.fn().mockResolvedValue({
      response: { text: () => MOCK_AI_RESPONSE },
    });

    vi.doMock('../gemini', () => ({
      getGeminiModel: vi.fn().mockReturnValue({
        model: { generateContent: mockGenerateContent },
        modelName: 'gemini-2.5-flash',
      }),
    }));

    const { buildNarrativeContent } = await import('../imageNarrative/narrativeBuilder/builder');
    const plan = makePlan('travel');
    const content = await buildNarrativeContent(plan, { provider: 'gemini' });

    expect(content.status).toBe('success');
    expect(content.selectedTitle).toContain('홍대');
    expect(mockGenerateContent).toHaveBeenCalledOnce();
  });

  it('calls OpenAI provider when provider is openai', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [{ message: { content: MOCK_AI_RESPONSE } }],
    });

    vi.doMock('openai', () => ({
      default: function OpenAI() {
        return { chat: { completions: { create: mockCreate } } };
      },
    }));

    vi.doMock('../gemini', () => ({
      getGeminiModel: vi.fn().mockReturnValue({ model: {}, modelName: 'gemini' }),
    }));

    const { buildNarrativeContent } = await import('../imageNarrative/narrativeBuilder/builder');
    const plan = makePlan('food');
    const content = await buildNarrativeContent(plan, { provider: 'openai' });

    expect(content.status).toBe('success');
    expect(mockCreate).toHaveBeenCalledOnce();
  });
});

describe('buildNarrativeContent — NarrativePlan to StructuredContent', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env['GEMINI_API_KEY'] = 'test-key';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env['GEMINI_API_KEY'];
  });

  it('maps sections to headings correctly', async () => {
    vi.doMock('../gemini', () => ({
      getGeminiModel: vi.fn().mockReturnValue({
        model: {
          generateContent: vi.fn().mockResolvedValue({
            response: { text: () => MOCK_AI_RESPONSE },
          }),
        },
        modelName: 'gemini-test',
      }),
    }));

    const { buildNarrativeContent } = await import('../imageNarrative/narrativeBuilder/builder');
    const plan = makePlan('travel');
    const content = await buildNarrativeContent(plan);

    expect(content.headings).toHaveLength(2);
    expect(content.headings[0]!.title).toBe('도착, 첫인상');
  });

  it('maps tags to hashtags', async () => {
    vi.doMock('../gemini', () => ({
      getGeminiModel: vi.fn().mockReturnValue({
        model: {
          generateContent: vi.fn().mockResolvedValue({
            response: { text: () => MOCK_AI_RESPONSE },
          }),
        },
        modelName: 'gemini-test',
      }),
    }));

    const { buildNarrativeContent } = await import('../imageNarrative/narrativeBuilder/builder');
    const plan = makePlan('travel');
    const content = await buildNarrativeContent(plan);

    expect(content.hashtags).toContain('홍대');
    expect(content.hashtags).toContain('서울여행');
  });

  it('sets introduction and conclusion from AI response', async () => {
    vi.doMock('../gemini', () => ({
      getGeminiModel: vi.fn().mockReturnValue({
        model: {
          generateContent: vi.fn().mockResolvedValue({
            response: { text: () => MOCK_AI_RESPONSE },
          }),
        },
        modelName: 'gemini-test',
      }),
    }));

    const { buildNarrativeContent } = await import('../imageNarrative/narrativeBuilder/builder');
    const plan = makePlan('travel');
    const content = await buildNarrativeContent(plan);

    expect(content.introduction).toBeTruthy();
    expect(content.conclusion).toBeTruthy();
  });

  it('sets metadata correctly', async () => {
    vi.doMock('../gemini', () => ({
      getGeminiModel: vi.fn().mockReturnValue({
        model: {
          generateContent: vi.fn().mockResolvedValue({
            response: { text: () => MOCK_AI_RESPONSE },
          }),
        },
        modelName: 'gemini-test',
      }),
    }));

    const { buildNarrativeContent } = await import('../imageNarrative/narrativeBuilder/builder');
    const plan = makePlan('travel');
    const content = await buildNarrativeContent(plan);

    expect(content.metadata.category).toBe('travel');
    expect(content.metadata.wordCount).toBeGreaterThan(0);
  });

  it('passes user photo context into the generation prompt', async () => {
    const mockGenerateContent = vi.fn().mockResolvedValue({
      response: { text: () => MOCK_AI_RESPONSE },
    });

    vi.doMock('../gemini', () => ({
      getGeminiModel: vi.fn().mockReturnValue({
        model: { generateContent: mockGenerateContent },
        modelName: 'gemini-test',
      }),
    }));

    const { buildNarrativeContent } = await import('../imageNarrative/narrativeBuilder/builder');
    await buildNarrativeContent(makePlan('travel'), {
      provider: 'gemini',
      context: {
        timeHint: '토요일 오후',
        mainPeople: '엄마와 아이',
        place: '강릉 바다',
        occasion: '가족 여행',
        notes: '첫 사진은 도착 직후입니다.',
      },
    });

    const request = mockGenerateContent.mock.calls[0]?.[0] as any;
    const prompt = request?.contents?.[0]?.parts?.[0]?.text ?? '';
    expect(prompt).toContain('토요일 오후');
    expect(prompt).toContain('엄마와 아이');
    expect(prompt).toContain('강릉 바다');
    expect(prompt).toContain('가족 여행');
    expect(prompt).toContain('첫 사진은 도착 직후입니다.');
  });
});

describe('buildNarrativeContent — mode routing', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env['GEMINI_API_KEY'] = 'test-key';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env['GEMINI_API_KEY'];
  });

  const modes: InferenceMode[] = ['travel', 'food', 'lodging', 'daily', 'review'];

  for (const mode of modes) {
    it(`handles mode: ${mode}`, async () => {
      vi.doMock('../gemini', () => ({
        getGeminiModel: vi.fn().mockReturnValue({
          model: {
            generateContent: vi.fn().mockResolvedValue({
              response: { text: () => MOCK_AI_RESPONSE },
            }),
          },
          modelName: 'gemini-test',
        }),
      }));

      const { buildNarrativeContent } = await import('../imageNarrative/narrativeBuilder/builder');
      const plan = makePlan(mode);
      const content = await buildNarrativeContent(plan, { provider: 'gemini' });
      expect(content.status).toBe('success');
    });
  }
});

describe('buildNarrativeContent — error handling', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env['GEMINI_API_KEY'] = 'test-key';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env['GEMINI_API_KEY'];
  });

  it('throws when AI returns empty response', async () => {
    vi.doMock('../gemini', () => ({
      getGeminiModel: vi.fn().mockReturnValue({
        model: {
          generateContent: vi.fn().mockResolvedValue({
            response: { text: () => '' },
          }),
        },
        modelName: 'gemini-test',
      }),
    }));

    const { buildNarrativeContent } = await import('../imageNarrative/narrativeBuilder/builder');
    const plan = makePlan('travel');
    await expect(buildNarrativeContent(plan)).rejects.toThrow(/empty response/i);
  });

  it('throws when AI returns invalid JSON', async () => {
    vi.doMock('../gemini', () => ({
      getGeminiModel: vi.fn().mockReturnValue({
        model: {
          generateContent: vi.fn().mockResolvedValue({
            response: { text: () => 'not valid json {{{}}}' },
          }),
        },
        modelName: 'gemini-test',
      }),
    }));

    const { buildNarrativeContent } = await import('../imageNarrative/narrativeBuilder/builder');
    const plan = makePlan('travel');
    await expect(buildNarrativeContent(plan)).rejects.toThrow(/JSON/i);
  });

  it('throws when GEMINI_API_KEY is missing', async () => {
    delete process.env['GEMINI_API_KEY'];

    vi.doMock('../gemini', () => ({
      getGeminiModel: vi.fn().mockReturnValue({ model: {}, modelName: 'gemini' }),
    }));

    const { buildNarrativeContent } = await import('../imageNarrative/narrativeBuilder/builder');
    const plan = makePlan('travel');
    await expect(buildNarrativeContent(plan, { provider: 'gemini' })).rejects.toThrow(
      /GEMINI_API_KEY/,
    );
  });
});
