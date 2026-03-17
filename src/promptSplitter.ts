/**
 * promptSplitter.ts — 프롬프트 system/user 분리 공통 모듈
 * 
 * 모든 provider (Gemini, Claude, OpenAI, Perplexity)가 공통으로 사용하는
 * 프롬프트 분리 로직을 한곳에 통합합니다.
 * 
 * ⚡ 핵심 원리:
 *   .prompt 파일로 조합된 프롬프트에는 [원본 텍스트] 마커가 있습니다.
 *   이 마커를 기준으로:
 *     - 마커 이전 = system (AI 규칙/지시사항)
 *     - 마커 이후 = user (원문/키워드/추가 지시)
 *   
 *   이렇게 분리하면 각 AI provider의 system/user 채널을 올바르게 활용하여
 *   규칙 인식률이 향상됩니다.
 * 
 * @since 2026-03-16
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 인터페이스
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * system/user 분리 결과
 */
export interface SplitPromptResult {
  /** system 메시지 (규칙/지시사항). 비어있으면 분리 불가했음을 의미 */
  system: string;
  /** user 메시지 (원문/키워드/추가 지시) */
  user: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 상수
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 기본 마커: .prompt 파일에서 규칙과 원문을 구분하는 표식 */
const DEFAULT_MARKER = '[원본 텍스트]';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 핵심 함수
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 마커 기반으로 프롬프트를 system/user로 분리합니다.
 * 
 * 동작:
 *   1. prompt에서 marker를 검색
 *   2. 마커 이전 → system (규칙/지시사항)
 *   3. 마커 이후 (마커 포함) → user (원문 + 추가 지시)
 *   4. 마커가 없으면 → 전체를 system으로, user는 기본 요청 문구
 * 
 * @param prompt - 전체 프롬프트 문자열
 * @param marker - 분리 기준 마커 (기본값: '[원본 텍스트]')
 * @returns SplitPromptResult
 * 
 * @example
 * ```typescript
 * const { system, user } = splitPromptByMarker(fullPrompt);
 * // → system: 규칙/지시사항 부분
 * // → user: [원본 텍스트] 이후 부분
 * ```
 */
export function splitPromptByMarker(
  prompt: string,
  marker: string = DEFAULT_MARKER
): SplitPromptResult {
  if (!prompt || !prompt.trim()) {
    console.warn('[promptSplitter] 빈 프롬프트 입력');
    return { system: '', user: '' };
  }

  const markerIndex = prompt.indexOf(marker);

  if (markerIndex !== -1) {
    // 마커를 기준으로 분리
    const system = prompt.substring(0, markerIndex).trim();
    const user = prompt.substring(markerIndex).trim();

    console.log(`[promptSplitter] 분리 완료: system=${system.length}자, user=${user.length}자`);
    return { system, user };
  }

  // 마커가 없는 경우: 전체를 system으로 처리
  console.log(`[promptSplitter] 마커 없음 → 전체를 system으로 처리 (${prompt.length}자)`);
  return {
    system: prompt.trim(),
    user: '위 지시사항에 따라 블로그 글을 JSON 형식으로 작성해주세요.\n⚠️ { 로 시작하고 } 로 끝나는 유효한 JSON만 출력하세요.',
  };
}

/**
 * Perplexity 전용: 분리된 user 메시지를 키워드 모드에 맞게 가공합니다.
 * 
 * Perplexity sonar 모델은 다음 특성이 있습니다:
 *   - 긴 지시사항을 user message로 받으면 거부하는 경향
 *   - 웹 검색 기능을 활용한 키워드 리서치가 가능
 * 
 * 이 함수는 splitPromptByMarker()의 결과를 받아서
 * 키워드 모드(rawText 200자 미만)와 원문 모드를 구분합니다.
 * 
 * @param splitResult - splitPromptByMarker() 결과
 * @param marker - 분리에 사용된 마커 (기본값: '[원본 텍스트]')
 * @returns 가공된 SplitPromptResult
 */
export function adjustForPerplexity(
  splitResult: SplitPromptResult,
  marker: string = DEFAULT_MARKER
): SplitPromptResult {
  const { system, user } = splitResult;

  // 마커가 user에 포함된 경우만 키워드/원문 판별
  if (!user.includes(marker)) {
    return splitResult;
  }

  // rawText 추출: 마커 이후 ~ 다음 섹션(━ 구분선 또는 [사용자 추가 지시사항] 등) 전까지
  const rawTextContent = user
    .replace(marker, '')
    .split(/━{5,}|\[사용자 추가 지시사항|\[실시간 키워드 데이터/)[0]
    .trim();

  if (rawTextContent.length < 200) {
    // 키워드 모드: Perplexity 웹 검색 활용
    console.log(`[promptSplitter] Perplexity 키워드 모드 (rawText: ${rawTextContent.length}자)`);
    return {
      system,
      user: `아래 키워드에 대해 최신 정보를 웹에서 검색하여 참고한 후, 위 지시사항(system)에 맞는 블로그 글을 작성해주세요.

키워드: ${rawTextContent}

⚠️ 반드시 system 메시지의 JSON 출력 형식을 정확히 따라주세요.
⚠️ { 로 시작하고 } 로 끝나는 유효한 JSON만 출력하세요.
⚠️ 마크다운이나 설명 텍스트 없이 오직 JSON만 출력하세요.`,
    };
  }

  // 원문 모드: rawText가 충분히 있음
  console.log(`[promptSplitter] Perplexity 원문 모드 (rawText: ${rawTextContent.length}자)`);
  return {
    system,
    user: `${user}

⚠️ 반드시 위 system 메시지의 JSON 출력 형식을 정확히 따라주세요.
⚠️ { 로 시작하고 } 로 끝나는 유효한 JSON만 출력하세요.`,
  };
}
