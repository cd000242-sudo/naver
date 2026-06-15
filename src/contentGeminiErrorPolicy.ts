export function translateGeminiError(rawMessage: string): string {
  const msg = rawMessage.toLowerCase();
  const detail = `\n📋 상세: ${rawMessage}`;
  const captureGuide = `\n📸 이 화면을 캡처해서 사장님께 보내주시면 즉시 해결됩니다.`;

  if (msg.includes('api key expired') || msg.includes('api_key_invalid') || msg.includes('api key not valid')) {
    return '🔑 Gemini API키가 만료됨! Google AI Studio에서 새 키를 발급받으세요.' + detail;
  }

  if (msg.includes('429') || msg.includes('quota') || msg.includes('rate limit') || msg.includes('too many requests') || msg.includes('resource exhausted')) {
    if (msg.includes('limit: 0') || msg.includes('free_tier')) {
      return '🚫 이 모델의 무료 사용이 차단되었습니다.\n' +
        '👉 해결: 설정 → AI 엔진에서 다른 모델로 변경하거나, Google AI Studio에서 유료(Pay-as-you-go)로 전환하세요.\n' +
        '⚠️ 유료 전환 시 기존 무료 할당량도 사라지므로 주의!' + detail;
    }
    return '⚡ 분당 요청 한도 초과! 1~2분 후 자동 해제됩니다.\n' +
      '💡 계속 발생하면: AI Studio에서 현재 프로젝트 한도를 확인하고, 유료 전환 또는 한도 상향을 검토하세요.' + detail;
  }

  if (msg.includes('401') || msg.includes('403') || msg.includes('permission') || msg.includes('forbidden')) {
    return '🔒 Gemini API 인증 실패! API키가 올바른지 확인하세요.' + detail;
  }

  if (msg.includes('500') || msg.includes('503') || msg.includes('internal') || msg.includes('unavailable') || msg.includes('overloaded')) {
    return '🔧 Gemini 응답 오류가 발생했습니다.\n' +
      '💡 잠시 후 다시 시도하거나 API 키와 사용량 한도를 확인하세요.' + detail;
  }

  if (msg.includes('timeout') || msg.includes('시간 초과') || msg.includes('타임아웃')) {
    return '⏱️ Gemini 응답 시간 초과! 네트워크 상태를 확인하고 다시 시도하세요.' + detail;
  }

  if (msg.includes('404') || msg.includes('not found') || msg.includes('모델')) {
    return '❌ Gemini 모델을 찾을 수 없음! 지원되는 모델인지 확인하세요.' + detail;
  }

  if (msg.includes('blocked') || msg.includes('safety') || msg.includes('content policy')) {
    return '🚫 Gemini 콘텐츠 정책 위반으로 차단됨! 프롬프트를 수정하세요.' + detail;
  }

  if (msg.includes('fetch failed') || msg.includes('error fetching') ||
      msg.includes('econnreset') || msg.includes('econnrefused') ||
      msg.includes('enotfound') || msg.includes('eai_') ||
      msg.includes('getaddrinfo') || msg.includes('network') ||
      msg.includes('ssl') || msg.includes('certificate') || msg.includes('handshake')) {
    return '🌐 네트워크 연결 실패! 인터넷 연결, 백신/방화벽, 회사 프록시 설정을 확인하세요.' + detail + captureGuide;
  }

  if (msg.includes('api 키가 설정되지') || msg.includes('api key')) {
    return '⚙️ Gemini API키가 설정되지 않았습니다! 환경설정에서 API키를 입력하세요.' + detail;
  }

  return `Gemini 오류 (분류 안 됨): ${rawMessage}` + captureGuide;
}
