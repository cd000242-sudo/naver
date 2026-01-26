/**
 * ✅ [2026-01-25 모듈화] 제목 처리 유틸리티
 * 
 * 키워드 접두사, 중복 제거 등 제목 관련 순수 함수들
 */

// ============================================
// 키워드 접두사 적용 (중복 토큰 제거)
// ============================================

/**
 * 제목에 키워드 접두사를 적용하면서 중복된 토큰을 제거합니다.
 * 
 * @param title - 원본 제목
 * @param keyword - 적용할 키워드
 * @returns 키워드가 접두사로 붙은 제목 (중복 토큰 제거됨)
 * 
 * @example
 * applyKeywordPrefixToTitle("다이어트 성공 비법", "다이어트")
 * // => "다이어트 성공 비법" (이미 포함된 경우)
 * 
 * applyKeywordPrefixToTitle("성공 비법 총정리", "다이어트")
 * // => "다이어트 성공 비법 총정리"
 */
export function applyKeywordPrefixToTitle(title: string, keyword: string): string {
    const cleanKeyword = (keyword || '').trim();
    if (!cleanKeyword) return (title || '').trim();

    const cleanTitle = (title || '').trim();
    if (!cleanTitle) return cleanKeyword;

    const tokens = cleanKeyword
        .split(/\s+/)
        .map((t) => String(t || '').trim())
        .filter(Boolean);

    const isBoundary = (ch: string) => /[\s\-–—:|·•.,!?()\[\]{}]/.test(ch);

    // ✅ 이미 제목이 키워드로 시작하는 경우에도, 뒤에 바로 이어지는 중복 토큰(붙여쓰기/순서 변형)을 제거
    let rest = cleanTitle;
    if (rest.startsWith(cleanKeyword)) {
        rest = rest.slice(cleanKeyword.length);
    }
    rest = rest.replace(/^[\s\-–—:|·•.,!?]+/, '').trim();
    let remaining = tokens.slice();
    let progressed = true;
    while (progressed && remaining.length > 0) {
        progressed = false;
        rest = rest.replace(/^[\s\-–—:|·•.,!?]+/, '');

        for (let i = 0; i < remaining.length; i++) {
            const tok = remaining[i];
            if (!tok) continue;
            if (!rest.startsWith(tok)) continue;

            const next = rest.charAt(tok.length);
            const remainderStr = rest.slice(tok.length);
            const nextMatchesAnother = remaining.some((t, j) => j !== i && t && remainderStr.startsWith(t));

            if (!next || isBoundary(next) || nextMatchesAnother) {
                rest = remainderStr.replace(/^[\s\-–—:|·•.,!?]+/, '');
                remaining.splice(i, 1);
                progressed = true;
                break;
            }
        }
    }

    rest = rest.replace(/^[\s\-–—:|·•.,!?]+/, '').trim();
    return rest ? `${cleanKeyword} ${rest}`.replace(/\s+/g, ' ').trim() : cleanKeyword;
}
