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
//
// ✅ [2026-05-26 v2.10.372 SPEC-NAVER-PROTECTION-2026 P5 행동 패턴]
//   기존: page.keyboard.type(text, { delay: 5 }) → 고정 delay 봇 시그니처
//   수정: options.delay를 base로 ±50% jitter + 5% pause (mean 유지 → 발행 시간 영향 0)
//   options.delay 없거나 0이면 기존 즉시 타이핑 그대로 (성능 보존)
export async function safeKeyboardType(
    page: Page,
    text: string,
    options?: { delay?: number }
): Promise<void> {
    const baseDelay = options?.delay ?? 0;
    if (baseDelay > 0) {
        // 가변 jitter — base * (0.5 ~ 1.5) + 5% 확률 추가 pause
        const chars = Array.from(text); // surrogate-pair safe
        for (let i = 0; i < chars.length; i++) {
            await page.keyboard.type(chars[i]);
            if (i < chars.length - 1) {
                const jittered = Math.max(1, Math.round(baseDelay * (0.5 + Math.random())));
                const finalDelay = Math.random() < 0.05
                    ? jittered + Math.round(50 + Math.random() * 150)
                    : jittered;
                await new Promise(r => setTimeout(r, finalDelay));
            }
        }
    } else {
        // 즉시 타이핑 (기존 동작 — delay 명시 없을 때)
        await page.keyboard.type(text);
    }
    await page.keyboard.press('Escape').catch(() => { });
}

// ✅ [2026-05-23 A3] Human typing profile — "fast-human" preset.
// Bot detection keys on the *uniformity* of inter-keystroke intervals, not raw
// speed. A fixed 20ms delay is a robotic signature; a gaussian spread with
// occasional pauses defeats it while keeping bulk-publish throughput.
// Effective mean ≈ 40ms (base mean + pause contribution).
const HUMAN_TYPING_PROFILE = {
    meanMs: 34,
    stdDevMs: 22,
    minMs: 10,
    maxMs: 120,
    pauseChance: 0.05,
    pauseMinMs: 150,
    pauseMaxMs: 300,
} as const;

/**
 * Returns a single human-like inter-keystroke delay (ms).
 * Box-Muller gaussian around the profile mean, clamped to [min, max],
 * with a small chance of a longer "thinking" pause.
 */
export function humanInterKeyDelay(): number {
    const p = HUMAN_TYPING_PROFILE;
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const normal = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    let delay = p.meanMs + p.stdDevMs * normal;
    delay = Math.max(p.minMs, Math.min(p.maxMs, delay));
    if (Math.random() < p.pauseChance) {
        delay += p.pauseMinMs + Math.random() * (p.pauseMaxMs - p.pauseMinMs);
    }
    return Math.round(delay);
}

/**
 * ✅ [2026-05-23 A3] Korean-safe human typing.
 * Types char-by-char with a gaussian inter-key delay instead of the robotic
 * fixed-interval `page.keyboard.type(text, { delay })`. Iterating with
 * `keyboard.type(char)` keeps Hangul composition intact (Puppeteer routes
 * non-ASCII through `sendCharacter`), unlike `keyboard.down/up` which only
 * accepts ASCII KeyInput names.
 */
export async function humanKeyboardType(
    page: Page,
    text: string
): Promise<void> {
    if (!text) {
        return;
    }
    const chars = Array.from(text); // surrogate-pair safe
    for (let i = 0; i < chars.length; i++) {
        await page.keyboard.type(chars[i]);
        if (i < chars.length - 1) {
            await new Promise(r => setTimeout(r, humanInterKeyDelay()));
        }
    }
    // 자동완성 팝업(파파고/내돈내산 스티커) 방지
    await page.keyboard.press('Escape').catch(() => { });
}
