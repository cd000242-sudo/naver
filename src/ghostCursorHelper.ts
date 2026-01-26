/**
 * 🎯 Ghost Cursor 헬퍼
 * 
 * 사람처럼 자연스러운 마우스 이동을 구현하여 CAPTCHA 방지
 * - 곡선 이동 경로
 * - 랜덤 오버슈트
 * - 가변 속도
 */

import { createCursor } from 'ghost-cursor';
import type { Page, Frame, ElementHandle } from 'puppeteer';

// GhostCursor 타입 정의 (라이브러리에서 export 안됨)
export type GhostCursor = ReturnType<typeof createCursor>;

/**
 * Ghost Cursor 인스턴스 생성
 */
export function createGhostCursor(page: Page): GhostCursor {
    return createCursor(page);
}

/**
 * 랜덤 대기
 */
export function waitRandom(min: number, max: number): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min)) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * 안전한 클릭 (스크롤 + 대기 + Ghost Cursor)
 */
export async function safeClick(
    page: Page,
    cursor: GhostCursor,
    selector: string,
    options: {
        timeout?: number;
        scrollIntoView?: boolean;
        delayBefore?: [number, number];
        delayAfter?: [number, number];
        log?: (msg: string) => void;
    } = {}
): Promise<boolean> {
    const {
        timeout = 5000,
        scrollIntoView = true,
        delayBefore = [500, 1000],
        delayAfter = [200, 500],
        log = console.log,
    } = options;

    try {
        // 요소 대기
        await page.waitForSelector(selector, { timeout, visible: true });

        // 화면 밖 요소 스크롤 처리
        if (scrollIntoView) {
            await page.evaluate((sel) => {
                const element = document.querySelector(sel);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, selector);
        }

        // 클릭 전 랜덤 대기
        await waitRandom(delayBefore[0], delayBefore[1]);

        // Ghost Cursor로 클릭 (자연스러운 곡선 이동)
        await cursor.click(selector);

        // 클릭 후 랜덤 대기
        await waitRandom(delayAfter[0], delayAfter[1]);

        log(`   ✅ Ghost Cursor 클릭 성공: ${selector}`);
        return true;

    } catch (error) {
        log(`   ⚠️ Ghost Cursor 클릭 실패: ${selector} - ${(error as Error).message}`);
        return false;
    }
}

/**
 * Frame 내 요소 안전 클릭
 */
export async function safeClickInFrame(
    page: Page,
    frame: Frame,
    cursor: GhostCursor,
    selector: string,
    options: {
        timeout?: number;
        delayBefore?: [number, number];
        delayAfter?: [number, number];
        lastElement?: boolean; // ✅ 마지막 요소 클릭 옵션 추가
        log?: (msg: string) => void;
    } = {}
): Promise<boolean> {
    const {
        timeout = 5000,
        delayBefore = [500, 1000],
        delayAfter = [200, 500],
        lastElement = false,
        log = console.log,
    } = options;

    try {
        // Frame에서 요소 대기
        await frame.waitForSelector(selector, { timeout, visible: true });

        // ✅ lastElement 옵션: 여러 요소 중 마지막 선택
        let element: ElementHandle | null = null;
        if (lastElement) {
            const elements = await frame.$$(selector);
            if (elements.length > 0) {
                element = elements[elements.length - 1];
                log(`   📍 마지막 요소 선택: ${elements.length}개 중 마지막`);
            }
        } else {
            element = await frame.$(selector);
        }

        if (!element) return false;

        // 스크롤 처리
        await element.evaluate((el) => {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });

        await waitRandom(delayBefore[0], delayBefore[1]);

        // 요소 위치 가져오기
        const box = await element.boundingBox();
        if (!box) {
            log(`   ⚠️ 요소 위치 확인 불가: ${selector}`);
            return false;
        }

        // 요소 중앙으로 커서 이동 후 클릭
        const targetX = box.x + box.width / 2 + (Math.random() - 0.5) * 10;
        const targetY = box.y + box.height / 2 + (Math.random() - 0.5) * 10;

        await cursor.moveTo({ x: targetX, y: targetY });
        await page.mouse.down();
        await waitRandom(50, 150);
        await page.mouse.up();

        await waitRandom(delayAfter[0], delayAfter[1]);

        log(`   ✅ Ghost Cursor (Frame) 클릭 성공: ${selector}`);
        return true;

    } catch (error) {
        log(`   ⚠️ Ghost Cursor (Frame) 클릭 실패: ${selector} - ${(error as Error).message}`);
        return false;
    }
}

/**
 * 안전한 타이핑 (Ghost Cursor 클릭 후 타이핑)
 */
export async function safeType(
    page: Page,
    cursor: GhostCursor,
    selector: string,
    text: string,
    options: {
        timeout?: number;
        typeDelay?: number;
        clearFirst?: boolean;
        log?: (msg: string) => void;
    } = {}
): Promise<boolean> {
    const {
        timeout = 5000,
        typeDelay = 100,
        clearFirst = true,
        log = console.log,
    } = options;

    try {
        // 클릭
        const clicked = await safeClick(page, cursor, selector, { timeout, log });
        if (!clicked) return false;

        // 기존 내용 삭제
        if (clearFirst) {
            await page.keyboard.down('Control');
            await page.keyboard.press('a');
            await page.keyboard.up('Control');
            await waitRandom(100, 300);
            await page.keyboard.press('Backspace');
            await waitRandom(100, 200);
        }

        // 사람처럼 타이핑 (가변 딜레이)
        for (const char of text) {
            const charDelay = typeDelay + Math.floor(Math.random() * 50) - 25;
            await page.keyboard.type(char, { delay: Math.max(30, charDelay) });

            // 5% 확률로 잠시 멈춤 (생각하는 듯한 행동)
            if (Math.random() < 0.05) {
                await waitRandom(200, 500);
            }
        }

        log(`   ✅ Ghost Cursor 타이핑 완료: ${selector}`);
        return true;

    } catch (error) {
        log(`   ⚠️ Ghost Cursor 타이핑 실패: ${selector} - ${(error as Error).message}`);
        return false;
    }
}

/**
 * 랜덤 마우스 이동 (의심 회피용)
 */
export async function randomMouseMovement(
    page: Page,
    cursor: GhostCursor,
    options: { count?: number; areaWidth?: number; areaHeight?: number } = {}
): Promise<void> {
    const { count = 3, areaWidth = 800, areaHeight = 600 } = options;

    for (let i = 0; i < count; i++) {
        const x = Math.floor(Math.random() * areaWidth) + 100;
        const y = Math.floor(Math.random() * areaHeight) + 100;

        await cursor.moveTo({ x, y });
        await waitRandom(100, 500);
    }
}
