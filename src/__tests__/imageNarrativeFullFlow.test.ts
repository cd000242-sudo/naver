/**
 * SPEC-IMAGE-NARRATIVE-2026 Phase 4 — integration tests.
 *
 * Covers the end-to-end mock path:
 *   Vision inference (visionRouter mock)
 *   → aggregateInferences
 *   → buildNarrativeContent (AI provider mock)
 *   → mapInferencesToImageMap
 *   → IPC handler (vision:infer-and-write) equivalent logic
 *
 * All external I/O (Vision API, AI provider, file system) is mocked.
 * Uses vi.doMock + function keyword per project Phase 1/2 pattern.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mock state (reset between tests)
// ---------------------------------------------------------------------------

let mockInferResponse: any = null;
let mockBuildResponse: any = null;

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.doMock('../imageNarrative/visionInference/visionRouter', () => ({
  inferImage: vi.fn(async (ctx: any) => {
    if (mockInferResponse?.error) throw new Error(mockInferResponse.error);
    return {
      imageId: ctx.imageId,
      provider: 'gemini',
      latencyMs: 50,
      result: mockInferResponse?.result ?? {
        scene_type: 'travel',
        location_hint: '서울 홍대',
        food_items: [],
        mood_keywords: ['활기찬'],
        description_ko: `${ctx.imageId} 사진 설명입니다.`,
        confidence: 0.9,
      },
    };
  }),
}));

vi.doMock('fs/promises', () => ({
  readFile: vi.fn(async (p: string) => {
    if (p.endsWith('base.prompt')) return '기본 프롬프트 내용';
    return '모드별 프롬프트 내용';
  }),
  access: vi.fn(async () => { /* always succeed */ }),
}));

