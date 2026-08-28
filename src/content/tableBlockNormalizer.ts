// src/content/tableBlockNormalizer.ts
// 마크다운 표의 마지막 행과 뒤따르는 문장이 한 줄에 붙는 것을 떼어 놓는다.
//
// [2026-08-28 실측] 스트레이 키즈 키워드로 뽑은 글에서 표 두 개가 모두 같은 모양으로 깨졌다.
//   "| 발표 시점 | 23일 0시 … 공개 | 스트레이 키즈가 29일과 30일 양일간 …"
//   "| 스트레이 키즈 | 해외 남성 아티스트 최초 단독 입성 | '해외 최초'라고만 쓴 글을 보고 …"
// 앞 행들은 전부 \n 으로 끊겨 있는데 **마지막 행만** 본문과 이어져 있었다.
// 모델이 표를 닫고 나서 줄바꿈 없이 다음 문단을 이어 쓴 결과다.
//
// 표는 리치 복붙으로 그대로 올라가는 자산이므로(사장님 확인), 표를 빼는 게 아니라
// 경계를 복구한다. 판정은 순수 문자열 규칙이고 LLM 호출이 없다 — 비용 0.
//
// 보수적으로 동작한다: 파이프로 시작하는 줄에서, 마지막 파이프 뒤에 남은 꼬리가
// **표 셀로 볼 수 없을 때만** 끊는다. 셀이 하나 더 있는 정상 행은 건드리지 않는다.

/** 표 행으로 볼 최소 조건 — 파이프로 시작하고 파이프가 둘 이상. */
const TABLE_ROW = /^\s*\|.*\|/;

/** 꼬리가 이 길이를 넘으면 셀이 아니라 문단으로 본다. */
const MAX_CELL_CHARS = 40;

/** 문장으로 볼 신호 — 종결어미·문장부호가 있으면 셀이 아니다. */
const SENTENCE_SIGNAL = /[.!?]|다\.|요\.|니다|거든요|습니다|예요|이에요/;

function looksLikeSentence(tail: string): boolean {
  const text = tail.trim();
  if (!text) return false;
  if (text.length > MAX_CELL_CHARS) return true;
  return SENTENCE_SIGNAL.test(text);
}

/** 표 행 한 줄을 검사해, 꼬리가 문장이면 [행, 문장]으로 쪼갠다. */
export function splitTrailingProse(line: string): string[] {
  if (!TABLE_ROW.test(line)) return [line];
  const lastPipe = line.lastIndexOf('|');
  if (lastPipe <= 0) return [line];

  const tail = line.slice(lastPipe + 1);
  if (!looksLikeSentence(tail)) return [line];

  return [line.slice(0, lastPipe + 1).trimEnd(), tail.trim()];
}

/**
 * 본문 한 덩어리에서 표 뒤에 붙은 문장을 떼어 낸다.
 * 표가 없거나 붙은 게 없으면 입력을 그대로 돌려준다.
 */
export function normalizeTableBlocks(text: unknown): string {
  const body = typeof text === 'string' ? text : '';
  if (!body || !body.includes('|')) return body;

  const out: string[] = [];
  let changed = false;
  for (const line of body.split('\n')) {
    const parts = splitTrailingProse(line);
    if (parts.length > 1) changed = true;
    out.push(...parts);
  }
  return changed ? out.join('\n') : body;
}

interface NormalizableContent {
  introduction?: unknown;
  conclusion?: unknown;
  bodyPlain?: unknown;
  headings?: unknown;
}

/**
 * 구조화 콘텐츠의 본문 필드 전부에 적용한다.
 * 원본을 바꾸지 않고 새 객체를 돌려준다.
 */
export function normalizeContentTableBlocks<T extends NormalizableContent>(content: T): T {
  if (!content || typeof content !== 'object') return content;

  const headings = Array.isArray(content.headings)
    ? content.headings.map((heading) =>
      heading && typeof heading === 'object'
        ? { ...heading, content: normalizeTableBlocks((heading as { content?: unknown }).content) }
        : heading)
    : content.headings;

  return {
    ...content,
    introduction: normalizeTableBlocks(content.introduction),
    conclusion: normalizeTableBlocks(content.conclusion),
    ...(typeof content.bodyPlain === 'string'
      ? { bodyPlain: normalizeTableBlocks(content.bodyPlain) }
      : {}),
    headings,
  };
}
