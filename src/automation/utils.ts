/**
 * 자동화 유틸리티 함수
 */

import type { Page, Frame, ElementHandle } from 'puppeteer';

/**
 * 랜덤 정수 생성
 */
export function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 랜덤 실수 생성
 */
export function randomFloat(min: number, max: number): number {
    return Math.random() * (max - min) + min;
}

/**
 * 가우시안 분포 기반 타이핑 딜레이 (인간적인 속도)
 */
export function getTypingDelay(): number {
    const mean = 120;
    const stdDev = 50;
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const normal = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    const baseDelay = Math.max(50, Math.min(350, mean + stdDev * normal));

    // 8% 확률로 긴 휴식 추가 (생각하는 듯한 행동)
    if (Math.random() < 0.08) {
        return baseDelay + randomInt(200, 500);
    }
    return baseDelay;
}

/**
 * 인간적인 딜레이
 */
export function humanDelay(min: number, max: number): Promise<void> {
    const delay = randomInt(min, max);
    return new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * 일반 딜레이
 */
export function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 계정 ID 해시 (프로필 폴더명 생성용)
 */
export function hashAccountId(accountId: string): string {
    let hash = 0;
    for (let i = 0; i < accountId.length; i++) {
        const char = accountId.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
}

/**
 * 반복된 Hook 블록 정리
 */
export function stripRepeatedHookBlocks(text: string): string {
    const lines = text.split('\n');
    const seen = new Set<string>();
    const result: string[] = [];
    for (const line of lines) {
        const key = line.trim().toLowerCase();
        if (key.startsWith('🔗') || key.startsWith('👉') || key.startsWith('📎')) {
            if (seen.has(key)) continue;
            seen.add(key);
        }
        result.push(line);
    }
    return result.join('\n');
}

/**
 * 순서형 제목에 줄바꿈 강제 적용
 */
export function enforceOrdinalLineBreaks(text: string): string {
    return text.replace(/(^|\n)\s*(\d+[\.\)]\s*)/g, (match, prefix, ordinal) => {
        return (prefix || '') + '\n' + ordinal;
    });
}

/**
 * 셀렉터 배열에서 요소 찾기
 */
export async function findElement(
    frame: Frame,
    selectors: string[]
): Promise<ElementHandle<Element> | null> {
    for (const selector of selectors) {
        try {
            const element = await frame.$(selector);
            if (element) return element;
        } catch { }
    }
    return null;
}

/**
 * 여러 셀렉터 중 첫 번째로 찾은 요소 반환
 */
export async function waitForAnySelector(
    context: Frame | Page,
    selectors: string[],
    timeout: number = 5000
): Promise<ElementHandle<Element> | null> {
    const perSelectorTimeout = Math.floor(timeout / selectors.length);

    for (const selector of selectors) {
        try {
            const element = await context.waitForSelector(selector, {
                visible: true,
                timeout: perSelectorTimeout
            });
            if (element) return element;
        } catch { }
    }
    return null;
}

/**
 * 소제목 텍스트 정규화
 */
export function normalizeSubtitleText(raw: string): string {
    return raw
        .replace(/^\s*\d+[\.\)]\s*/, '')  // 번호 제거
        .replace(/\*\*/g, '')              // 마크다운 볼드 제거
        .replace(/^\s*#+\s*/, '')          // 마크다운 헤딩 제거
        .trim();
}

/**
 * Puppeteer 오류 메시지 한글화
 */
export function translatePuppeteerError(error: Error): string {
    const msg = (error?.message || '').toLowerCase();

    if (msg.includes('timeout') || msg.includes('timed out')) {
        return '⏳ [시간 초과] 작업 시간이 너무 오래 걸려 중단되었습니다.';
    }
    if (msg.includes('net::err_internet_disconnected') || msg.includes('fetch failed')) {
        return '📡 [연결 끊김] 인터넷 연결이 불안정합니다.';
    }
    if (msg.includes('target closed') || msg.includes('session closed')) {
        return '🚪 [브라우저 종료] 브라우저가 예상치 못하게 닫혔습니다.';
    }
    if (msg.includes('node is not visible') || msg.includes('selector')) {
        return '🔍 [요소 찾기 실패] 네이버 화면 구조가 변경되었거나 로딩이 덜 되었습니다.';
    }
    if (msg.includes('login') || msg.includes('authentication')) {
        return '🔒 [로그인 실패] 네이버 아이디/비밀번호를 확인해주세요.';
    }
    if (msg.includes('navigation') || msg.includes('navigating')) {
        return '🧭 [이동 실패] 페이지 이동 중 문제가 발생했습니다.';
    }

    return `⚠️ [시스템 오류] ${error?.message || '알 수 없는 오류'}`;
}
