/**
 * 셀렉터 레지스트리 타입 정의
 * 네이버 에디터 CSS 셀렉터를 중앙 관리하기 위한 타입 시스템
 */

/** 단일 셀렉터 항목: primary + fallbacks */
export interface SelectorEntry {
  /** 주 셀렉터 */
  readonly primary: string;
  /** 폴백 셀렉터 배열 (우선순위 순) */
  readonly fallbacks: readonly string[];
  /** 용도 설명 */
  readonly description: string;
}

/** 셀렉터 조회 결과 */
export interface SelectorLookupResult {
  /** 성공한 셀렉터 문자열 */
  readonly selector: string;
  /** 몇 번째 폴백인지 (0 = primary) */
  readonly fallbackIndex: number;
  /** 원본 SelectorEntry 키 */
  readonly key: string;
}

/** 셀렉터 실패 보고 */
export interface SelectorFailureReport {
  readonly key: string;
  readonly triedSelectors: readonly string[];
  readonly timestamp: string;
  readonly context: string;
}

/** 셀렉터 맵 타입 (Record<키, SelectorEntry>) */
export type SelectorMap<K extends string = string> = Readonly<Record<K, SelectorEntry>>;
