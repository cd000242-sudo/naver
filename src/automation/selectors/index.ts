/**
 * 셀렉터 중앙 레지스트리 — 단일 진입점
 *
 * 사용법:
 *   import { SELECTORS, findElement, waitForElement } from '../selectors';
 *   const el = await findElement(page, SELECTORS.login.idInput, 'idInput');
 */

// --- 타입 ---
export type { SelectorEntry, SelectorMap, SelectorLookupResult, SelectorFailureReport } from './types';

// --- 셀렉터 맵 ---
export { LOGIN_SELECTORS } from './loginSelectors';
export type { LoginSelectorKey } from './loginSelectors';

export { EDITOR_SELECTORS } from './editorSelectors';
export type { EditorSelectorKey } from './editorSelectors';

export { PUBLISH_SELECTORS } from './publishSelectors';
export type { PublishSelectorKey } from './publishSelectors';

export { IMAGE_SELECTORS } from './imageSelectors';
export type { ImageSelectorKey } from './imageSelectors';

export { CTA_SELECTORS } from './ctaSelectors';
export type { CtaSelectorKey } from './ctaSelectors';

export { PLACE_SELECTORS } from './placeSelectors';
export type { PlaceSelectorKey } from './placeSelectors';

// SPEC-IMAGE-RECOVERY-001 R4: Google Flow multi-fallback selectors
export { FLOW_SELECTORS, iterateFlowSelectors } from './flowSelectors';
export type { FlowSelectorKey } from './flowSelectors';

// SPEC-CONVERSION-001 L2-2.2: 네이버쇼핑 경쟁 제품 수집
export { SHOPPING_COMPETITOR_SELECTORS } from './shoppingCompetitorSelectors';
export type { ShoppingCompetitorSelectorKey } from './shoppingCompetitorSelectors';

// SPEC-CONVERSION-001 L2-4.2: 네이버 블로그 검색 상위 글
export { TOP_BLOGGER_SELECTORS } from './topBloggerSelectors';
export type { TopBloggerSelectorKey } from './topBloggerSelectors';

// --- 유틸리티 ---
export {
  findElement,
  findAllElements,
  waitForElement,
  getAllSelectors,
  getSelectorStrings,
  findElementWithInfo,
  getFailureReports,
  clearFailureReports,
} from './selectorUtils';

// --- 통합 네임스페이스 (편의용) ---
import { LOGIN_SELECTORS } from './loginSelectors';
import { EDITOR_SELECTORS } from './editorSelectors';
import { PUBLISH_SELECTORS } from './publishSelectors';
import { IMAGE_SELECTORS } from './imageSelectors';
import { CTA_SELECTORS } from './ctaSelectors';
import { PLACE_SELECTORS } from './placeSelectors';
import { SHOPPING_COMPETITOR_SELECTORS } from './shoppingCompetitorSelectors';
import { TOP_BLOGGER_SELECTORS } from './topBloggerSelectors';

/**
 * 모든 셀렉터를 카테고리별로 접근할 수 있는 통합 객체
 *
 * @example
 *   import { SELECTORS } from '../selectors';
 *   await findElement(page, SELECTORS.login.idInput, 'idInput');
 *   await findElement(frame, SELECTORS.editor.bodyText, 'bodyText');
 */
export const SELECTORS = {
  login: LOGIN_SELECTORS,
  editor: EDITOR_SELECTORS,
  publish: PUBLISH_SELECTORS,
  image: IMAGE_SELECTORS,
  cta: CTA_SELECTORS,
  place: PLACE_SELECTORS,
  shoppingCompetitor: SHOPPING_COMPETITOR_SELECTORS,
  topBlogger: TOP_BLOGGER_SELECTORS,
} as const;
