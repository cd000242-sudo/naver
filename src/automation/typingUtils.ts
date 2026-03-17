/**
 * 자동화 공유 타이핑 유틸리티
 * naverBlogAutomation.ts에서 추출된 top-level 유틸 함수들
 */
import { Page } from 'puppeteer';

// ✅ 쇼핑커넥트 모드 전용 강력한 후킹 메시지 (구매 전환 극대화)
export const SHOPPING_HOOKS = [
    '⚡️ 품절 임박! 지금 아니면 구매하기 어려워요.',
    '🔥 역대급 최저가 할인 중! 놓치면 후회합니다.',
    '🎁 오늘만 이 가격! 한정 수량으로 진행됩니다.',
    '🏠 삶의 질을 바꿔줄 완벽한 아이템, 지금 확인해보세요.',
    '✨ 수많은 실사용 후기가 증명하는 바로 그 제품!',
    '🚀 누적 판매 1위! 가장 핫한 아이템을 만나보세요.',
];

// ✅ [Smart Typing] 핵심 키워드 자동 추출 함수
// ✅ 가독성 개선: 섹션당 1개의 가장 중요한 핵심 키워드만 추출 (너무 많은 밑줄 방지)
export function extractCoreKeywords(text: string): string[] {
    const words = text.replace(/[.,?!""''()]/g, "").split(/\s+/);
    const wordMap: Record<string, number> = {};

    words.forEach(word => {
        if (word.length >= 2) {
            wordMap[word] = (wordMap[word] || 0) + 1;
        }
    });

    const sortedWords = Object.keys(wordMap).sort((a, b) => {
        const scoreA = wordMap[a] * 2 + a.length;
        const scoreB = wordMap[b] * 2 + b.length;
        return scoreB - scoreA;
    });

    // ✅ 가독성 개선: 상위 1개 키워드만 반환 (너무 많은 하이라이트는 오히려 가독성 저하)
    return sortedWords.slice(0, 1);
}

// ✅ [2026-02-24] 네이버 에디터 자동완성 팝업(파파고/내돈내산 스티커) 방지 래퍼
// page.keyboard.type()으로 한 글자씩 타이핑하면 네이버 스마트 에디터가
// 특정 단어 패턴을 감지하여 자동완성 팝업을 표시 → Escape으로 즉시 닫기
export async function safeKeyboardType(
    page: Page,
    text: string,
    options?: { delay?: number }
): Promise<void> {
    await page.keyboard.type(text, options);
    await page.keyboard.press('Escape').catch(() => { });
}
