/**
 * 콘텐츠 후처리 모듈
 *
 * contentGenerator.ts에서 추출된 후처리 함수들.
 * 이모지 제거, 포맷팅 정리, 문단 정규화 등 순수 텍스트 변환 함수.
 *
 * Phase 2-1: contentGenerator.ts 분할의 첫 단계
 */

// ── 이모지 제거 ──

const EMOJI_PATTERN = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{FE00}-\u{FE0F}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{231A}-\u{231B}]|[\u{23E9}-\u{23F3}]|[\u{23F8}-\u{23FA}]|[\u{25AA}-\u{25AB}]|[\u{25B6}]|[\u{25C0}]|[\u{25FB}-\u{25FE}]|[\u{2614}-\u{2615}]|[\u{2648}-\u{2653}]|[\u{267F}]|[\u{2693}]|[\u{26A1}]|[\u{26AA}-\u{26AB}]|[\u{26BD}-\u{26BE}]|[\u{26C4}-\u{26C5}]|[\u{26CE}]|[\u{26D4}]|[\u{26EA}]|[\u{26F2}-\u{26F3}]|[\u{26F5}]|[\u{26FA}]|[\u{26FD}]|[\u{2702}]|[\u{2705}]|[\u{2708}-\u{270D}]|[\u{270F}]|[\u{2712}]|[\u{2714}]|[\u{2716}]|[\u{271D}]|[\u{2721}]|[\u{2728}]|[\u{2733}-\u{2734}]|[\u{2744}]|[\u{2747}]|[\u{274C}]|[\u{274E}]|[\u{2753}-\u{2755}]|[\u{2757}]|[\u{2763}-\u{2764}]|[\u{2795}-\u{2797}]|[\u{27A1}]|[\u{27B0}]|[\u{27BF}]|[\u{2934}-\u{2935}]|[\u{2B05}-\u{2B07}]|[\u{2B1B}-\u{2B1C}]|[\u{2B50}]|[\u{2B55}]|[\u{3030}]|[\u{303D}]|[\u{3297}]|[\u{3299}]|[\u{1F004}]|[\u{1F0CF}]|[\u{1F170}-\u{1F171}]|[\u{1F17E}-\u{1F17F}]|[\u{1F18E}]|[\u{1F191}-\u{1F19A}]|[\u{1F201}-\u{1F202}]|[\u{1F21A}]|[\u{1F22F}]|[\u{1F232}-\u{1F23A}]|[\u{1F250}-\u{1F251}]/gu;

/**
 * 텍스트에서 이모지를 제거한다.
 */
export function removeEmojis(text: string): string {
  if (!text) return text;
  return text.replace(EMOJI_PATTERN, '').replace(/\s{2,}/g, ' ').trim();
}

/**
 * 텍스트에 이모지가 포함되어 있는지 검사한다.
 */
export function containsEmoji(text: string): boolean {
  return EMOJI_PATTERN.test(text);
}

// ── 줄바꿈 정규화 ──

/**
 * 텍스트의 연속 줄바꿈을 최대 2개로 정규화한다.
 */
export function normalizeLineBreaks(text: string): string {
  if (!text) return text;
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── 문단 구분 삽입 ──

/**
 * 긴 문단을 자동으로 분리한다 (400자 초과 시).
 * 마침표, 느낌표, 물음표 뒤에서 분리.
 */
export function ensureParagraphBreaks(text: string, maxCharsPerParagraph: number = 400): string {
  if (!text || text.length <= maxCharsPerParagraph) return text;

  const paragraphs = text.split('\n\n');
  const result: string[] = [];

  for (const para of paragraphs) {
    if (para.length <= maxCharsPerParagraph) {
      result.push(para);
      continue;
    }

    // 긴 문단을 문장 단위로 분리
    const sentences = para.split(/(?<=[.!?])\s+/);
    let current = '';

    for (const sentence of sentences) {
      if (current.length + sentence.length > maxCharsPerParagraph && current.length > 0) {
        result.push(current.trim());
        current = sentence;
      } else {
        current += (current ? ' ' : '') + sentence;
      }
    }

    if (current.trim()) {
      result.push(current.trim());
    }
  }

  return result.join('\n\n');
}

// ── 소제목 길이 제한 ──

/**
 * 소제목이 최대 길이를 초과하면 자른다.
 */
export function truncateHeading(heading: string, maxLength: number = 30): string {
  if (!heading || heading.length <= maxLength) return heading;

  // 단어 단위로 자르기
  const words = heading.split(/\s+/);
  let result = '';

  for (const word of words) {
    const candidate = result ? `${result} ${word}` : word;
    if (candidate.length > maxLength) break;
    result = candidate;
  }

  return result || heading.slice(0, maxLength);
}

// ── 이스케이프 시퀀스 정리 ──

/**
 * AI 응답에 포함될 수 있는 이스케이프 시퀀스를 정리한다.
 */
export function cleanEscapeSequences(text: string): string {
  if (!text) return text;

  return text
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\');
}

// ── 정규식 이스케이프 ──

/**
 * 문자열을 정규식에 안전하게 사용할 수 있도록 이스케이프한다.
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── 소제목 중복 구절 제거 ──

/**
 * 소제목 내에서 반복되는 구절을 제거한다.
 * 예: "맛있는 라면 맛있는 라면 추천" → "맛있는 라면 추천"
 */
export function dedupeRepeatedPhrasesInHeading(heading: string): string {
  if (!heading) return heading;

  // 2~6글자 구절의 연속 반복 감지
  const cleaned = heading.replace(/(.{2,6})\1+/g, '$1');

  // 공백 정규화
  return cleaned.replace(/\s{2,}/g, ' ').trim();
}
