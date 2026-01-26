/**
 * ✅ [2026-01-25 모듈화] 로컬 스토리지 유틸리티
 * - renderer.ts에서 분리됨
 * - localStorage 안전 저장/정리 함수
 */

/**
 * localStorage 안전 저장 함수 (할당량 초과 시 자동 정리)
 */
export function safeLocalStorageSetItem(key: string, value: string, retryCount: number = 0): boolean {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (e: any) {
        const isQuotaError = e?.name === 'QuotaExceededError' ||
            e?.code === 22 ||
            (e?.message && e.message.includes('quota'));

        if (isQuotaError && retryCount < 3) {
            console.warn(`[Storage] localStorage 할당량 초과, 정리 시도 (${retryCount + 1}/3)`);

            // 오래된 글 정리
            try {
                const postsKey = 'naver_blog_generated_posts';
                const postsData = localStorage.getItem(postsKey);
                if (postsData) {
                    const posts = JSON.parse(postsData);
                    if (Array.isArray(posts) && posts.length > 30) {
                        // structuredContent 제거하여 용량 줄이기
                        const cleaned = posts.slice(0, 50).map((p: any) => ({
                            ...p,
                            structuredContent: undefined
                        }));
                        localStorage.setItem(postsKey, JSON.stringify(cleaned));
                        console.log(`[Storage] 글 정리: ${posts.length} → ${cleaned.length}개`);
                    }
                }

                // 오래된 백업 정리
                for (let i = localStorage.length - 1; i >= 0; i--) {
                    const k = localStorage.key(i);
                    if (k && (k.startsWith('autosave_backup_') || k === 'lastError')) {
                        localStorage.removeItem(k);
                    }
                }
            } catch { /* ignore */ }

            return safeLocalStorageSetItem(key, value, retryCount + 1);
        }

        console.error(`[Storage] 저장 실패 (${key}):`, e);
        if ((window as any).toastManager) {
            (window as any).toastManager.error('⚠️ 저장 공간 부족! 오래된 글을 삭제해주세요.');
        }
        return false;
    }
}

// 전역 노출 (기존 코드와의 호환성)
(window as any).safeLocalStorageSetItem = safeLocalStorageSetItem;

console.log('[StorageUtils] 📦 모듈 로드됨!');
