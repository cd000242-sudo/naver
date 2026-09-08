import type { ImageNarrativeContext } from './types.js';

const CONTEXT_LIMITS = {
  timeHint: 120,
  mainPeople: 180,
  place: 180,
  occasion: 180,
  /*
   * [2026-09-09] 1000 -> 2000 -> 5000.
   *
   * 사장님 판단: "자세하게 서술해서 주면 줄수록 개인 경험이 묻어나오고
   * 독보적인 본인만의 글이 완성되니까." 재료가 두터울수록 글이 사장님 것이 된다는 뜻이고,
   * 이 앱이 파는 것이 바로 그것이라 비용보다 우선한다.
   *
   * 화면 maxlength(5000) 와 반드시 같아야 한다 — 어긋나면 여기서 조용히 잘린다.
   * 비용 메모: notes 는 Vision 호출마다 붙는다(사진 수만큼 곱해진다).
   *   5,000자 ≈ 3,300토큰 × 사진 수. 30장이면 편당 입력 토큰이 10만 가까이 늘어난다.
   *   더 열어야 하면 "그 사진 번호에 걸린 부분만 골라 보내기" 를 먼저 만들 것.
   */
  notes: 5000,
} as const;

const CONTEXT_LABELS: Array<readonly [keyof ImageNarrativeContext, string]> = [
  ['timeHint', '시간'],
  ['mainPeople', '주요 인물'],
  ['place', '장소'],
  ['occasion', '상황'],
  ['notes', '상황·요청 내용'],
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
    '"N번" / "N~M번"처럼 번호가 언급되면 현재 화면에 표시된 사진 번호를 뜻합니다. 해당 번호 묶음의 상황 설명을 그 사진들의 해석에 우선 적용하세요.',
  ].join('\n');
}

/**
 * [2026-08-16] Per-image ordinal injection for direct uploads: the user numbers
 * situations in the notes ("1~4번은 호텔"), so each Vision call must know which
 * position the current photo holds. Appending to notes keeps every adapter
 * (gemini/openai/claude/agent) working without prompt-plumbing changes.
 *
 * [2026-08-25] 기준을 "업로드 순서"에서 "현재 화면 순서"로 바꿨다. 사용자가 썸네일을
 * 드래그해 재배치하면 화면의 1번과 업로드 1번이 어긋나는데, 메모("1번은 저녁 식사")는
 * 언제나 눈에 보이는 번호를 가리킨다. 두 기준이 갈리면 엉뚱한 사진에 설명이 붙는다.
 */
export function withPhotoOrdinal(
  context: ImageNarrativeContext | undefined,
  ordinal: number,
  total: number,
): ImageNarrativeContext {
  const marker = `[현재 사진 = 현재 화면 순서 ${ordinal}번 / 전체 ${total}장]`;
  const notes = context?.notes ? `${context.notes} ${marker}` : marker;
  return { ...(context ?? {}), notes };
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
