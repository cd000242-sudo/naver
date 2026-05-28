/**
 * [Phase 3-16/v2.10.162] contentGenerator god file decomposition — StructuredContent transforms.
 *
 * 본문/제목/소제목 일괄 변환 — 이모지 제거, 줄바꿈 정규화, 문단 자동 분리, 소제목 marker fix.
 * 모두 pure (StructuredContent in-place 수정 또는 변환 반환).
 */

import type { StructuredContent } from './contentGenerator';
import { removeEmojis } from './contentTextHelpers';

export function applyOrdinalHeadingMarkerFix(content: StructuredContent): void {
  const headings = Array.isArray(content?.headings) ? content.headings : [];
  if (headings.length === 0) return;

  const replace = (input: string): string => {
    const text = String(input || '');
    if (!text) return text;
    const re = /^\s*(?:(?:(?:제\s*)?\d+|(?:첫|두|세|네|다섯|여섯|일곱|여덟|아홉|열))\s*번째\s*)?소제목\s*[:：]\s*/gmi;
    let i = 0;
    return text.replace(re, () => {
      const title = String((headings[i] as any)?.title || '').trim();
      i += 1;
      // title이 비어있거나 ? 만 있는 경우 : 을 붙이지 않음
      if (!title || title === '?' || title === '？') return '';
      return `${title}: `;
    });
  };

  if (content.bodyPlain) content.bodyPlain = replace(content.bodyPlain);
  if (content.bodyHtml) content.bodyHtml = replace(content.bodyHtml);
}

// ✅ 생성된 콘텐츠에서 이모지 제거 (StructuredContent 전체)
export function removeEmojisFromContent(content: StructuredContent): StructuredContent {
  if (!content) return content;

  // 제목에서 이모지 제거
  if (content.selectedTitle) {
    content.selectedTitle = removeEmojis(content.selectedTitle);
  }

  // ✅ [2026-03-14] 본문에서 이모지 제거 (기존 누락 — 본문 이모지 잔존의 근본 원인)
  if (content.bodyPlain) {
    content.bodyPlain = removeEmojis(content.bodyPlain);
  }
  if (content.bodyHtml) {
    // HTML 본문에서도 이모지 제거 (태그 밖의 텍스트에서)
    content.bodyHtml = removeEmojis(content.bodyHtml);
  }
  if ((content as any).introduction) {
    (content as any).introduction = removeEmojis((content as any).introduction);
  }
  if ((content as any).conclusion) {
    (content as any).conclusion = removeEmojis((content as any).conclusion);
  }

  // 소제목에서 이모지 제거
  if (content.headings) {
    content.headings = content.headings.map(h => ({
      ...h,
      title: removeEmojis(h.title),
      content: h.content ? removeEmojis(h.content) : h.content
    }));
  }

  // 해시태그에서 이모지 제거
  if (content.hashtags) {
    content.hashtags = content.hashtags.map(tag => removeEmojis(tag));
  }

  console.log('[ContentGenerator] ✅ 이모지 자동 제거 완료 (본문 포함)');
  return content;
}

// ✅ [2026-03-14] 본문 연속 줄바꿈 정리 — 부자연스러운 이중/삼중 빈 줄 제거
function normalizeLineBreaks(text: string): string {
  if (!text) return text;
  // 1. 3개 이상 연속 줄바꿈 → 2개로 (문단 구분 유지)
  let result = text.replace(/\n{3,}/g, '\n\n');
  // 2. \r\n\r\n\r\n 패턴도 정리
  result = result.replace(/(\r?\n){3,}/g, '\n\n');
  // 3. 문단 시작/끝의 불필요한 공백 정리
  result = result.replace(/\n[ \t]+\n/g, '\n\n');
  // 4. 시작/끝 빈 줄 제거
  result = result.trim();
  return result;
}

export function normalizeContentLineBreaks(content: StructuredContent): StructuredContent {
  if (!content) return content;

  if (content.bodyPlain) {
    content.bodyPlain = normalizeLineBreaks(content.bodyPlain);
  }
  if (content.bodyHtml) {
    content.bodyHtml = normalizeLineBreaks(content.bodyHtml);
  }
  if ((content as any).introduction) {
    (content as any).introduction = normalizeLineBreaks((content as any).introduction);
  }
  if ((content as any).conclusion) {
    (content as any).conclusion = normalizeLineBreaks((content as any).conclusion);
  }
  if (content.headings) {
    content.headings = content.headings.map(h => ({
      ...h,
      content: h.content ? normalizeLineBreaks(h.content) : h.content
    }));
  }

  console.log('[ContentGenerator] ✅ 연속 줄바꿈 정리 완료');
  return content;
}

