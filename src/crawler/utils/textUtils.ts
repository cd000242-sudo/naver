import { TEXT_SELECTORS } from '../config/selectors.js';

/**
 * HTML에서 불필요한 요소를 제거합니다.
 */
export function removeGarbageElements(doc: Document): void {
    TEXT_SELECTORS.GARBAGE.forEach(selector => {
        doc.querySelectorAll(selector).forEach(el => el.remove());
    });
}

/**
 * 텍스트에서 불필요한 공백과 특수문자를 정리합니다.
 */
export function cleanText(text: string): string {
    if (!text) return '';

    return text
        .replace(/[\r\n]+/g, '\n')           // 여러 줄바꿈을 하나로
        .replace(/[ \t]+/g, ' ')             // 여러 공백을 하나로
        .replace(/\n\s*\n/g, '\n\n')         // 빈 줄 정리
        .replace(/^\s+|\s+$/gm, '')          // 각 줄 앞뒤 공백 제거
        .trim();
}

/**
 * HTML 태그를 제거하고 텍스트만 추출합니다.
 */
export function stripHtmlTags(html: string): string {
    if (!html) return '';

    return html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

/**
 * 본문 텍스트를 추출합니다.
 */
export function extractContent(doc: Document): string {
    removeGarbageElements(doc);

    for (const selector of TEXT_SELECTORS.CONTENT) {
        const el = doc.querySelector(selector);
        if (el && el.textContent && el.textContent.trim().length > 50) {
            return cleanText(el.textContent);
        }
    }

    // 폴백: body 전체
    return cleanText(doc.body?.textContent || '');
}