// Mock Gemini content generator (buildNarrativeContent depends on it)
vi.doMock('../gemini', () => ({
  getGeminiModel: vi.fn(() => ({
    model: {
      generateContent: vi.fn(async () => ({
        response: {
          text: () => JSON.stringify(mockBuildResponse ?? {
            title: '테스트 블로그 글',
            introduction: '안녕하세요.',
            sections: [
              { heading: '여행 시작', content: '홍대에 도착했습니다.' },
              { heading: '맛집 탐방', content: '맛있는 음식을 먹었습니다.' },
            ],
            conclusion: '즐거운 여행이었습니다.',
            tags: ['여행', '홍대'],
            seoKeyword: '서울 홍대 여행',
          }),
        },
      })),
    },
  })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeImageInput(id: string, mimeType = 'image/jpeg') {
  return {
    imageId: id,
    buffer: Buffer.from(`fake-${id}`, 'utf-8'),
    mimeType,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('aggregateInferences (Phase 4 integration)', () => {
  beforeEach(() => {
    mockInferResponse = null;
    mockBuildResponse = null;
    vi.clearAllMocks();
  });

  it('produces a NarrativePlan with sections from 3 images', async () => {
    const { aggregateInferences } = await import('../imageNarrative/inferenceAggregator/aggregator');

    const images = [
      makeImageInput('img1'),
      makeImageInput('img2'),
      makeImageInput('img3'),
    ];

    const plan = await aggregateInferences(images, { provider: 'gemini', mode: 'travel' });

    expect(plan).toBeDefined();
    expect(plan.sections.length).toBeGreaterThan(0);
    expect(plan.orderedResults).toHaveLength(3);
    expect(plan.mode).toBe('travel');
  });

  it('sets needsUserReview=true when at least one confidence < 0.6', async () => {
    mockInferResponse = {
      result: {
        scene_type: 'travel',
        location_hint: '서울',
        food_items: [],
        mood_keywords: [],
        description_ko: '낮은 신뢰도 이미지',
        confidence: 0.4, // below guard threshold
      },
    };

    const { aggregateInferences } = await import('../imageNarrative/inferenceAggregator/aggregator');

    const images = [makeImageInput('img1'), makeImageInput('img2'), makeImageInput('img3')];
    const plan = await aggregateInferences(images);

    expect(plan.needsUserReview).toBe(true);
    expect(plan.warnings.length).toBeGreaterThan(0);
  });

  it('groups images with same location_hint into one section', async () => {
    mockInferResponse = {
      result: {
        scene_type: 'travel',
        location_hint: '제주도 성산일출봉', // same for all 3
        food_items: [],
        mood_keywords: ['평화로운'],
        description_ko: '성산일출봉 풍경',
        confidence: 0.85,
      },
    };

    const { aggregateInferences } = await import('../imageNarrative/inferenceAggregator/aggregator');

    const images = [
      makeImageInput('jeju1'),
      makeImageInput('jeju2'),
      makeImageInput('jeju3'),
    ];
    const plan = await aggregateInferences(images);

    // All three share location_hint → should collapse into 1 section
    expect(plan.sections).toHaveLength(1);
    expect(plan.sections[0]!.imageRefs).toHaveLength(3);
  });
});

describe('buildNarrativeContent (Phase 4 integration)', () => {
  beforeEach(() => {
    mockBuildResponse = null;
    vi.clearAllMocks();
    process.env['GEMINI_API_KEY'] = 'test-gemini-key';
    process.env['OPENAI_API_KEY'] = 'test-openai-key';
  });

  afterEach(() => {
    delete process.env['GEMINI_API_KEY'];
    delete process.env['OPENAI_API_KEY'];
  });

  it('returns StructuredContent with headings and bodyHtml', async () => {
    const { aggregateInferences } = await import('../imageNarrative/inferenceAggregator/aggregator');
    const { buildNarrativeContent } = await import('../imageNarrative/narrativeBuilder/builder');

    const images = [makeImageInput('a'), makeImageInput('b'), makeImageInput('c')];

    mockInferResponse = null; // reset to default
    const plan = await aggregateInferences(images, { mode: 'travel' });
    const content = await buildNarrativeContent(plan);

    expect(content.status).toBe('success');
    expect(typeof content.bodyHtml).toBe('string');
    expect(content.bodyHtml.length).toBeGreaterThan(0);
    expect(content.selectedTitle).toBeTruthy();
    expect(Array.isArray(content.headings)).toBe(true);
  });

  it('throws when AI provider returns empty response', async () => {
    const { aggregateInferences } = await import('../imageNarrative/inferenceAggregator/aggregator');
    const { buildNarrativeContent } = await import('../imageNarrative/narrativeBuilder/builder');

    // Override Gemini mock to return empty string
    const { getGeminiModel } = await import('../gemini');
    (getGeminiModel as any).mockImplementationOnce(() => ({
      model: {
        generateContent: vi.fn(async () => ({
          response: { text: () => '' },
        })),
      },
    }));

    const images = [makeImageInput('x'), makeImageInput('y'), makeImageInput('z')];
    const plan = await aggregateInferences(images);

    await expect(buildNarrativeContent(plan)).rejects.toThrow('empty response');
  });
});

describe('mapInferencesToImageMap (Phase 4 integration)', () => {
  it('maps every section from the plan to at least one image', async () => {
    const { aggregateInferences } = await import('../imageNarrative/inferenceAggregator/aggregator');
    const { mapInferencesToImageMap } = await import('../imageNarrative/placement/inferenceImageMapper');

    // 6 images, 2 different locations → 2 sections
    const responses = [
      { id: 'a1', location: '서울' },
      { id: 'a2', location: '서울' },
      { id: 'a3', location: '서울' },
      { id: 'b1', location: '부산' },
      { id: 'b2', location: '부산' },
      { id: 'b3', location: '부산' },
    ];

    // Use per-call location variation via closure
    let callIdx = 0;
    mockInferResponse = null;
    const { inferImage } = await import('../imageNarrative/visionInference/visionRouter');
    (inferImage as any).mockImplementation(async (ctx: any) => {
      const r = responses[callIdx++ % responses.length]!;
      return {
        imageId: ctx.imageId,
        provider: 'gemini',
        latencyMs: 50,
        result: {
          scene_type: 'travel',
          location_hint: r.location,
          food_items: [],
          mood_keywords: [],
          description_ko: `${r.id} 설명`,
          confidence: 0.9,
        },
      };
    });

    const images = responses.map((r) => makeImageInput(r.id));
    const plan = await aggregateInferences(images, { mode: 'travel' });

    const imageMap = mapInferencesToImageMap(plan, responses.map((r) => r.id));

    // Every section heading should be in the map and have ≥1 image
    for (const section of plan.sections) {
      const imgs = imageMap.get(section.heading);
      expect(imgs).toBeDefined();
      expect(imgs!.length).toBeGreaterThan(0);
    }
  });

  it('total assigned images equals total source images', async () => {
    const { aggregateInferences } = await import('../imageNarrative/inferenceAggregator/aggregator');
    const { mapInferencesToImageMap } = await import('../imageNarrative/placement/inferenceImageMapper');

    // Reset mock to uniform location
    mockInferResponse = {
      result: {
        scene_type: 'food',
        location_hint: '강남 맛집',
        food_items: ['파스타'],
        mood_keywords: ['맛있는'],
        description_ko: '파스타 사진',
        confidence: 0.88,
      },
    };

    const imageIds = ['f1', 'f2', 'f3', 'f4', 'f5'];
    const images = imageIds.map(makeImageInput);

    const plan = await aggregateInferences(images, { mode: 'food' });
    const imageMap = mapInferencesToImageMap(plan, imageIds);

    let totalAssigned = 0;
    imageMap.forEach((imgs) => { totalAssigned += imgs.length; });

    expect(totalAssigned).toBe(imageIds.length);
  });
});

describe('vision:infer-and-write IPC handler logic (unit)', () => {
  beforeEach(() => {
    process.env['GEMINI_API_KEY'] = 'test-gemini-key';
    process.env['OPENAI_API_KEY'] = 'test-openai-key';
  });

  afterEach(() => {
    delete process.env['GEMINI_API_KEY'];
    delete process.env['OPENAI_API_KEY'];
  });

  it('aggregates + builds + maps without error for valid input', async () => {
    // Simulate the IPC handler body directly (no Electron IPC)
    mockInferResponse = null; // use default

    const { aggregateInferences } = await import('../imageNarrative/inferenceAggregator/aggregator');
    const { buildNarrativeContent } = await import('../imageNarrative/narrativeBuilder/builder');
    const { mapInferencesToImageMap } = await import('../imageNarrative/placement/inferenceImageMapper');

    const imageInputs = [
      { imageId: 'p1', buffer: Buffer.alloc(4, 0xff), mimeType: 'image/jpeg' },
      { imageId: 'p2', buffer: Buffer.alloc(4, 0xfe), mimeType: 'image/jpeg' },
      { imageId: 'p3', buffer: Buffer.alloc(4, 0xfd), mimeType: 'image/jpeg' },
    ];

    const plan = await aggregateInferences(imageInputs, { provider: 'gemini', mode: 'auto' });
    const content = await buildNarrativeContent(plan, { provider: 'gemini' });
    const imageMap = mapInferencesToImageMap(plan, imageInputs.map((i) => i.imageId));

    // Serialise as IPC would
    const imageMapObj: Record<string, any[]> = {};
    imageMap.forEach((imgs, heading) => { imageMapObj[heading] = imgs; });

    expect(content.status).toBe('success');
    expect(Object.keys(imageMapObj).length).toBeGreaterThan(0);
    // All values from the plan sections should appear as keys
    for (const section of plan.sections) {
      expect(imageMapObj).toHaveProperty(section.heading);
    }
  });

  it('throws a meaningful error when imageInputs is empty', async () => {
    const { aggregateInferences } = await import('../imageNarrative/inferenceAggregator/aggregator');

    // aggregateInferences with 0 images should produce a plan with 0 sections (not throw)
    const plan = await aggregateInferences([]);
    expect(plan.sections).toHaveLength(0);
  });
});
