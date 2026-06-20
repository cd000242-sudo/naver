/**
 * SPEC-IMAGE-NARRATIVE-2026 Phase 4 — placement unit tests.
 *
 * Covers:
 * - mapInferencesToImageMap: even distribution
 * - mapInferencesToImageMap: empty imageRefs / empty plan
 * - mapInferencesToImageMap: images < sections (base = 0, extras to first N)
 * - mapInferencesToImageMap: images > sections (overflow distributed evenly)
 * - mapInferencesToImageMap: single section
 * - buildImageMetadata: filePath and heading fields populated
 * - imageAssigner: narrative mode passes pre-built map through
 */

import { describe, it, expect, vi } from 'vitest';
import {
  mapInferencesToImageMap,
  type HeadingImageMap,
} from '../imageNarrative/placement/inferenceImageMapper';
import type { NarrativePlan, NarrativeSection, InferenceResponse, InferenceMode } from '../imageNarrative/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSection(heading: string, imageRefs: string[]): NarrativeSection {
  return {
    heading,
    imageRefs,
    beats: ['some beat'],
  };
}

function makeResponse(imageId: string): InferenceResponse {
  return {
    imageId,
    provider: 'gemini',
    latencyMs: 100,
    result: {
      scene_type: 'travel' as InferenceMode,
      location_hint: '서울',
      food_items: [],
      mood_keywords: ['활기찬'],
      description_ko: '테스트 설명',
      confidence: 0.9,
    },
  };
}

function makePlan(
  sections: NarrativeSection[],
  orderedIds: string[],
): NarrativePlan {
  return {
    mode: 'travel',
    sections,
    needsUserReview: false,
    warnings: [],
    orderedResults: orderedIds.map(makeResponse),
  };
}

// ---------------------------------------------------------------------------
// mapInferencesToImageMap
// ---------------------------------------------------------------------------

describe('mapInferencesToImageMap', () => {
  it('distributes N images evenly across S sections (N divisible by S)', () => {
    const sections = [
      makeSection('섹션1', ['img1', 'img2']),
      makeSection('섹션2', ['img3', 'img4']),
    ];
    const plan = makePlan(sections, ['img1', 'img2', 'img3', 'img4']);
    const imageIds = ['img1', 'img2', 'img3', 'img4'];

    const result: HeadingImageMap = mapInferencesToImageMap(plan, imageIds);

    expect(result.size).toBe(2);
    expect(result.get('섹션1')).toHaveLength(2);
    expect(result.get('섹션2')).toHaveLength(2);
  });

  it('assigns remainder images to the first sections (N not divisible by S)', () => {
    // 5 images, 3 sections → base=1, remainder=2 → sections 0+1 get 2, section 2 gets 1
    const sections = [
      makeSection('섹션A', ['img1', 'img2']),
      makeSection('섹션B', ['img3', 'img4']),
      makeSection('섹션C', ['img5']),
    ];
    const imageIds = ['img1', 'img2', 'img3', 'img4', 'img5'];
    const plan = makePlan(sections, imageIds);

    const result = mapInferencesToImageMap(plan, imageIds);

    expect(result.get('섹션A')).toHaveLength(2);
    expect(result.get('섹션B')).toHaveLength(2);
    expect(result.get('섹션C')).toHaveLength(1);
  });

  it('returns empty map when no sections', () => {
    const plan = makePlan([], []);
    const result = mapInferencesToImageMap(plan, []);
    expect(result.size).toBe(0);
  });

  it('returns empty map when no images', () => {
    const sections = [makeSection('섹션1', [])];
    const plan = makePlan(sections, []);
    const result = mapInferencesToImageMap(plan, []);
    expect(result.size).toBe(0);
  });

  it('handles fewer images than sections (base=0, first N get 1 each)', () => {
    // 2 images, 4 sections → base=0, remainder=2 → first 2 sections get 1, last 2 get 0
    const sections = [
      makeSection('S1', []),
      makeSection('S2', []),
      makeSection('S3', []),
      makeSection('S4', []),
    ];
    const imageIds = ['imgA', 'imgB'];
    const plan = makePlan(sections, imageIds);

    const result = mapInferencesToImageMap(plan, imageIds);

    const s1 = result.get('S1') ?? [];
    const s2 = result.get('S2') ?? [];
    const s3 = result.get('S3') ?? [];
    const s4 = result.get('S4') ?? [];

    // First 2 sections should have 1 image each, last 2 should have 0
    expect(s1.length + s2.length + s3.length + s4.length).toBe(2);
    expect(s1).toHaveLength(1);
    expect(s2).toHaveLength(1);
    expect(s3).toHaveLength(0);
    expect(s4).toHaveLength(0);
  });

  it('handles more images than sections — uses overflow from orderedResults', () => {
    // 6 images, 2 sections → 3 each
    const sections = [
      makeSection('S1', ['img1', 'img2', 'img3']),
      makeSection('S2', ['img4', 'img5', 'img6']),
    ];
    const imageIds = ['img1', 'img2', 'img3', 'img4', 'img5', 'img6'];
    const plan = makePlan(sections, imageIds);

    const result = mapInferencesToImageMap(plan, imageIds);

    expect(result.get('S1')).toHaveLength(3);
    expect(result.get('S2')).toHaveLength(3);
  });

  it('assigns heading field on each ImageMetadata entry', () => {
    const sections = [makeSection('맛집 방문', ['img1'])];
    const plan = makePlan(sections, ['img1']);

    const result = mapInferencesToImageMap(plan, ['img1']);

    const imgs = result.get('맛집 방문') ?? [];
    expect(imgs).toHaveLength(1);
    expect(imgs[0]!.heading).toBe('맛집 방문');
  });

  it('assigns blobId equal to imageId', () => {
    const sections = [makeSection('H1', ['uniqueId-42'])];
    const plan = makePlan(sections, ['uniqueId-42']);

    const result = mapInferencesToImageMap(plan, ['uniqueId-42']);

    const imgs = result.get('H1') ?? [];
    expect(imgs[0]!.blobId).toBe('uniqueId-42');
  });

  it('places each image under its OWN section (contextual, not even split)', () => {
    // Section A discusses 3 photos, Section B discusses 1.
    // Even-split would wrongly give 2/2 — contextual MUST give 3/1, in order.
    const sections = [
      makeSection('맛집 탐방', ['m1', 'm2', 'm3']),
      makeSection('카페 디저트', ['c1']),
    ];
    const ids = ['m1', 'm2', 'm3', 'c1'];
    const plan = makePlan(sections, ids);

    const result = mapInferencesToImageMap(plan, ids);

    expect(result.get('맛집 탐방')!.map((i) => i.blobId)).toEqual(['m1', 'm2', 'm3']);
    expect(result.get('카페 디저트')!.map((i) => i.blobId)).toEqual(['c1']);
  });

  it('handles single section with multiple images', () => {
    const sections = [makeSection('Solo', ['a', 'b', 'c'])];
    const plan = makePlan(sections, ['a', 'b', 'c']);

    const result = mapInferencesToImageMap(plan, ['a', 'b', 'c']);

    expect(result.get('Solo')).toHaveLength(3);
  });

  it('preserves orderedResults ordering over raw imageIds order', () => {
    // orderedResults is [img2, img1] (reversed from imageIds)
    const sections = [
      makeSection('First', []),
      makeSection('Second', []),
    ];
    const plan: NarrativePlan = {
      mode: 'food',
      sections,
      needsUserReview: false,
      warnings: [],
      orderedResults: [makeResponse('img2'), makeResponse('img1')],
    };
    const imageIds = ['img1', 'img2']; // natural order

    const result = mapInferencesToImageMap(plan, imageIds);

    // img2 should end up in First (orderedResults[0])
    const firstImgs = result.get('First') ?? [];
    expect(firstImgs[0]!.blobId).toBe('img2');
  });

  it('includes extra imageIds not present in orderedResults', () => {
    const sections = [makeSection('S', [])];
    const plan: NarrativePlan = {
      mode: 'auto',
      sections,
      needsUserReview: false,
      warnings: [],
      orderedResults: [], // no results from vision
    };
    const imageIds = ['extraImg'];

    const result = mapInferencesToImageMap(plan, imageIds);

    const imgs = result.get('S') ?? [];
    expect(imgs[0]!.blobId).toBe('extraImg');
  });
});

