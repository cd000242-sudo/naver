import type { ImageNarrativeContext } from './types.js';
import { maskSecretToken, stripSecretLikeTokens } from '../content/secretTokenGuard.js';

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

/** 재료에서 자격증명 의심 토큰을 지우고, 지웠다면 마스킹해 로그로 알린다. */
function scrubSecrets(value: string | undefined, field: string): string | undefined {
  if (!value) return value;
  const { text, removed } = stripSecretLikeTokens(value);
  if (removed.length > 0) {
    console.warn(
      `[SecretGuard] 사진 참고 정보(${field})에서 자격증명처럼 보이는 값 ${removed.length}건을 제거했습니다: `
      + removed.map(maskSecretToken).join(', ')
      + ' — API 키는 환경설정의 키 입력칸에 넣어주세요.',
    );
  }
  return text || undefined;
}

export function normalizeImageNarrativeContext(
  value: unknown,
): ImageNarrativeContext | undefined {
  if (!isRecord(value)) return undefined;

  /*
   * [2026-09-09] 자격증명처럼 보이는 문자열은 여기서 걷어낸다.
   *
   * 사고: 발행글 초반부에 40자 난수 문자열(네이버 클라우드 Secret Key 형식)이 그대로
   * 실려 나갔다. 사용자가 키를 API 키 칸이 아닌 메모 칸에 붙여넣으면 그 텍스트가
   * 그대로 모델 재료가 되고, 모델이 본문에 옮겨 적는다. 모델이 보지 못하면 옮길 수도 없다.
   */
  const context: ImageNarrativeContext = {
    timeHint: scrubSecrets(readContextString(value, 'timeHint'), 'timeHint'),
    mainPeople: scrubSecrets(readContextString(value, 'mainPeople'), 'mainPeople'),
    place: scrubSecrets(readContextString(value, 'place'), 'place'),
    occasion: scrubSecrets(readContextString(value, 'occasion'), 'occasion'),
    notes: scrubSecrets(readContextString(value, 'notes'), 'notes'),
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

  /*
   * [2026-09-09 사장님 실측] "2000자 가까이 넣은 내 경험이 일부만 반영이 되어 있는 것 같아요."
   *
   * 뿌리는 이 소개 문장이었다. 화면의 칸 이름은 "글에 꼭 나왔으면 하는 내용" 인데 모델에게는
   * "참고 배경입니다" 라고 건네고 있었다. 참고 배경은 안 써도 되는 정보다. 실제로 모델은
   * 사진 설명을 중심으로 쓰고 사장님이 적어 준 경험은 골라 썼다.
   *
   * 이건 지어낸 사실이 아니라 글쓴이 본인이 준 사실이다. '반영해도 되는 배경' 이 아니라
   * '빠뜨리면 안 되는 재료' 로 건넨다. 환각 금지(P2)는 그대로다 — 모델이 없는 사실을
   * 만들어 내는 것을 막는 규칙이지, 사용자가 준 사실을 버리라는 규칙이 아니다.
   */
  return [
    '=== 글쓴이가 직접 적어 준 재료 (반드시 반영) ===',
    ...lines,
    '위 내용은 글쓴이 본인이 겪은 일이다. 사진에 안 보인다는 이유로 빼지 말 것 — 사진은 장면이고 이 재료는 그날의 사실이다.',
    '적힌 경험·정보는 빠짐없이 본문 어딘가에 녹여 넣는다. 목록으로 나열하지 말고 그 장면이 나오는 문단에 자연스럽게 붙인다.',
    '단, 여기에 없는 사실을 새로 지어내는 것은 금지다(P2). 쓸 수 있는 것은 사진에 보이는 것과 위 재료뿐이다.',
    '"N번" / "N~M번"처럼 번호가 언급되면 현재 화면에 표시된 사진 번호를 뜻합니다. 해당 번호 묶음의 상황 설명을 그 사진들의 해석에 우선 적용하세요.',
    '',
    '[어체] 위 재료에 적힌 말투가 곧 글쓴이의 말투다. 그 말투를 살려 쓰되 독자에게는 존댓말로 낮춰 옮긴다.',
    '  예) 재료: "확실히 맛집이라그런지 건너편에 대기실이있더라 근데 에어컨은 없고 선풍기만 있어서 조금 아쉬웠어"',
    '      본문: "확실히 맛집이라 그런지 건너편에 대기실까지 있더라구요. 근데 에어컨은 없고 선풍기만 있어서 조금 아쉬웠습니다."',
    '  반말을 그대로 옮기지 말고, 뜻과 리듬을 지킨 채 어미만 존댓말로 바꾼다. 문장을 다시 짓지 말 것.',
    '  동화를 낭독하는 말투(~였답니다, ~하는 것이었어요, 과장된 감탄)는 금지다. 그렇게 쓰면 사람 글이 아니라 AI 글로 읽힌다.',
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
