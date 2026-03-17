/**
 * ✅ [2026-03-09] 이미지 생성 에러 메시지 유틸리티
 * HTTP 상태 코드 → 사용자 친화적 한국어 메시지 매핑
 */

/** HTTP 상태 코드별 사용자 친화적 메시지 */
const HTTP_ERROR_MESSAGES: Record<number, string> = {
    400: '❌ 잘못된 요청입니다. 이미지 프롬프트나 설정을 확인해주세요.',
    401: '🔑 API 키가 유효하지 않습니다. 설정 → API 키에서 키를 확인해주세요.',
    403: '🚫 API 접근이 거부되었습니다. API 키 권한 또는 결제 설정을 확인해주세요.',
    429: '⚠️ API 할당량이 초과되었습니다! 할당량을 확인하거나, 다른 이미지 생성 엔진으로 변경해주세요.',
    500: '🔧 이미지 생성 서버에 내부 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
    502: '🌐 서버 게이트웨이 오류입니다. 잠시 후 다시 시도해주세요.',
    503: '🔥 이미지 생성 서버가 과부하 상태입니다! 다른 생성 엔진으로 변경하거나, 잠시 기다렸다가 다시 시도해주세요.',
    504: '⏰ 서버 응답 시간이 초과되었습니다. 네트워크를 확인하고 다시 시도해주세요.',
};

/**
 * 에러 객체에서 HTTP 상태 코드를 추출합니다.
 */
export function extractStatusCode(error: any): number | undefined {
    // axios 스타일: error.response.status
    if (error?.response?.status) return error.response.status;

    // 에러 메시지에서 3자리 숫자 추출 (예: "Request failed with status code 429")
    const msg = error?.message || String(error || '');
    const match = msg.match(/\b(4\d{2}|5\d{2})\b/);
    if (match) return parseInt(match[1], 10);

    return undefined;
}

/**
 * 에러 객체를 분석하여 사용자 친화적 한국어 메시지를 반환합니다.
 *
 * @example
 * try { await generateImage(...); }
 * catch (error) {
 *   const userMsg = getImageErrorMessage(error);
 *   // "⚠️ API 할당량이 초과되었습니다! ..."
 * }
 */
export function getImageErrorMessage(error: any): string {
    const statusCode = extractStatusCode(error);
    const errorMsg = error?.message || String(error || '');

    // 1. HTTP 상태 코드로 매핑
    if (statusCode && HTTP_ERROR_MESSAGES[statusCode]) {
        return HTTP_ERROR_MESSAGES[statusCode];
    }

    // 2. 키워드 기반 매핑 (상태 코드가 없는 경우)
    if (errorMsg.includes('quota') || errorMsg.includes('RESOURCE_EXHAUSTED')) {
        return HTTP_ERROR_MESSAGES[429];
    }
    if (errorMsg.includes('API key') || errorMsg.includes('api_key') || errorMsg.includes('UNAUTHENTICATED')) {
        return HTTP_ERROR_MESSAGES[401];
    }
    if (errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT') || errorMsg.includes('ECONNRESET') || errorMsg.includes('ECONNABORTED')) {
        return '⏰ 연결 시간이 초과되었습니다. 네트워크 상태를 확인해주세요.';
    }
    if (errorMsg.includes('ENOTFOUND') || errorMsg.includes('getaddrinfo')) {
        return '🌐 인터넷 연결을 확인해주세요. 서버에 접속할 수 없습니다.';
    }
    if (errorMsg.includes('SAFETY') || errorMsg.includes('content policy') || errorMsg.includes('blocked')) {
        return '🛡️ 콘텐츠 안전 정책에 의해 이미지가 차단되었습니다. 다른 키워드로 시도해주세요.';
    }

    // 3. 알 수 없는 에러
    return `❌ 이미지 생성 중 오류가 발생했습니다: ${errorMsg.substring(0, 100)}`;
}

/**
 * 에러 객체를 분석하여 사용자 친화적 메시지와 함께 새 Error를 생성합니다.
 */
export function createImageError(error: any, providerName?: string): Error {
    const userMessage = getImageErrorMessage(error);
    const prefix = providerName ? `[${providerName}] ` : '';
    return new Error(`${prefix}${userMessage}`);
}
