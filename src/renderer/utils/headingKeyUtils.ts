/**
 * ✅ [2026-01-25 모듈화] 소제목 키 및 파일 URL 유틸리티
 * - renderer.ts에서 분리됨
 */

/**
 * 로컬 파일 경로를 file:// URL로 변환
 * 이미 URL 형식이면 그대로 반환
 */
export function toFileUrlMaybe(p: string): string {
    const raw = String(p || '').trim();
    if (!raw) return '';
    if (/^(https?:\/\/|data:|blob:|file:\/\/)/i.test(raw)) return raw;
    const normalized = raw.replace(/\\/g, '/');
    // UNC 경로(\\server\share\file) 대응
    if (normalized.startsWith('//')) {
        const unc = normalized.replace(/\/+/, '//');
        // 한글 경로 지원을 위해 encodeURI 대신 최소한의 인코딩만 수행
        return `file:${unc.replace(/#/g, '%23').replace(/\?/g, '%3F')}`;
    }
    const trimmed = normalized.replace(/^\/+/, '');
    // ✅ [수정] 한글 경로가 깨지지 않도록 최소한의 특수문자만 인코딩
    // Electron은 UTF-8 경로를 네이티브로 지원하므로 encodeURIComponent 사용 시 오히려 문제 발생
    const encoded = trimmed
        .replace(/#/g, '%23')   // # (fragment identifier)
        .replace(/\?/g, '%3F'); // ? (query string)
    return `file:///${encoded}`;
}

/**
 * 소제목 제목을 정규화하여 캐시 키로 사용
 * - Markdown 해시(#) 제거
 * - 공백 정규화
 */
export function normalizeHeadingKeyForVideoCache(title: string): string {
    return String(title || '')
        .trim()
        .replace(/^#+\s*/, '') // Markdown 해시 (#) 제거
        .replace(/[\s\u00A0]+/g, ' '); // 공백 정규화
}

// 전역 노출 (하위 호환성)
(window as any).toFileUrlMaybe = toFileUrlMaybe;
(window as any).normalizeHeadingKeyForVideoCache = normalizeHeadingKeyForVideoCache;

console.log('[HeadingKeyUtils] 📦 모듈 로드됨!');
