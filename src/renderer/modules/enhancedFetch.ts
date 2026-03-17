// ═══════════════════════════════════════════════════════════════════
// ✅ [2026-02-26 모듈화] 향상된 fetch 래퍼 모듈
// renderer.ts에서 추출 — 재시도 + 지수 백오프 + 지터
// ═══════════════════════════════════════════════════════════════════

/**
 * 향상된 fetch 래퍼 (재시도 로직 강화)
 * - 90초 타임아웃
 * - 5xx/429 오류 시 자동 재시도 (최대 7회)
 * - 지수 백오프 + 랜덤 지터
 */
export async function enhancedFetch(url: string, options: RequestInit = {}, retries: number = 7): Promise<Response> {
    // 전역 로거/토스트 참조
    const appendLog = typeof (window as any).appendLog === 'function'
        ? (window as any).appendLog
        : (..._args: any[]) => { };
    const toastManager = (window as any).toastManager || { warning: () => { } };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            console.log(`[Fetch] ${url} 요청 시도 ${attempt + 1}/${retries + 1}`);

            // ✅ 타임아웃 설정 (90초)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 90000);

            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
                headers: {
                    ...options.headers,
                    'Connection': 'keep-alive',
                    'Keep-Alive': 'timeout=90, max=100'
                }
            });

            clearTimeout(timeoutId);

            // ✅ 5xx 서버 오류는 재시도, 4xx 클라이언트 오류는 즉시 반환
            if (!response.ok) {
                const isServerError = response.status >= 500 && response.status < 600;
                const isRateLimit = response.status === 429;

                if ((isServerError || isRateLimit) && attempt < retries) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
            }

            console.log(`[Fetch] ${url} 요청 성공`);
            return response;

        } catch (error: any) {
            lastError = error;
            console.warn(`[Fetch] ${url} 시도 ${attempt + 1} 실패:`, error.message);

            if (attempt < retries) {
                // ✅ 지수 백오프 + 지터 (랜덤 지연 추가로 동시 요청 충돌 방지)
                const baseDelay = 2000 * Math.pow(2, Math.min(attempt, 4)); // 최대 32초
                const jitter = Math.random() * 1000; // 0~1초 랜덤 지연
                const delay = baseDelay + jitter;

                console.log(`[Fetch] ${Math.round(delay)}ms 후 재시도...`);
                appendLog(`⚠️ 서버 연결 재시도 중... (${attempt + 1}/${retries}) - ${Math.round(delay / 1000)}초 대기`);
                toastManager.warning(`⚠️ 서버 연결 재시도 중... (${attempt + 1}/${retries})`, 2000);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                appendLog(`❌ 네트워크 오류: 모든 재시도 실패 (${retries + 1}회 시도)`);
                throw lastError || new Error('모든 재시도 실패');
            }
        }
    }

    throw lastError || new Error('모든 재시도 실패');
}
