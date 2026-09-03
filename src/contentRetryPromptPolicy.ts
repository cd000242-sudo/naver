export function prependInvalidJsonResponseInstruction(previousInstruction = ''): string {
  return `\n⚠️ 이전 응답이 올바른 JSON이 아니었습니다. 반드시 { 로 시작하는 유효한 JSON만 출력하세요. 설명, 인사말, 마크다운 없이 오직 JSON 객체만 반환하세요.\n${previousInstruction}`;
}

export function prependJsonParseRetryInstruction(input: {
  attempt: number;
  previousInstruction?: string;
}): string {
  const attempt = Math.max(0, Math.round(Number(input.attempt) || 0));
  return `\n⚠️ JSON 파싱 실패 (시도 ${attempt + 1}). 반드시 { 로 시작 } 로 끝나는 유효 JSON만 출력. 마크다운/설명 금지. 모든 키-값 사이 콤마 필수.\n${input.previousInstruction || ''}`;
}

export function prependDuplicatePatternRetryInstruction(input: {
  errors: string;
  previousInstruction?: string;
}): string {
  return `\n⚠️ 중복/패턴 감지: ${input.errors}. 반복 구조/문구 제거하고 다른 표현으로 재작성.\n${input.previousInstruction || ''}`;
}

export function prependValidationRetryInstruction(previousInstruction = ''): string {
  return `\n⚠️ 검증 오류 발생. 소제목 순서와 중복을 확인하고 다시 작성하세요.\n${previousInstruction}`;
}

export function prependFaithfulnessRetryInstruction(input: {
  matchedTriggers: string;
  previousInstruction?: string;
  /** [2026-09-04] 재료에서 뽑은 당사자 발언 — "인용하라" 만으로는 두 번 생성해도 0건이었다. 후보를 손에 쥐여 준다. */
  quoteCandidates?: readonly string[];
}): string {
  const quotes = (input.quoteCandidates || []).filter(Boolean).slice(0, 5);
  const quoteLine = quotes.length > 0
    ? `5. 아래 발언 중 최소 2개를 따옴표 그대로 본문에 넣고, 바로 앞에 누가 말했는지 붙인다(자료 원문을 한 글자도 바꾸지 않는다):\n` +
      quotes.map((quote) => `   - "${quote}"`).join('\n') + '\n'
    : '';
  return `\n⚠️ Faithfulness 강화 재생성:\n` +
    `1. 일반론 어휘 (${input.matchedTriggers}) 사용 금지.\n` +
    `2. 모든 사실 진술 단락 끝에 [자료] 인용 토큰 추가.\n` +
    `3. [Article Content] 또는 <source>에 없는 수치/날짜/금액 작성 금지.\n` +
    `4. 자료에 답이 없는 섹션은 "(자료 부족)" 표기 후 다음 섹션으로.\n${quoteLine}${input.previousInstruction || ''}`;
}

export function prependSectionDistinctnessRetryInstruction(previousInstruction = ''): string {
  return `\n⚠️ 섹션 중복 재생성: 각 H2(소제목)는 서로 다른 정보 단위를 담아야 합니다. ` +
    `같은 내용을 표현만 바꿔 반복하지 말고, 섹션마다 다른 구체 정보(장소·수치·방법·사례·비교 기준)를 넣으세요.\n${previousInstruction}`;
}
