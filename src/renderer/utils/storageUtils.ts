/**
 * ✅ [2026-01-25 모듈화] 로컬 스토리지 유틸리티
 * - renderer.ts에서 분리됨
 * - localStorage 안전 저장/정리 함수
 */

/**
 * localStorage 안전 저장 함수 (할당량 초과 시 자동 정리)
 * ✅ [2026-02-04] 더 강력한 자동 정리 로직으로 업그레이드
 */
export function safeLocalStorageSetItem(key: string, value: string, retryCount: number = 0): boolean {
    try {
        localStorage.setItem(key, value);
        return true;
    } catch (e: any) {
        const isQuotaError = e?.name === 'QuotaExceededError' ||
            e?.code === 22 ||
            (e?.message && e.message.includes('quota')) ||
            (e?.message && e.message.includes('exceeded'));

        if (isQuotaError && retryCount < 5) {
            console.warn(`[Storage] localStorage 할당량 초과, 정리 시도 (${retryCount + 1}/5)`);

            try {
                // ✅ [2026-02-04] 더 공격적인 정리 전략
                const cleanupStrategies = [
                    // 1단계: 전역 글 목록 정리 (structuredContent, images 제거)
                    () => {
                        const postsKey = 'naver_blog_generated_posts';
                        const postsData = localStorage.getItem(postsKey);
                        if (postsData) {
                            try {
                                const posts = JSON.parse(postsData);
                                if (Array.isArray(posts)) {
                                    // 최근 30개만 유지, 용량 큰 필드 제거
                                    const cleaned = posts.slice(0, 30).map((p: any) => ({
                                        id: p.id,
                                        title: p.title,
                                        categoryName: p.categoryName,
                                        naverId: p.naverId,
                                        hashtags: p.hashtags,
                                        createdAt: p.createdAt,
                                        // structuredContent, images, content 등 대용량 필드 제거
                                    }));
                                    localStorage.setItem(postsKey, JSON.stringify(cleaned));
                                    console.log(`[Storage] ✅ 글 정리: ${posts.length} → ${cleaned.length}개 (대용량 필드 제거)`);
                                    return true;
                                }
                            } catch { /* ignore */ }
                        }
                        return false;
                    },
                    // 2단계: 계정별 글 목록 정리
                    () => {
                        let cleaned = 0;
                        for (let i = localStorage.length - 1; i >= 0; i--) {
                            const k = localStorage.key(i);
                            if (k && k.startsWith('naver_blog_generated_posts_')) {
                                try {
                                    const data = localStorage.getItem(k);
                                    if (data) {
                                        const posts = JSON.parse(data);
                                        if (Array.isArray(posts) && posts.length > 20) {
                                            const reduced = posts.slice(0, 20).map((p: any) => ({
                                                id: p.id,
                                                title: p.title,
                                                categoryName: p.categoryName,
                                                createdAt: p.createdAt,
                                            }));
                                            localStorage.setItem(k, JSON.stringify(reduced));
                                            cleaned++;
                                        }
                                    }
                                } catch { /* ignore */ }
                            }
                        }
                        console.log(`[Storage] ✅ 계정별 글 정리: ${cleaned}개 저장소 최적화됨`);
                        return cleaned > 0;
                    },
                    // 3단계: 임시 데이터 정리 (백업, 에러 로그 등)
                    // ✅ [2026-03-24 FIX] 'log_' 패턴이 'blog_*' 키를 오삭제하는 치명적 버그 수정
                    // 기존: k.includes('log_') → 'blog_settings' 삭제됨!
                    // 수정: 접두사 매칭 + 세분화된 패턴으로 안전하게 변경
                    () => {
                        let removed = 0;
                        const deletePrefixes = [
                            'autosave_backup_', 'debug_', 'error_log_',
                            'crash_log_', 'prev_config_'
                        ];
                        const deleteInfixes = [
                            '_temp_', '_cache_'
                        ];
                        for (let i = localStorage.length - 1; i >= 0; i--) {
                            const k = localStorage.key(i);
                            if (k && (
                                deletePrefixes.some(p => k.startsWith(p)) ||
                                deleteInfixes.some(p => k.includes(p))
                            )) {
                                localStorage.removeItem(k);
                                removed++;
                            }
                        }
                        console.log(`[Storage] ✅ 임시 데이터 ${removed}개 삭제됨`);
                        return removed > 0;
                    },
                    // 4단계: 오래된 발행 기록 정리 (7일 이상)
                    () => {
                        let removed = 0;
                        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
                        for (let i = localStorage.length - 1; i >= 0; i--) {
                            const k = localStorage.key(i);
                            if (k && k.startsWith('published-posts-')) {
                                // 날짜 형식: published-posts-YYYY-MM-DD
                                const dateMatch = k.match(/published-posts-(\d{4})-(\d{2})-(\d{2})/);
                                if (dateMatch) {
                                    const postDate = new Date(
                                        parseInt(dateMatch[1]),
                                        parseInt(dateMatch[2]) - 1,
                                        parseInt(dateMatch[3])
                                    ).getTime();
                                    if (postDate < sevenDaysAgo) {
                                        localStorage.removeItem(k);
                                        removed++;
                                    }
                                }
                            }
                        }
                        console.log(`[Storage] ✅ 오래된 발행 기록 ${removed}개 삭제됨`);
                        return removed > 0;
                    },
                    // 5단계: 최후의 수단 - 전역 글 목록 완전 삭제
                    () => {
                        localStorage.removeItem('naver_blog_generated_posts');
                        console.warn(`[Storage] ⚠️ 전역 글 목록 완전 삭제됨 (최후의 수단)`);
                        return true;
                    }
                ];

                // 현재 단계에 해당하는 전략 실행
                if (retryCount < cleanupStrategies.length) {
                    cleanupStrategies[retryCount]();
                }
            } catch { /* ignore */ }

            return safeLocalStorageSetItem(key, value, retryCount + 1);
        }

        console.error(`[Storage] 저장 실패 (${key}):`, e);
        if ((window as any).toastManager) {
            (window as any).toastManager.error('⚠️ 저장 공간 부족! 환경설정에서 "캐시 정리" 버튼을 눌러주세요.');
        }
        return false;
    }
}

// 전역 노출 (기존 코드와의 호환성)
(window as any).safeLocalStorageSetItem = safeLocalStorageSetItem;

console.log('[StorageUtils] 📦 모듈 로드됨!');
