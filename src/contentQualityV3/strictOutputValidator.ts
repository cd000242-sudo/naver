import type { StructuredContent } from '../contentGenerator.js';
import { CONTENT_QUALITY_V3_OUTPUT_SCHEMA } from './schema.js';

export type ContentQualityV3StrictOutputValidation = Readonly<
  | { ok: true; content: Readonly<StructuredContent> }
  | { ok: false; issueCode: 'strict_schema_invalid' }
>;

interface ValidationBudget {
  nodesRemaining: number;
  stringCharsRemaining: number;
}

type UnknownRecord = Readonly<Record<string, unknown>>;

const MAX_DEPTH = 32;
const MAX_NODES = 100_000;
const MAX_STRING_CHARS = 2 * 1024 * 1024;
const INVALID_RESULT = Object.freeze({
  ok: false as const,
  issueCode: 'strict_schema_invalid' as const,
});

class StrictSchemaValidationError extends Error {}

function invalid(): never {
  throw new StrictSchemaValidationError();
}

function consumeNode(budget: ValidationBudget, depth: number): void {
  budget.nodesRemaining -= 1;
  if (budget.nodesRemaining < 0 || depth > MAX_DEPTH) invalid();
}

function readSchemaRecord(value: unknown): UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid();
  return value as UnknownRecord;
}

function readOwnDataRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();
  const keys = Reflect.ownKeys(value);
  if (keys.some(key => typeof key !== 'string')) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const copy: Record<string, unknown> = {};
  for (const key of keys as string[]) {
    const descriptor = descriptors[key];
    if (!descriptor || !('value' in descriptor)) invalid();
    copy[key] = descriptor.value;
  }
  return copy;
}

function readDenseArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<
    string,
    PropertyDescriptor
  >;
  const lengthDescriptor = descriptors.length;
  if (!lengthDescriptor || !('value' in lengthDescriptor)) invalid();
  const length = lengthDescriptor.value;
  if (typeof length !== 'number' || !Number.isSafeInteger(length) || length < 0) invalid();
  const expectedKeys = new Set([
    'length',
    ...Array.from({ length }, (_, index) => String(index)),
  ]);
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== expectedKeys.size
    || keys.some(key => typeof key !== 'string' || !expectedKeys.has(key))
  ) invalid();
  return Array.from({ length }, (_, index) => {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !('value' in descriptor)) invalid();
    return descriptor.value;
  });
}

function readNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function validateEnum(schema: UnknownRecord, value: unknown): void {
  if (schema.enum === undefined) return;
  if (!Array.isArray(schema.enum) || !schema.enum.some(item => Object.is(item, value))) invalid();
}

function sanitizeString(
  schema: UnknownRecord,
  value: unknown,
  budget: ValidationBudget,
): string {
  if (typeof value !== 'string') invalid();
  budget.stringCharsRemaining -= value.length;
  if (budget.stringCharsRemaining < 0) invalid();
  validateEnum(schema, value);
  return value;
}

function sanitizeNumber(schema: UnknownRecord, value: unknown, integer: boolean): number {
  if (
    typeof value !== 'number'
    || !Number.isFinite(value)
    || (integer && !Number.isSafeInteger(value))
  ) invalid();
  if (typeof schema.minimum === 'number' && value < schema.minimum) invalid();
  if (typeof schema.maximum === 'number' && value > schema.maximum) invalid();
  validateEnum(schema, value);
  return value;
}

function sanitizeArray(
  schema: UnknownRecord,
  value: unknown,
  budget: ValidationBudget,
  depth: number,
): readonly unknown[] {
  const items = readDenseArray(value);
  const minimum = schema.minItems === undefined
    ? 0
    : readNonNegativeInteger(schema.minItems);
  const maximum = schema.maxItems === undefined
    ? Number.MAX_SAFE_INTEGER
    : readNonNegativeInteger(schema.maxItems);
  if (
    minimum === undefined
    || maximum === undefined
    || items.length < minimum
    || items.length > maximum
  ) invalid();
  const itemSchema = schema.items;
  if (itemSchema === undefined) invalid();
  return Object.freeze(items.map(item => sanitizeValue(itemSchema, item, budget, depth + 1)));
}

function sanitizeObject(
  schema: UnknownRecord,
  value: unknown,
  budget: ValidationBudget,
  depth: number,
): Readonly<Record<string, unknown>> {
  const record = readOwnDataRecord(value);
  const properties = readSchemaRecord(schema.properties);
  const required = schema.required;
  if (!Array.isArray(required) || required.some(key => typeof key !== 'string')) invalid();
  const keys = Object.keys(record);
  if (required.some(key => !Object.prototype.hasOwnProperty.call(record, key))) invalid();
  if (
    schema.additionalProperties === false
    && keys.some(key => !Object.prototype.hasOwnProperty.call(properties, key))
  ) invalid();

  const sanitized: Record<string, unknown> = {};
  for (const key of Object.keys(properties)) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
    sanitized[key] = sanitizeValue(properties[key], record[key], budget, depth + 1);
  }
  return Object.freeze(sanitized);
}

function sanitizeValue(
  rawSchema: unknown,
  value: unknown,
  budget: ValidationBudget,
  depth: number,
): unknown {
  consumeNode(budget, depth);
  const schema = readSchemaRecord(rawSchema);
  switch (schema.type) {
    case 'string':
      return sanitizeString(schema, value, budget);
    case 'number':
      return sanitizeNumber(schema, value, false);
    case 'integer':
      return sanitizeNumber(schema, value, true);
    case 'array':
      return sanitizeArray(schema, value, budget, depth);
    case 'object':
      return sanitizeObject(schema, value, budget, depth);
    default:
      return invalid();
  }
}

export function validateContentQualityV3StrictOutput(
  value: unknown,
): ContentQualityV3StrictOutputValidation {
  try {
    const content = sanitizeValue(
      CONTENT_QUALITY_V3_OUTPUT_SCHEMA,
      value,
      { nodesRemaining: MAX_NODES, stringCharsRemaining: MAX_STRING_CHARS },
      0,
    ) as Readonly<StructuredContent>;
    return Object.freeze({ ok: true as const, content });
  } catch {
    return INVALID_RESULT;
  }
}
