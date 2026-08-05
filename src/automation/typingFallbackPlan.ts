/**
 * [2026-07-29] Typing-fallback duplicate guard (pure logic).
 *
 * When rich paste fails but the Ctrl+Z rollback is unverified, the pasted
 * content may still be sitting in the editor. Blindly re-typing the whole
 * section duplicates it — live evidence (post 224358415828): the same
 * checklist appears twice, the second copy unchunked and glued to the
 * previous sentence as "...보관둘째,". This planner compares the expected
 * chunked plainText against the editor tail and decides what remains to type.
 */
export interface TypingFallbackPlan {
  mode: 'skip' | 'resume' | 'full';
  /** Index of the first paragraph (\n{2,} block) still missing from the editor. */
  startParagraphIndex: number;
  /**
   * Whitespace-stripped chars of the first missing paragraph that already sit
   * at the editor tail (mid-paragraph cut). 0 = paragraph boundary.
   */
  firstParagraphCharOffset: number;
  /** Whitespace-stripped chars confirmed present (fully matched paragraphs only). */
  matchedChars: number;
}

// [2026-08-06] 공백 제외 글자수 기준. 15(공백 포함)였을 때와 같은 실질 분량이 되도록
// 12로 조정 — 한국어 문장에서 공백은 약 15~20%를 차지한다.
const MIN_TAIL_OVERLAP_CHARS = 12;

function normalizeForMatch(value: string): string {
  // [2026-08-06] 에디터 꼬리는 textContent 계열 추출이라 줄바꿈 위치에 공백이 없다
  // ("영화를오가며"). 공백을 남기는 정규화로는 붙여넣기분을 못 찾아 'full'을 돌려줘
  // 같은 섹션을 통째로 재타이핑했다(라이브 224369415231). 공백 완전 제거로 대조한다.
  return String(value ?? '').replace(/\s+/g, '');
}

export function splitFallbackParagraphs(plainText: string): string[] {
  return String(plainText ?? '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export function planTypingFallback(
  expectedPlainText: string,
  editorTailText: string,
): TypingFallbackPlan {
  const paragraphs = splitFallbackParagraphs(expectedPlainText);
  const tail = normalizeForMatch(editorTailText);

  let cursor = 0;
  let matchedChars = 0;
  let index = 0;
  for (; index < paragraphs.length; index++) {
    const para = normalizeForMatch(paragraphs[index]);
    const at = tail.indexOf(para, cursor);
    if (at === -1) break;
    cursor = at + para.length;
    matchedChars += para.length;
  }

  if (index >= paragraphs.length && paragraphs.length > 0) {
    return {
      mode: 'skip',
      startParagraphIndex: paragraphs.length,
      firstParagraphCharOffset: 0,
      matchedChars,
    };
  }

  // Was the first missing paragraph cut mid-way at the very end of the editor
  // tail? If so, the caret sits right after the cut — typing the remainder
  // continues seamlessly without duplicating the typed prefix.
  const missing = normalizeForMatch(paragraphs[index] ?? '');
  let overlap = 0;
  const maxOverlap = Math.min(missing.length - 1, tail.length - cursor);
  for (let k = maxOverlap; k >= MIN_TAIL_OVERLAP_CHARS; k--) {
    if (tail.endsWith(missing.slice(0, k))) {
      overlap = k;
      break;
    }
  }

  const nothingPresent = index === 0 && overlap === 0 && matchedChars === 0;
  return {
    mode: nothingPresent ? 'full' : 'resume',
    startParagraphIndex: index,
    firstParagraphCharOffset: overlap,
    matchedChars,
  };
}

/**
 * Map a whitespace-stripped offset back into the raw paragraph (which still
 * contains \n chunk breaks) and return the untyped remainder.
 * [2026-08-06] Offset unit follows planTypingFallback's whitespace-stripped
 * comparison space: only non-whitespace chars consume the offset.
 */
export function sliceParagraphFromNormalizedOffset(
  rawParagraph: string,
  normalizedOffset: number,
): string {
  const raw = String(rawParagraph ?? '');
  if (normalizedOffset <= 0) return raw;

  let consumed = 0;
  let i = 0;
  while (i < raw.length && consumed < normalizedOffset) {
    if (!/\s/.test(raw[i])) consumed += 1;
    i += 1;
  }
  return raw.slice(i).replace(/^\s+/, '');
}
