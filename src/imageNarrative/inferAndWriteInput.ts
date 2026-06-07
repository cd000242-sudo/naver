import type { InferenceMode, NarrativePlan } from './types.js';
import type { NarrativeReviewEditsById } from './reviewEdits.js';

export type SupportedVisionProvider = 'gemini' | 'openai';

export interface InferAndWriteImagePayload {
  readonly imageId: string;
  readonly imageBase64: string;
  readonly mimeType: string;
}

export interface NormalizedInferAndWriteImagePayload extends InferAndWriteImagePayload {
  readonly byteLength: number;
}

export interface NormalizedInferAndWritePayload {
  readonly images: readonly NormalizedInferAndWriteImagePayload[];
  readonly provider: SupportedVisionProvider;
  readonly mode: InferenceMode;
  readonly targetChars?: number;
  readonly toneStyle?: 'friendly' | 'formal' | 'casual';
  readonly plan?: NarrativePlan;
  readonly reviewEdits?: NarrativeReviewEditsById;
}

const MIN_IMAGES = 3;
const MAX_IMAGES = 30;
const MAX_BYTES_PER_IMAGE = 10 * 1024 * 1024;
const VALID_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
]);
const VALID_MODES = new Set<InferenceMode>([
  'travel',
  'food',
  'lodging',
  'daily',
  'review',
  'cafe',
  'auto',
]);

export function normalizeInferAndWritePayload(
  payload: unknown,
): NormalizedInferAndWritePayload {
  if (!isRecord(payload)) {
    throw new Error('Image narrative payload is invalid.');
  }

  const rawImages = payload['images'];
  if (!Array.isArray(rawImages)) {
    throw new Error('Image narrative payload must include an images array.');
  }
  if (rawImages.length < MIN_IMAGES) {
    throw new Error(`Image narrative mode needs at least ${MIN_IMAGES} images.`);
  }
  if (rawImages.length > MAX_IMAGES) {
    throw new Error(`Image narrative mode supports up to ${MAX_IMAGES} images.`);
  }

  const images = rawImages.map((image, index) => normalizeImagePayload(image, index));

  return {
    images,
    provider: normalizeVisionProvider(payload['provider']),
    mode: normalizeMode(payload['mode']),
    targetChars: normalizeTargetChars(payload['targetChars']),
    toneStyle: normalizeToneStyle(payload['toneStyle']),
    plan: normalizePlan(payload['plan']),
    reviewEdits: normalizeReviewEdits(payload['reviewEdits']),
  };
}

export function normalizeVisionProvider(value: unknown): SupportedVisionProvider {
  return value === 'openai' ? 'openai' : 'gemini';
}

function normalizeMode(value: unknown): InferenceMode {
  return VALID_MODES.has(value as InferenceMode) ? value as InferenceMode : 'auto';
}

function normalizeImagePayload(
  value: unknown,
  index: number,
): NormalizedInferAndWriteImagePayload {
  if (!isRecord(value)) {
    throw new Error(`Image ${index + 1} is invalid.`);
  }

  const imageId = String(value['imageId'] ?? '').trim();
  if (!imageId) {
    throw new Error(`Image ${index + 1} is missing imageId.`);
  }

  const mimeType = normalizeMimeType(value['mimeType']);
  const imageBase64 = normalizeBase64(value['imageBase64']);
  const byteLength = Buffer.from(imageBase64, 'base64').length;

  if (byteLength === 0) {
    throw new Error(`Image "${imageId}" is empty.`);
  }
  if (byteLength > MAX_BYTES_PER_IMAGE) {
    throw new Error(`Image "${imageId}" exceeds the 10MB limit.`);
  }

  return {
    imageId: imageId.slice(0, 240),
    imageBase64,
    mimeType,
    byteLength,
  };
}

function normalizeMimeType(value: unknown): string {
  const mimeType = String(value ?? '').trim().toLowerCase();
  if (mimeType === 'image/heic' || mimeType === 'image/heif') {
    throw new Error('HEIC images must be converted to JPG before inference.');
  }
  if (!VALID_MIME_TYPES.has(mimeType)) {
    throw new Error(`Unsupported image MIME type: ${mimeType || '(empty)'}.`);
  }
  return mimeType === 'image/jpg' ? 'image/jpeg' : mimeType;
}

function normalizeBase64(value: unknown): string {
  const raw = String(value ?? '').trim();
  const stripped = raw.startsWith('data:image/')
    ? raw.slice(raw.indexOf(',') + 1)
    : raw;
  const compact = stripped.replace(/\s+/g, '');

  if (
    compact.length === 0 ||
    compact.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(compact)
  ) {
    throw new Error('Image base64 payload is invalid.');
  }

  return compact;
}

function normalizeTargetChars(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(800, Math.min(8000, Math.round(parsed)));
}

function normalizeToneStyle(value: unknown): 'friendly' | 'formal' | 'casual' | undefined {
  if (value === 'formal' || value === 'casual' || value === 'friendly') return value;
  return undefined;
}

function normalizePlan(value: unknown): NarrativePlan | undefined {
  if (!isRecord(value)) return undefined;
  if (!Array.isArray(value['sections']) || !Array.isArray(value['orderedResults'])) {
    return undefined;
  }
  if (!VALID_MODES.has(value['mode'] as InferenceMode)) return undefined;
  return value as unknown as NarrativePlan;
}

function normalizeReviewEdits(value: unknown): NarrativeReviewEditsById | undefined {
  if (!isRecord(value)) return undefined;

  const entries: Array<readonly [string, NarrativeReviewEditsById[string]]> = [];
  for (const [imageId, edit] of Object.entries(value)) {
    if (!isRecord(edit)) continue;
    entries.push([
      imageId,
      {
        caption: readString(edit, 'caption'),
        category: VALID_MODES.has(edit['category'] as InferenceMode)
          ? edit['category'] as InferenceMode
          : undefined,
        locationHint: readString(edit, 'locationHint'),
        takenAt: readString(edit, 'takenAt'),
        userDescription: readString(edit, 'userDescription'),
      },
    ]);
  }

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function readString(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 1500) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
