/**
 * ✅ [2026-01-25 모듈화] 에러 번역 유틸리티
 * - renderer.ts에서 분리됨
 * - AI 오류 메시지 한글화
 */

/**
 * Gemini AI 오류 메시지를 사용자 친화적인 한글로 번역
 */
export function translateGeminiError(error: Error): string {
    if (!error) return '⚠️ 알 수 없는 오류';
    const msg = error.message.toLowerCase();

    if (msg.includes('api key')) return '🚫 [인증 오류] Gemini API 키가 올바르지 않습니다. 키를 확인해주세요.';
    if (msg.includes('quota exceeded') || msg.includes('429') || msg.includes('rate limit') || msg.includes('too many requests')) return '⏳ [사용량 초과] Gemini 무료 사용량이 초과되었습니다. 잠시 후 다시 시도하거나 API 키를 교체하세요.';
    if (msg.includes('safety') || msg.includes('blocked')) return '🛡️ [안전 필터] 생성된 콘텐츠가 Gemini 안전 기준(선정성/폭력성 등)에 의해 차단되었습니다. 주제를 변경해보세요.';
    if (msg.includes('location') || msg.includes('unsupported country')) return '🌍 [접속 위치] 현재 국가에서 Gemini API를 사용할 수 없습니다. VPN을 확인해주세요.';
    if (msg.includes('valid json')) return '📝 [형식 오류] AI 응답 형식이 깨졌습니다. 일시적인 현상이니 다시 시도해주세요.';
    if (msg.includes('500') || msg.includes('internal')) return '🔥 [서버 오류] Google Gemini 서버에 일시적인 문제가 발생했습니다.';
    if (msg.includes('fetch failed')) return '📡 [연결 실패] 인터넷 연결 상태를 확인해주세요.';

    return `⚠️ [알 수 없는 오류] ${error.message}`;
}

console.log('[ErrorUtils] 📦 모듈 로드됨!');
