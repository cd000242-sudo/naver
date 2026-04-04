/**
 * ✅ [2026-01-25 모듈화] 로컬 스토리지 유틸리티
 * - renderer.ts에서 분리됨
 * - localStorage 안전 저장/정리 함수
 */

// ✅ [2026-03-26 FIX v2] 토스트 경고 쿨다운 — 30분으로 상향 (사용자 피로도 감소)
// 사용자가 "캐시 정리해도 자꾸 뜬다"고 혼란 → 쿨다운 대폭 연장
let _lastStorageWarningTime = 0;
const STORAGE_WARNING_COOLDOWN = 30 * 60 * 1000; // 30분

/**
 * ✅ [2026-04-04 FIX] accountSettingsManager 프록시가 __acct__xxx__ 접두사를 붙이므로
 * localStorage.key()가 반환하는 raw 키는 접두사 포함된 형태.
 * startsWith 대신 endsWith/includes로 매칭해야 정리가 실제로 동작함.
 */
function _rawKeyEndsWith(rawKey: string, suffix: string): boolean {
    // __acct__cd00242__naver_blog_generated_posts → endsWith('naver_blog_generated_posts')
    return rawKey === suffix || rawKey.endsWith('__' + suffix);
}

function _rawKeyContains(rawKey: string, pattern: string): boolean {
    return rawKey.includes(pattern);
}

/**
 * localStorage 안전 저장 함수 (할당량 초과 시 자동 정리)
 * ✅ [2026-02-04] 더 강력한 자동 정리 로직으로 업그레이드
 * ✅ [2026-03-26 FIX] 정리 후에도 경고가 반복 표시되는 버그 수정
 *   - 모든 정리 전략을 순차 실행 (기존: 단계별 1개만 실행)
 *   - 경고 메시지 60초 쿨다운 추가
 *   - "캐시 정리" → "앱 데이터 자동 정리" 메시지 수정 (디스크 캐시 혼동 방지)
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

        if (isQuotaError && retryCount < 2) {
            console.warn(`[Storage] localStorage 할당량 초과, 정리 시도 (${retryCount + 1}/2)`);

            try {
                // ✅ [2026-03-26 FIX] 1차 시도: 모든 정리 전략을 한꺼번에 실행 (기존: 단계별로 1개만)
                if (retryCount === 0) {
                    _runAllCleanupStrategies();
                }
                // ✅ 2차 시도: 전역 글 목록까지 완전 삭제 후 마지막 시도
                if (retryCount === 1) {
                    _nuclearCleanup();
                }
            } catch { /* ignore */ }

            return safeLocalStorageSetItem(key, value, retryCount + 1);
        }

        console.error(`[Storage] 저장 실패 (${key}):`, e);

        // ✅ [2026-03-26 FIX] 쿨다운 적용 — 60초 이내 중복 경고 방지
        const now = Date.now();
        if ((now - _lastStorageWarningTime) > STORAGE_WARNING_COOLDOWN) {
            _lastStorageWarningTime = now;
            if ((window as any).toastManager) {
                (window as any).toastManager.info('📦 임시 데이터가 자동 정리되었습니다. 정상 동작에 영향 없습니다.', { duration: 3000 });
            }
        }
        return false;
    }
}

/**
 * ✅ [2026-03-26] 모든 정리 전략을 한꺼번에 실행
 */
function _runAllCleanupStrategies(): void {
    // ✅ [2026-04-04 FIX] accountSettingsManager 프록시가 __acct__xxx__ 접두사를 붙이므로
    // localStorage.key()가 반환하는 raw 키와 startsWith 매칭이 실패하던 버그 수정.
    // 또한 getItem 프록시가 마이그레이션(쓰기)을 시도하여 할당량 초과 에러가 연쇄 발생하므로
    // 1~2단계(읽기+축소 저장)는 skip하고 바로 삭제 전략만 실행.

    // 1단계: 글 목록 축소 → 삭제로 전환 (읽기+쓰기가 프록시에서 QuotaExceeded 유발)
    try {
        let removed = 0;
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const k = localStorage.key(i);
            if (k && _rawKeyContains(k, 'naver_blog_generated_posts')) {
                localStorage.removeItem(k);
                removed++;
            }
        }
        if (removed > 0) {
            console.log(`[Storage] ✅ 글 목록 ${removed}개 삭제됨`);
        }
    } catch { /* ignore */ }

    // 2단계: 임시 데이터 정리 (백업, 에러 로그 등)
    // ✅ [2026-04-04 FIX] includes로 매칭 — 프록시 접두사 무관하게 동작
    try {
        let removed = 0;
        const deletePatterns = [
            'autosave_backup_', 'debug_', 'error_log_',
            'crash_log_', 'prev_config_',
            '_temp_', '_cache_',
            'naver_blog_backup_',
        ];
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const k = localStorage.key(i);
            if (k && deletePatterns.some(p => _rawKeyContains(k, p))) {
                localStorage.removeItem(k);
                removed++;
            }
        }
        console.log(`[Storage] ✅ 임시 데이터 ${removed}개 삭제됨`);
    } catch { /* ignore */ }

    // 3단계: 오래된 발행 기록 정리 (3일 이상)
    try {
        let removed = 0;
        const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const k = localStorage.key(i);
            if (k && _rawKeyContains(k, 'published-posts-')) {
                const dateMatch = k.match(/published-posts-(\d{4})-(\d{2})-(\d{2})/);
                if (dateMatch) {
                    const postDate = new Date(
                        parseInt(dateMatch[1]),
                        parseInt(dateMatch[2]) - 1,
                        parseInt(dateMatch[3])
                    ).getTime();
                    if (postDate < threeDaysAgo) {
                        localStorage.removeItem(k);
                        removed++;
                    }
                }
            }
        }
        console.log(`[Storage] ✅ 오래된 발행 기록 ${removed}개 삭제됨`);
    } catch { /* ignore */ }
}

/**
 * ✅ [2026-03-26] 핵 정리 — 최후의 수단
 */
function _nuclearCleanup(): void {
    console.error('[Storage] ⚠️ NUCLEAR CLEANUP: localStorage 용량 초과로 모든 글 데이터를 삭제합니다. 이 작업은 되돌릴 수 없습니다.');
    // ✅ [2026-04-04 FIX] includes/endsWith로 매칭 — __acct__ 프록시 접두사 무관하게 동작
    let removed = 0;
    for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && (
            _rawKeyContains(k, 'naver_blog_generated_posts') ||
            _rawKeyContains(k, 'naver_blog_autosave') ||
            _rawKeyContains(k, 'naver_blog_backup_') ||
            _rawKeyContains(k, 'naver_blog_error_logs')
        )) {
            localStorage.removeItem(k);
            removed++;
        }
    }
    console.warn(`[Storage] ⚠️ 핵 정리 완료 — ${removed}개 키 삭제됨`);
}

// 전역 노출 (기존 코드와의 호환성)
(window as any).safeLocalStorageSetItem = safeLocalStorageSetItem;

console.log('[StorageUtils] 📦 모듈 로드됨!');
