import { describe, expect, it } from 'vitest';
import {
  enforceContentQualityV3BusinessGuard,
  type ContentSource,
  type StructuredContent,
} from '../contentGenerator.js';
import { snapshotContentQualityV3BusinessEvidence } from '../contentQualityV3/businessGuard.js';

function makeContent(headingCount: number): StructuredContent {
  return {
    status: 'success',
    generationTime: '1s',
    selectedTitle: 'Local service guide',
    titleAlternatives: [],
    titleCandidates: [],
    bodyHtml: '',
    bodyPlain: 'Service details',
    headings: Array.from({ length: headingCount }, (_, index) => ({
      title: `Section ${index + 1}`,
      content: 'Details',
      summary: '',
      keywords: [],
      imagePrompt: '',
    })),
    hashtags: [],
    images: [],
    metadata: {
      category: 'business',
      targetAge: 'all',
      urgency: 'evergreen',
      estimatedReadTime: '1m',
      wordCount: 20,
      aiDetectionRisk: 'low',
      legalRisk: 'safe',
      seoScore: 90,
      keywordStrategy: 'local',
      publishTimeRecommend: '',
    },
    quality: {
      aiDetectionRisk: 'low',
      legalRisk: 'safe',
      seoScore: 90,
      originalityScore: 90,
      readabilityScore: 90,
      warnings: [],
    },
  };
}

const source: ContentSource = {
  sourceType: 'custom_text',
  rawText: 'Trusted business details',
  contentMode: 'business',
};

describe('Content Quality V3 business guard', () => {
  it('accepts a valid draft as a separate mutable object with validator telemetry', () => {
    const content = Object.freeze(makeContent(5));
    const before = structuredClone(content);

    const result = enforceContentQualityV3BusinessGuard(content, source);

    expect(result).not.toBe(content);
    expect(Object.isFrozen(result)).toBe(false);
    expect(result.quality.warnings.some(warning => warning.startsWith('BusinessValidator:'))).toBe(true);
    expect(content).toEqual(before);
  });

  it('blocks a draft that fails the existing business safety validator', () => {
    expect(() => enforceContentQualityV3BusinessGuard(makeContent(1), source)).toThrow(
      '[CONTENT_SAFETY_BLOCKED]',
    );
  });

  it.each(['99평', '99회', '99점'])(
    'retains legacy unsupported business-stat coverage for %s',
    unsupportedStat => {
      const content = makeContent(5);
      content.bodyPlain = `Local service reports ${unsupportedStat}`;
      const result = enforceContentQualityV3BusinessGuard(content, {
        ...source,
        businessInfo: { name: 'Local' },
      });

      expect(result.quality.warnings).toContain(
        `BusinessValidator: Unsupported business statistics: ${unsupportedStat}`,
      );
    },
  );

  it('bounds and freezes trusted business evidence without invoking accessors', () => {
    const snapshot = snapshotContentQualityV3BusinessEvidence({
      rawText: 'r'.repeat(60_000),
      businessInfo: { name: 'Trusted Co', extra: 'e'.repeat(30_000) },
    });
    const accessorSource = Object.defineProperty({}, 'rawText', {
      get: () => 'forged',
    });

    expect(snapshot.rawText).toHaveLength(50_000);
    expect(snapshot.businessInfo?.extra).toHaveLength(20_000);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.businessInfo)).toBe(true);
    expect(() => snapshotContentQualityV3BusinessEvidence(accessorSource))
      .toThrow('business evidence accessors are not allowed');
  });
});
