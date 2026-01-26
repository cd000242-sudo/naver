/**
 * 🛡️ 에러 복구 유틸리티
 * 
 * 안정성 향상을 위한 재시도 로직 및 셀렉터 폴백 시스템
 */

import type { Frame, Page, ElementHandle } from 'puppeteer';

/**
 * 재시도 가능한 에러 여부 판단
 */
export function isRetryableError(error: Error): boolean {
    const msg = error.message.toLowerCase();
    const retryablePatterns = [
        'timeout',
        'timed out',
        'navigation',
        'net::',
        'detached',
        'target closed',
        'protocol error',
        'session closed',
        'context was destroyed',
        'execution context',
        'frame detached',
    ];
    return retryablePatterns.some(pattern => msg.includes(pattern));
}

/**
 * 치명적 에러 여부 판단 (재시도 불가)
 */
export function isFatalError(error: Error): boolean {
    const msg = error.message.toLowerCase();
    const fatalPatterns = [
        'browser is closed',
        '로그인 실패',
        '계정 정보',
        '잘못된 비밀번호',
        '캡차',
        'captcha',
    ];
    return fatalPatterns.some(pattern => msg.includes(pattern));
}

/**
 * 지수 백오프 딜레이 계산
 */
export function calculateBackoff(attempt: number, baseMs: number = 1000, maxMs: number = 30000): number {
    const exponential = baseMs * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 1000; // 0-1초 랜덤 추가
    return Math.min(exponential + jitter, maxMs);
}

/**
 * 재시도 래퍼 함수
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    options: {
        maxRetries?: number;
        baseDelayMs?: number;
        onRetry?: (error: Error, attempt: number) => void;
        shouldRetry?: (error: Error) => boolean;
    } = {}
): Promise<T> {
    const {
        maxRetries = 3,
        baseDelayMs = 1000,
        onRetry = () => { },
        shouldRetry = isRetryableError,
    } = options;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error as Error;

            if (!shouldRetry(lastError) || isFatalError(lastError) || attempt > maxRetries) {
                throw lastError;
            }

            const delay = calculateBackoff(attempt, baseDelayMs);
            onRetry(lastError, attempt);

            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError;
}

/**
 * 여러 셀렉터 중 하나라도 찾으면 반환
 */
export async function findWithFallback(
    context: Frame | Page,
    selectors: string[],
    options: { timeout?: number; visible?: boolean } = {}
): Promise<ElementHandle | null> {
    const { timeout = 5000, visible = false } = options;

    // 먼저 모든 셀렉터 동시에 시도 (빠른 찾기)
    for (const selector of selectors) {
        try {
            const element = await context.$(selector);
            if (element) {
                if (visible) {
                    const isVisible = await element.evaluate(el => {
                        const style = window.getComputedStyle(el);
                        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
                    }).catch(() => false);
                    if (isVisible) return element;
                } else {
                    return element;
                }
            }
        } catch {
            // 다음 셀렉터 시도
        }
    }

    // 못 찾으면 waitForSelector로 재시도 (타임아웃 분배)
    const perSelectorTimeout = Math.floor(timeout / selectors.length);
    for (const selector of selectors) {
        try {
            const element = await context.waitForSelector(selector, {
                timeout: perSelectorTimeout,
                visible
            });
            if (element) return element;
        } catch {
            // 다음 셀렉터 시도
        }
    }

    return null;
}

/**
 * 클릭 with 재시도
 */
export async function clickWithRetry(
    context: Frame | Page,
    selectors: string[],
    options: { maxRetries?: number; delayBetweenRetries?: number; visible?: boolean } = {}
): Promise<boolean> {
    const { maxRetries = 3, delayBetweenRetries = 500, visible = true } = options;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const element = await findWithFallback(context, selectors, { visible });
        if (element) {
            try {
                await element.click();
                return true;
            } catch (error) {
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, delayBetweenRetries));
                }
            }
        } else if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, delayBetweenRetries));
        }
    }

    return false;
}

/**
 * 타이핑 with 재시도
 */
export async function typeWithRetry(
    context: Frame | Page,
    selectors: string[],
    text: string,
    options: { maxRetries?: number; clearFirst?: boolean; delay?: number } = {}
): Promise<boolean> {
    const { maxRetries = 3, clearFirst = true, delay = 50 } = options;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const element = await findWithFallback(context, selectors);
        if (element) {
            try {
                await element.click();
                if (clearFirst) {
                    await element.evaluate((el: any) => { el.value = ''; });
                }
                await element.type(text, { delay });
                return true;
            } catch (error) {
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
        }
    }

    return false;
}

/**
 * 네비게이션 with 재시도
 */
export async function navigateWithRetry(
    page: Page,
    url: string,
    options: { maxRetries?: number; timeout?: number } = {}
): Promise<boolean> {
    const { maxRetries = 3, timeout = 30000 } = options;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
            return true;
        } catch (error) {
            if (attempt < maxRetries && isRetryableError(error as Error)) {
                const delay = calculateBackoff(attempt);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw error;
            }
        }
    }

    return false;
}

/**
 * 조건 대기 with 재시도
 */
export async function waitForConditionWithRetry(
    fn: () => Promise<boolean>,
    options: { maxAttempts?: number; intervalMs?: number; timeoutMs?: number } = {}
): Promise<boolean> {
    const { maxAttempts = 30, intervalMs = 1000, timeoutMs = 30000 } = options;
    const startTime = Date.now();

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (Date.now() - startTime > timeoutMs) {
            return false;
        }

        try {
            const result = await fn();
            if (result) return true;
        } catch {
            // 조건 함수 실패는 무시하고 재시도
        }

        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    return false;
}
