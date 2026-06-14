export function buildSensitiveTopicChatbotGuidance(): string {
  return [
    '특히 연예인 실명, 열애설, 루머, 사생활, 폭로, 증거, 목격담 같은 키워드는 AI가 민감한 주제로 판단해 본문 생성을 거부할 수 있습니다.',
    '이 경우 앱 오류라기보다 AI 안전 필터가 작동한 상황일 가능성이 높습니다.',
    '리더스프로 사이트의 무료 챗봇에 "이 키워드를 안전하게 바꿔줘"라고 물어본 뒤, 추천받은 제목/키워드로 다시 생성해보세요.',
  ].join('\n');
}

export function buildMissingBodyUserMessage(): string {
  return [
    'AI 응답에서 실제 본문을 찾지 못했습니다.',
    '',
    '앱이 bodyPlain/bodyHtml/headings/content/sections 등 복구 가능한 필드를 모두 확인했지만, 제목 또는 메타정보만 있고 본문이 없었습니다.',
    '',
    '원인: AI가 빈 응답을 반환했거나 안전 필터/저작권 필터(SAFETY/RECITATION)에 걸렸을 수 있습니다.',
    '',
    buildSensitiveTopicChatbotGuidance(),
    '',
    '해결: 같은 엔진으로 자동 재시도 후에도 반복되면 키워드를 순화하거나, 사이트 무료 챗봇에서 안전한 표현으로 바꾼 뒤 다시 시도해주세요.',
  ].join('\n');
}

export function buildGeminiEmptyResponseUserMessage(modelName: string): string {
  return [
    `🚫 [${modelName}] 응답을 생성하지 못했습니다. (빈 응답 반복)`,
    '',
    '📌 원인: Gemini가 이 주제에 대해 응답을 거부했거나, 안전 필터에 걸렸을 수 있습니다.',
    '',
    buildSensitiveTopicChatbotGuidance(),
    '',
    '💡 해결 방법:',
    '  1) 열애설/루머/사생활처럼 단정적인 표현을 피하고, "온라인 관심 배경", "공식 확인 기준", "확인된 정보 정리"처럼 안전한 방향으로 바꿔보세요.',
    '  2) 사이트 무료 챗봇에 현재 키워드를 붙여넣고 안전한 제목/키워드로 바꿔달라고 요청하세요.',
    '  3) 키워드 순화 후에도 계속 실패하면 설정에서 다른 AI 엔진(Claude/OpenAI)으로 변경하세요.',
  ].join('\n');
}