// ✅ [2026-03-16] AI가 \n\n 문단 구분을 빠뜨린 경우 자동 삽입
// [v2.10.390] 본질은 프롬프트 모바일 룰 — 본 함수는 AI 실수 시 안전망.
//   임계값 180→200 (AI가 잘 만든 단락 침범 최소화).
//   business/base.prompt + affiliate/chain/stage3_draft.prompt에 모바일 룰 추가됨.
// [v2.10.393] 한국어 종결어미 한정 split — v2.10.391 OFF 이유(영문 약어/소수점)를
//   정규식 한국어 limit로 해소. "Mr." "3.14" "A.I." 등 split 안 됨.
function ensureParagraphBreaks(text: string): string {
  if (!text || text.length < 200) return text;

  // 이미 \n\n이 있으면 각 문단만 개별 검사
  if (text.includes('\n\n')) {
    const paragraphs = text.split('\n\n');
    const fixed = paragraphs.map(p => ensureParagraphBreaks(p.trim()));
    return fixed.join('\n\n');
  }

  // \n\n 없이 200자 이상 → 한국어 종결어미 기준으로 문단 분리
  // [v2.10.393] (?<=[가-힣][.!?]) — 한글 직후 마침표만 split.
  //   영문 약어(Mr./Dr.), 이니셜(A.I.), 소수점(3.14)은 한글 직전이 아니므로 split 안 됨.
  //   숫자목록(1. 2.)도 자동 보호 (숫자가 한글 아님).
  const sentences = text
    .split(/(?<=[가-힣][.!?。！？])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  if (sentences.length <= 2) {
    // 문장이 2개 이하면 그대로 반환 (분리할 필요 없음)
    return text;
  }

  // [v2.10.390] 1~3문장마다 \n\n 삽입 (사후 안전망 — AI 단락 침범 최소화)
  const result: string[] = [];
  let current: string[] = [];
  const breakAfter = () => Math.floor(Math.random() * 3) + 1; // 1~3문장
  let nextBreak = breakAfter();

  for (let i = 0; i < sentences.length; i++) {
    current.push(sentences[i]);

    if (current.length >= nextBreak && i < sentences.length - 1) {
      result.push(current.join(' '));
      current = [];
      nextBreak = breakAfter();
    }
  }
  if (current.length > 0) {
    result.push(current.join(' '));
  }

  const fixed = result.join('\n\n');
  if (fixed !== text) {
    console.log(`[ensureParagraphBreaks] ✅ 문단 구분 자동 삽입: ${sentences.length}문장 → ${result.length}문단`);
  }
  return fixed;
}

export function ensureContentParagraphBreaks(content: StructuredContent): StructuredContent {
  if (!content) return content;

  if (content.bodyPlain) {
    content.bodyPlain = ensureParagraphBreaks(content.bodyPlain);
  }
  if ((content as any).introduction) {
    (content as any).introduction = ensureParagraphBreaks((content as any).introduction);
  }
  if ((content as any).conclusion) {
    (content as any).conclusion = ensureParagraphBreaks((content as any).conclusion);
  }
  if (content.headings) {
    content.headings = content.headings.map(h => ({
      ...h,
      content: h.content ? ensureParagraphBreaks(h.content) : h.content
    }));
  }

  return content;
}

/**
 * [v2.10.165] 정규식 매칭 횟수 제한 — generic regex helper.
 *
 * 첫 N개 매치만 유지, 나머지는 빈 문자열로 치환.
 */
export function limitRegexOccurrences(text: string, regex: RegExp, maxCount: number): string {
  if (!text) return text;
  let count = 0;
  return text.replace(regex, (m) => {
    count += 1;
    return count <= maxCount ? m : '';
  });
}

/**
 * [v2.10.165] 소제목 길이 제한 (30자 이내로 완화 — 제품명 포함 가능).
 *
 * 자연스러운 끊김 위치(공백/쉼표) 찾기 + 끝 부분 조사 정리 + fallback (5자 미만 시 원본 앞부분).
 */
export function truncateHeadingTitles(content: StructuredContent, maxLength: number = 30): StructuredContent {
  if (!content || !content.headings) return content;

  const truncateTitle = (title: string): string => {
    const cleaned = String(title || '').trim();
    if (cleaned.length <= maxLength) return cleaned;

    // 30자 이내에서 자연스러운 끊김 찾기
    let truncated = cleaned.substring(0, maxLength);

    // 마지막 단어가 잘렸을 경우, 마지막 공백 또는 조사 위치에서 자르기
    const lastSpaceIdx = truncated.lastIndexOf(' ');
    const lastCommaIdx = truncated.lastIndexOf(',');

    // 공백이나 쉼표가 있으면 그 위치에서 자르기
    if (lastSpaceIdx > maxLength * 0.5) {
      truncated = truncated.substring(0, lastSpaceIdx);
    } else if (lastCommaIdx > maxLength * 0.5) {
      truncated = truncated.substring(0, lastCommaIdx);
    }

    // 끝 부분 정리 (조사, 마침표, 쉼표, 불필요한 어미 등 제거)
    truncated = truncated.replace(/[,\.!\?\s의가를에서으로와]*$/, '').trim();

    // 만약 너무 짧아지면 원본에서 그냥 앞에서부터 자르기
    if (truncated.length < 5) {
      truncated = cleaned.substring(0, maxLength).trim();
    }

    console.log(`[ContentGenerator] 소제목 최적화 절삭: "${cleaned.substring(0, 35)}..." → "${truncated}"`);
    return truncated;
  };

  content.headings = content.headings.map(h => ({
    ...h,
    title: truncateTitle(h.title)
  }));

  console.log('[ContentGenerator] ✅ 소제목 길이 제한 (30자 이내) 적용 완료');
  return content;
}
