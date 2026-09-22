// Completeness contract for structured AI JSON responses.
// The old jsonParser 8th fallback used to silently accept a single-field
// object (e.g. {"selectedTitle": "..."}) as a full success. This module
// gives callers an explicit, schema-driven way to detect "technically
// parsed but not actually complete" responses instead of relying on that
// removed fallback's illusion of success.

import { isPartialRecovery } from '../jsonParser.js';

export interface ArraySchema {
  minItems: number;
  itemRequired?: string[];
}

export interface RequiredSchema {
  name: string;
  required: string[];
  arrays?: Record<string, ArraySchema>;
}

/**
 * StructuredContent must have a selected title, at least one heading with
 * both a title and content, and SOME body text — either an `introduction`
 * or a `bodyPlain`. That either/or check can't be expressed as a plain
 * `required` field, so `assertResponseComplete` special-cases this schema.
 */
export const STRUCTURED_CONTENT_SCHEMA: RequiredSchema = {
  name: 'StructuredContent',
  required: ['selectedTitle'],
  // minItems 0: homefeed issue-story legitimately allows 0~3 headings; the body check below
  // (introduction | bodyPlain) is what proves an article exists.
  arrays: { headings: { minItems: 0, itemRequired: ['title', 'content'] } },
};

export const TITLE_RESULT_SCHEMA: RequiredSchema = {
  name: 'TitleResult',
  required: ['selectedTitle'],
  arrays: { titleCandidates: { minItems: 1 } },
};

export const BLUEPRINT_SCHEMA: RequiredSchema = {
  name: 'Blueprint',
  required: ['angle'],
  arrays: { skeleton: { minItems: 1 } },
};

export type CompletenessResult =
  | { complete: true }
  | { complete: false; missing: string[]; reason: 'PARTIAL_RESPONSE' };

function isMissingValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  return false;
}

function collectMissingFields(obj: Record<string, unknown>, schema: RequiredSchema): string[] {
  const missing: string[] = [];

  for (const field of schema.required) {
    if (isMissingValue(obj[field])) missing.push(field);
  }

  if (schema.arrays) {
    for (const [arrayField, arraySchema] of Object.entries(schema.arrays)) {
      const value = obj[arrayField];
      if (!Array.isArray(value) || value.length < arraySchema.minItems) {
        missing.push(arrayField);
        continue;
      }
      if (arraySchema.itemRequired) {
        value.forEach((item, index) => {
          for (const itemField of arraySchema.itemRequired!) {
            const itemValue = item && typeof item === 'object' ? (item as Record<string, unknown>)[itemField] : undefined;
            if (isMissingValue(itemValue)) missing.push(`${arrayField}[${index}].${itemField}`);
          }
        });
      }
    }
  }

  return missing;
}

/** StructuredContent-specific either/or body check: introduction OR bodyPlain must be non-empty. */
function checkStructuredContentBody(obj: Record<string, unknown>): string[] {
  const hasIntroduction = !isMissingValue(obj.introduction);
  const hasBodyPlain = !isMissingValue(obj.bodyPlain);
  return hasIntroduction || hasBodyPlain ? [] : ['introduction|bodyPlain'];
}

export function assertResponseComplete(obj: unknown, schema: RequiredSchema): CompletenessResult {
  if (!obj || typeof obj !== 'object' || isPartialRecovery(obj)) {
    return { complete: false, missing: schema.required, reason: 'PARTIAL_RESPONSE' };
  }

  const record = obj as Record<string, unknown>;
  const missing = collectMissingFields(record, schema);

  if (schema.name === STRUCTURED_CONTENT_SCHEMA.name) {
    missing.push(...checkStructuredContentBody(record));
  }

  if (missing.length > 0) {
    return { complete: false, missing, reason: 'PARTIAL_RESPONSE' };
  }

  return { complete: true };
}

export function describeCompleteness(obj: unknown, schema: RequiredSchema): string {
  const result = assertResponseComplete(obj, schema);
  if (result.complete) return `${schema.name}: complete`;
  return `${schema.name}: incomplete (missing: ${result.missing.join(', ')})`;
}
