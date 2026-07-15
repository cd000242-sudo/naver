import { describe, expect, it } from 'vitest';

import {
  CONTENT_QUALITY_V3_OUTPUT_SCHEMA,
  CONTENT_QUALITY_V3_REQUIRED_FIELDS,
} from '../contentQualityV3/schema';

function collectObjectSchemas(value: unknown, output: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (!value || typeof value !== 'object') return output;
  const record = value as Record<string, unknown>;
  if (record.type === 'object') output.push(record);
  for (const child of Object.values(record)) {
    if (Array.isArray(child)) child.forEach(item => collectObjectSchemas(item, output));
    else collectObjectSchemas(child, output);
  }
  return output;
}

function expectDeepFrozen(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value as Record<string, unknown>)) {
    expectDeepFrozen(child);
  }
}

// https://ai.google.dev/gemini-api/docs/generate-content/structured-output
// Official type-specific subset, last updated 2026-07-07 UTC.
const GEMINI_STRUCTURED_OUTPUT_KEYWORDS = new Set([
  'type',
  'title',
  'description',
  'properties',
  'required',
  'additionalProperties',
  'enum',
  'format',
  'minimum',
  'maximum',
  'items',
  'prefixItems',
  'minItems',
  'maxItems',
]);

function collectUnsupportedSchemaKeywords(
  value: unknown,
  path = '$',
  output: string[] = [],
): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return output;
  const record = value as Record<string, unknown>;

  for (const [keyword, child] of Object.entries(record)) {
    if (!GEMINI_STRUCTURED_OUTPUT_KEYWORDS.has(keyword)) {
      output.push(`${path}.${keyword}`);
      continue;
    }

    if (keyword === 'properties' && child && typeof child === 'object' && !Array.isArray(child)) {
      for (const [propertyName, propertySchema] of Object.entries(child as Record<string, unknown>)) {
        collectUnsupportedSchemaKeywords(propertySchema, `${path}.properties.${propertyName}`, output);
      }
    } else if (keyword === 'items' || keyword === 'additionalProperties') {
      collectUnsupportedSchemaKeywords(child, `${path}.${keyword}`, output);
    } else if (keyword === 'prefixItems' && Array.isArray(child)) {
      child.forEach((item, index) => collectUnsupportedSchemaKeywords(item, `${path}.prefixItems[${index}]`, output));
    }
  }

  return output;
}

describe('CONTENT_QUALITY_V3_OUTPUT_SCHEMA', () => {
  it('pins the exact top-level publishable contract', () => {
    expect(CONTENT_QUALITY_V3_OUTPUT_SCHEMA).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: CONTENT_QUALITY_V3_REQUIRED_FIELDS,
    });
    expect(Object.keys(CONTENT_QUALITY_V3_OUTPUT_SCHEMA.properties).sort()).toEqual(
      [...CONTENT_QUALITY_V3_REQUIRED_FIELDS].sort(),
    );
  });

  it('requires every nested field that the runtime result contract reads', () => {
    const properties = CONTENT_QUALITY_V3_OUTPUT_SCHEMA.properties;

    expect(properties.titleCandidates.items.required).toEqual(['text', 'score', 'reasoning']);
    expect(properties.headings.items.required).toEqual([
      'title', 'content', 'summary', 'keywords', 'imagePrompt',
    ]);
    expect(properties.images.items.required).toEqual([
      'heading', 'prompt', 'placement', 'alt', 'caption',
    ]);
    expect(properties.metadata.required).toEqual([
      'category',
      'targetAge',
      'urgency',
      'estimatedReadTime',
      'wordCount',
      'aiDetectionRisk',
      'legalRisk',
      'seoScore',
      'keywordStrategy',
      'publishTimeRecommend',
    ]);
    expect(properties.quality.required).toEqual([
      'aiDetectionRisk',
      'legalRisk',
      'seoScore',
      'originalityScore',
      'readabilityScore',
      'warnings',
    ]);
  });

  it('fails closed on unknown keys at every object boundary', () => {
    const objectSchemas = collectObjectSchemas(CONTENT_QUALITY_V3_OUTPUT_SCHEMA);

    expect(objectSchemas.length).toBeGreaterThanOrEqual(6);
    expect(objectSchemas.every(schema => schema.additionalProperties === false)).toBe(true);
  });

  it('uses provider-portable schema primitives without composition or references', () => {
    const serialized = JSON.stringify(CONTENT_QUALITY_V3_OUTPUT_SCHEMA);

    expect(serialized).not.toContain('"$ref"');
    expect(serialized).not.toContain('"oneOf"');
    expect(serialized).not.toContain('"anyOf"');
    expect(serialized).not.toContain('"allOf"');
    expect(serialized.length).toBeLessThan(12_000);
  });

  it('recursively uses only Gemini Structured Outputs supported schema keywords', () => {
    expect(collectUnsupportedSchemaKeywords(CONTENT_QUALITY_V3_OUTPUT_SCHEMA)).toEqual([]);
  });

  it('blocks error status and constrains all contract enums and scores', () => {
    const properties = CONTENT_QUALITY_V3_OUTPUT_SCHEMA.properties;

    expect(properties.status.enum).toEqual(['success', 'warning']);
    expect(properties.metadata.properties.targetAge.enum).toEqual(['20s', '30s', '40s', '50s', 'all']);
    expect(properties.metadata.properties.urgency.enum).toEqual(['breaking', 'depth', 'evergreen']);
    expect(properties.quality.properties.legalRisk.enum).toEqual(['safe', 'caution', 'danger']);
    expect(properties.quality.properties.seoScore).toMatchObject({ minimum: 0, maximum: 100 });
    expect(properties.bodyPlain).toEqual({ type: 'string' });
    expect(properties.selectedTitle).toEqual({ type: 'string' });
  });

  it('is deeply frozen so one request cannot weaken later requests', () => {
    expectDeepFrozen(CONTENT_QUALITY_V3_OUTPUT_SCHEMA);
    expectDeepFrozen(CONTENT_QUALITY_V3_REQUIRED_FIELDS);
  });
});
