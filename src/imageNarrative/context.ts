import type { ImageNarrativeContext } from './types.js';

const CONTEXT_LIMITS = {
  timeHint: 120,
  mainPeople: 180,
  place: 180,
  occasion: 180,
  notes: 1000,
} as const;

const CONTEXT_LABELS: Array<readonly [keyof ImageNarrativeContext, string]> = [
  ['timeHint', '시간'],
  ['mainPeople', '주요 인물'],
  ['place', '장소'],
  ['occasion', '상황'],
  ['notes', '추가 메모'],
];

export function normalizeImageNarrativeContext(
  value: unknown,
): ImageNarrativeContext | undefined {
  if (!isRecord(value)) return undefined;

  const context: ImageNarrativeContext = {
    timeHint: readContextString(value, 'timeHint'),
    mainPeople: readContextString(value, 'mainPeople'),
    place: readContextString(value, 'place'),
    occasion: readContextString(value, 'occasion'),
    notes: readContextString(value, 'notes'),
  };

  return hasImageNarrativeContext(context) ? context : undefined;
}

export function hasImageNarrativeContext(
  context: ImageNarrativeContext | undefined,
): context is ImageNarrativeContext {
  return Boolean(context && CONTEXT_LABELS.some(([key]) => Boolean(context[key])));
}

export function formatImageNarrativeContext(
  context: ImageNarrativeContext | undefined,
): string {
  if (!hasImageNarrativeContext(context)) return '';

  const lines = CONTEXT_LABELS
    .map(([key, label]) => {
      const value = sanitizeContextValue(context[key], CONTEXT_LIMITS[key]);
      return value ? `- ${label}: ${value}` : '';
    })
    .filter(Boolean);

  if (lines.length === 0) return '';

  return [
    '=== 사용자 제공 사진 참고 정보 ===',
    ...lines,
    '위 정보는 사진 해석을 돕는 참고 배경입니다. 사진과 맞는 범위에서만 반영하고, 새로운 사실을 지어내지 마세요.',
  ].join('\n');
}

function readContextString(
  obj: Record<string, unknown>,
  key: keyof ImageNarrativeContext,
): string | undefined {
  return sanitizeContextValue(obj[key], CONTEXT_LIMITS[key]);
}

function sanitizeContextValue(
  value: unknown,
  maxLength: number,
): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
