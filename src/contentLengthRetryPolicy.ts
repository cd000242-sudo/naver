export interface ExpansionTargetInput {
  requestedMinChars: number;
  attempt: number;
  safeMaxChars: number;
}

export interface ExpansionRetryInstructionInput extends ExpansionTargetInput {
  plainLength: number;
  minChars: number;
}

export interface FinalQualityEvaluationInput {
  visibleChars: number;
  validationMinChars: number;
  warningMinChars: number;
  attempt: number;
  maxAttempts: number;
}

export function shouldRunFinalQualityEvaluation(input: FinalQualityEvaluationInput): boolean {
  const visibleChars = Math.max(0, Math.round(Number(input.visibleChars) || 0));
  const validationMinChars = Math.max(1, Math.round(Number(input.validationMinChars) || 1));
  const warningMinChars = Math.max(0, Math.round(Number(input.warningMinChars) || 0));
  const attempt = Math.max(0, Math.round(Number(input.attempt) || 0));
  const maxAttempts = Math.max(0, Math.round(Number(input.maxAttempts) || 0));

  return attempt >= maxAttempts
    && visibleChars >= warningMinChars
    && visibleChars < validationMinChars;
}

export function resolveExpansionTargetChars(input: ExpansionTargetInput): number {
  const requestedMinChars = Math.max(0, Math.round(Number(input.requestedMinChars) || 0));
  const attempt = Math.max(0, Math.round(Number(input.attempt) || 0));
  const safeMaxChars = Math.max(0, Math.round(Number(input.safeMaxChars) || 0));
  const targetChars = Math.round(requestedMinChars * (1 + attempt * 0.20));
  return Math.min(targetChars, safeMaxChars);
}

export function buildContentExpansionRetryInstruction(input: ExpansionRetryInstructionInput): string {
  const plainLength = Math.max(0, Math.round(Number(input.plainLength) || 0));
  const minChars = Math.max(1, Math.round(Number(input.minChars) || 1));
  const targetChars = resolveExpansionTargetChars(input);
  const percent = Math.round((plainLength / minChars) * 100);

  return `

[REVISE REQUEST - URGENT - MANDATORY EXPANSION]
- CRITICAL: 현재 본문 분량은 ${plainLength}자로 목표(${minChars}자)의 ${percent}%에 불과합니다. 이 글은 분량이 부족합니다.
- REQUIREMENT: ${targetChars}자를 목표로 확장해주세요.
- EXPANSION STRATEGY:
  * 각 소제목(heading) 섹션을 300-400자로 확장하세요.
  * 각 소제목마다 2-3개의 문단을 작성하세요.
  * 각 문단은 80-120자 정도면 충분합니다.
  * 원본 자료와 검색 결과에 이미 있는 사실의 배경, 이유, 맥락을 더 자세히 설명하세요.
  * 실용적인 효과, 적용 방법, 주의점을 구체적으로 설명하세요.
  * 자료에 있는 내용 범위 안에서 비교 분석이나 해석을 제시하세요.
  * 자료에 없는 통계·수치·연구 결과·전문가 인용·경험담을 만들어 추가하는 것은 절대 금지입니다. 분량보다 사실성이 우선입니다.
- QUALITY REQUIREMENT: 가치 있는 정보로만 확장하세요.
  * 같은 내용 반복 금지
  * 의미 없는 문장 추가 금지
  * 단순히 글자수만 늘리는 것 금지
  * 구체적이고 실용적인 정보만 추가
- STRUCTURE REQUIREMENT: 본문을 확장할 때는 중간 섹션의 본문 내용만 확장하세요. 결론(headings 배열의 마지막 소제목에 해당하는 본문)을 작성한 뒤에는 즉시 멈추세요. 결론 뒤에 어떤 내용도 추가하지 마세요.
- CHARACTER COUNT VERIFICATION: 확장 후 반드시 본문의 전체 글자수를 세어보세요. ${targetChars}자 이상이어야 합니다.
`;
}