// ---------------------------------------------------------------------------
// imageAssigner narrative mode
// ---------------------------------------------------------------------------

describe('ImageAssigner narrative mode', () => {
  it('returns pre-built map without calling library search', async () => {
    // Minimal mock of ImageLibrary that should NOT be called in narrative mode
    const mockLibrary = {
      getImages: vi.fn().mockResolvedValue([]),
      getAttribution: vi.fn().mockReturnValue(''),
    };

    // Dynamic import to avoid ESM issues
    const { ImageAssigner } = await import('../imageAssigner');

    const assigner = new ImageAssigner(mockLibrary as any);
    const fakeMap = new Map<string, any[]>();
    fakeMap.set('소제목1', [{ filePath: 'path/to/img.jpg', heading: '소제목1' }]);

    const mockContent = {
      headings: [{ title: '소제목1', summary: '', keywords: [], imagePrompt: '' }],
      bodyPlain: '',
    };

    const result = await assigner.assignImages(mockContent as any, {
      mode: 'narrative',
      narrativeImageMap: fakeMap,
    } as any);

    // Library should not have been searched
    expect(mockLibrary.getImages).not.toHaveBeenCalled();

    // AutomationImages should contain the pre-built entry
    expect(result.needsUserSelection).toBe(false);
    expect(result.automationImages).toHaveLength(1);
    expect(result.automationImages[0]!.heading).toBe('소제목1');
    expect(result.automationImages[0]!.filePath).toBe('path/to/img.jpg');
    expect(result.automationImages[0]!.provider).toBe('narrative');
  });

  it('returns empty automationImages when narrativeImageMap is not provided', async () => {
    const mockLibrary = { getImages: vi.fn(), getAttribution: vi.fn() };
    const { ImageAssigner } = await import('../imageAssigner');
    const assigner = new ImageAssigner(mockLibrary as any);

    const result = await assigner.assignImages({} as any, { mode: 'narrative' } as any);

    expect(result.automationImages).toHaveLength(0);
    expect(result.needsUserSelection).toBe(false);
    expect(mockLibrary.getImages).not.toHaveBeenCalled();
  });
});
