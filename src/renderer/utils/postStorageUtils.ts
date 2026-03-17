/**
 * ✅ [2026-01-25 모듈화] 발행 글 저장소 유틸리티
 * 
 * 발행된 글, 생성된 글 저장/로드 관련 함수들
 */

// ============================================
// 상수
// ============================================

export const GENERATED_POSTS_KEY = 'naver_blog_generated_posts';
export const POSTS_MIGRATION_DONE_KEY = 'naver_blog_posts_migration_v2_done';

// ============================================
// 발행된 글 관리 (날짜별)
// ============================================

/**
 * 날짜별 발행 글 저장소 키 생성
 */
export function getPublishedPostsKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `published-posts-${year}-${month}-${day}`;
}

/**
 * 발행된 글 목록 로드
 */
export function loadPublishedPosts(date: Date): Array<{ title: string; url: string; time: string }> {
    try {
        const key = getPublishedPostsKey(date);
        const postsJson = localStorage.getItem(key);
        return postsJson ? JSON.parse(postsJson) : [];
    } catch (error) {
        console.error('발행 글 로드 실패:', error);
        return [];
    }
}

/**
 * 발행된 글 저장
 */
export function savePublishedPost(date: Date, title: string, url: string): void {
    try {
        const key = getPublishedPostsKey(date);
        const existingPosts = loadPublishedPosts(date);
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        existingPosts.push({ title, url, time: timeStr });
        localStorage.setItem(key, JSON.stringify(existingPosts));
    } catch (error) {
        console.error('발행 글 저장 실패:', error);
    }
}

// ============================================
// 계정별 저장소 관리
// ============================================

/**
 * 계정별 저장소 키 생성
 */
export function getPostsStorageKey(naverId: string): string {
    const normalizedId = (naverId || '').trim().toLowerCase();
    if (!normalizedId) return GENERATED_POSTS_KEY; // 폴백: 전역 저장소
    return `naver_blog_generated_posts_${normalizedId}`;
}

/**
 * 현재 선택된 계정 ID 가져오기
 */
export function getCurrentNaverId(): string {
    // ✅ [2026-03-10 CLEANUP] active_account_id/app_config dead read 제거
    // 이 두 키는 코드베이스 전체에서 setItem이 없어 항상 null이었음

    // 1순위: 로그인 폼의 naverId 입력란
    const naverIdInput = document.getElementById('naver-id') as HTMLInputElement;
    if (naverIdInput?.value) return naverIdInput.value.trim().toLowerCase();

    return ''; // 계정 정보 없음
}
