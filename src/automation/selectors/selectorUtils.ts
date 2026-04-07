/**
 * 셀렉터 레지스트리 유틸리티
 * SelectorEntry를 사용하여 DOM 요소를 찾는 헬퍼 함수들
 */
import type { SelectorEntry, SelectorLookupResult, SelectorFailureReport } from './types';
import type { Page, Frame, ElementHandle } from 'puppeteer';

/** 실패 보고 수집기 (모니터링용) */
const failureReports: SelectorFailureReport[] = [];
const MAX_FAILURE_REPORTS = 100;

/**
 * SelectorEntry에서 모든 셀렉터를 순서대로 반환
 */
export function getAllSelectors(entry: SelectorEntry): readonly string[] {
  return [entry.primary, ...entry.fallbacks];
}

/**
 * Page 또는 Frame에서 SelectorEntry 기반으로 요소를 찾는다.
 * primary → fallbacks 순서로 시도하며, 첫 번째 성공한 셀렉터의 결과를 반환.
 */
export async function findElement(
  context: Page | Frame,
  entry: SelectorEntry,
  key: string = 'unknown',
): Promise<ElementHandle | null> {
  const selectors = getAllSelectors(entry);

  for (let i = 0; i < selectors.length; i++) {
    try {
      const el = await context.$(selectors[i]);
      if (el) {
        if (i > 0) {
          console.log(`[Selector] "${key}" — primary 실패, fallback #${i} 성공: ${selectors[i]}`);
        }
        return el;
      }
    } catch {
      // 셀렉터 구문 오류 등 — 다음 폴백으로
    }
  }

  reportFailure(key, selectors, 'findElement');
  return null;
}

/**
 * Page 또는 Frame에서 SelectorEntry 기반으로 여러 요소를 찾는다 (querySelectorAll).
 */
export async function findAllElements(
  context: Page | Frame,
  entry: SelectorEntry,
  key: string = 'unknown',
): Promise<ElementHandle[]> {
  const selectors = getAllSelectors(entry);

  for (let i = 0; i < selectors.length; i++) {
    try {
      const els = await context.$$(selectors[i]);
      if (els.length > 0) {
        if (i > 0) {
          console.log(`[Selector] "${key}" — primary 실패, fallback #${i} 성공: ${selectors[i]}`);
        }
        return els;
      }
    } catch {
      // 다음 폴백으로
    }
  }

  reportFailure(key, selectors, 'findAllElements');
  return [];
}

/**
 * waitForSelector + SelectorEntry 기반.
 * 모든 셀렉터를 Promise.race로 병렬 대기하여 가장 먼저 나타나는 요소를 반환.
 */
export async function waitForElement(
  context: Page | Frame,
  entry: SelectorEntry,
  key: string = 'unknown',
  options: { timeout?: number; visible?: boolean } = {},
): Promise<ElementHandle | null> {
  const { timeout = 10000, visible = false } = options;
  const selectors = getAllSelectors(entry);

  // 먼저 이미 존재하는지 빠르게 체크
  for (const sel of selectors) {
    try {
      const el = await context.$(sel);
      if (el) return el;
    } catch {
      // skip
    }
  }

  // 없으면 race로 대기
  const promises = selectors.map((sel, i) =>
    context
      .waitForSelector(sel, { timeout, visible })
      .then((el) => {
        if (el && i > 0) {
          console.log(`[Selector] "${key}" — waitFor fallback #${i} 성공: ${sel}`);
        }
        return el;
      })
      .catch(() => null),
  );

  const results = await Promise.allSettled(promises);
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      return result.value;
    }
  }

  reportFailure(key, selectors, 'waitForElement');
  return null;
}

/**
 * evaluate 내부에서 사용할 셀렉터 문자열 배열을 반환.
 * (Puppeteer evaluate에서는 ElementHandle을 직접 전달할 수 없으므로)
 */
export function getSelectorStrings(entry: SelectorEntry): string[] {
  return [entry.primary, ...entry.fallbacks];
}

/**
 * 성공한 셀렉터 정보를 반환하는 findElement 변형
 */
export async function findElementWithInfo(
  context: Page | Frame,
  entry: SelectorEntry,
  key: string = 'unknown',
): Promise<SelectorLookupResult | null> {
  const selectors = getAllSelectors(entry);

  for (let i = 0; i < selectors.length; i++) {
    try {
      const el = await context.$(selectors[i]);
      if (el) {
        return { selector: selectors[i], fallbackIndex: i, key };
      }
    } catch {
      // skip
    }
  }

  return null;
}

/**
 * 셀렉터 실패 보고 기록
 */
function reportFailure(key: string, triedSelectors: readonly string[], context: string): void {
  const report: SelectorFailureReport = {
    key,
    triedSelectors,
    timestamp: new Date().toISOString(),
    context,
  };

  failureReports.push(report);

  // 오래된 보고 제거
  if (failureReports.length > MAX_FAILURE_REPORTS) {
    failureReports.splice(0, failureReports.length - MAX_FAILURE_REPORTS);
  }

  console.warn(`[Selector] ⚠️ "${key}" — 모든 셀렉터 실패 (${context}): ${triedSelectors.join(', ')}`);
}

/**
 * 수집된 실패 보고 조회 (모니터링 대시보드용)
 */
export function getFailureReports(): readonly SelectorFailureReport[] {
  return [...failureReports];
}

/**
 * 실패 보고 초기화
 */
export function clearFailureReports(): void {
  failureReports.length = 0;
}
