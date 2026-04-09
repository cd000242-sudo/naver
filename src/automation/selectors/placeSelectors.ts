/**
 * 네이버 블로그 에디터 "장소(지도)" 관련 셀렉터
 *
 * 캡처: scripts/auto-capture-naver-place.js + scripts/probe-map-block.js (2026-04-09)
 *
 * 흐름:
 *   1) toolbar 장소 버튼 클릭 → 팝업 열림
 *   2) 검색창에 업체명 입력 → Enter (또는 검색 버튼)
 *   3) 결과 리스트에서 카드 클릭 (.se-is-highlight 부여됨)
 *   4) 카드 안 "추가" 버튼 클릭 (.se-place-add-button-attached 부여됨)
 *   5) 팝업 하단 "확인" 버튼 클릭 → 본문에 .se-component.se-placesMap 삽입
 */
import type { SelectorEntry, SelectorMap } from './types';

export type PlaceSelectorKey =
  | 'toolbarPlaceButton'
  | 'placePopup'
  | 'placeSearchInput'
  | 'placeSearchButton'
  | 'placeResultList'
  | 'placeResultItem'
  | 'placeResultItemHighlighted'
  | 'placeAddButton'
  | 'placeAddButtonAttached'
  | 'placeConfirmButton'
  | 'placePopupCloseButton'
  | 'insertedPlaceMapBlock'
  | 'insertedPlaceMapTitle'
  | 'insertedPlaceMapAddress'
  | 'insertedPlaceMapImage';

const entry = (
  primary: string,
  fallbacks: readonly string[],
  description: string,
): SelectorEntry => ({ primary, fallbacks, description });

export const PLACE_SELECTORS: SelectorMap<PlaceSelectorKey> = {
  // 1단계: 툴바의 장소 버튼
  toolbarPlaceButton: entry(
    'button[data-name="map"]',
    [
      'button.se-map-toolbar-button',
      'li.se-toolbar-item-map > button',
      'button[data-log="dot.map"]',
      'button[aria-label*="장소"]',
    ],
    '에디터 툴바 — 장소(지도) 버튼',
  ),

  // 2단계: 장소 팝업 컨테이너
  placePopup: entry(
    '.se-popup-placesMap',
    ['.se-popup.__se-sentry.se-popup-placesMap', '.se-insert-place'],
    '장소 검색 팝업',
  ),

  // 3단계: 검색 입력
  placeSearchInput: entry(
    'input[placeholder*="장소"]',
    [
      '.se-place-search-keyword input',
      '.react-autosuggest__input',
      'input[placeholder="장소명을 입력하세요."]',
    ],
    '장소 검색 입력 (placeholder="장소명을 입력하세요.")',
  ),

  // 검색 실행 버튼 (Enter로도 동작)
  placeSearchButton: entry(
    'button.se-place-search-button',
    ['.se-place-search-keyword button', 'button[class*="search-button"]'],
    '장소 검색 실행 버튼',
  ),

  // 4단계: 검색 결과 리스트/항목
  placeResultList: entry(
    'ul.se-place-map-search-result-list',
    ['.se-place-map-search-result ul', '.se-place-contents-wrap ul'],
    '장소 검색 결과 리스트',
  ),

  placeResultItem: entry(
    'li.se-place-map-search-result-item',
    ['ul.se-place-map-search-result-list > li'],
    '장소 검색 결과 항목 (카드)',
  ),

  // 카드 클릭 후 하이라이트된 항목
  placeResultItemHighlighted: entry(
    'li.se-place-map-search-result-item.se-is-highlight',
    ['li.se-place-map-search-result-item[class*="highlight"]'],
    '하이라이트된 결과 항목',
  ),

  // 5단계: "추가" 버튼 (선택된 카드 내부)
  // 주의: 각 카드마다 추가 버튼이 있으므로 반드시 highlighted 카드 안의 것을 클릭해야 함
  placeAddButton: entry(
    'li.se-place-map-search-result-item.se-is-highlight button.se-place-add-button',
    [
      'li.se-place-map-search-result-item button.se-place-add-button',
      'button.se-place-add-button',
    ],
    '선택된 결과 카드 안 "추가" 버튼',
  ),

  // 추가 후 attached 클래스 부여 — 멱등 체크용
  placeAddButtonAttached: entry(
    'button.se-place-add-button.se-place-add-button-attached',
    ['button[class*="add-button-attached"]'],
    '추가 완료된 카드의 추가 버튼 (체크/삭제 상태)',
  ),

  // 6단계: 팝업 하단 "확인" 버튼 (실제 본문 삽입 트리거)
  placeConfirmButton: entry(
    '.se-popup-placesMap button.se-popup-button-confirm',
    [
      'button.se-popup-button.se-popup-button-confirm',
      '.se-popup-placesMap button[class*="confirm"]',
    ],
    '장소 팝업 하단 "확인" 버튼 — 본문 삽입 트리거',
  ),

  placePopupCloseButton: entry(
    '.se-popup-placesMap button.se-popup-close-button',
    ['button[aria-label="팝업 닫기"]', 'button[class*="popup-close"]'],
    '장소 팝업 닫기 버튼',
  ),

  // 7단계: 본문에 삽입된 지도 컴포넌트
  insertedPlaceMapBlock: entry(
    'div.se-component.se-placesMap',
    [
      'div.se-component.se-placesMap.se-l-default',
      '.se-section.se-section-placesMap',
      '.se-component[class*="placesMap"]',
    ],
    '본문에 삽입된 장소(지도) 컴포넌트',
  ),

  insertedPlaceMapTitle: entry(
    '.se-component.se-placesMap .se-map-title',
    ['.se-section-placesMap strong.se-map-title'],
    '삽입된 지도 블록 — 장소명',
  ),

  insertedPlaceMapAddress: entry(
    '.se-component.se-placesMap .se-map-address',
    ['.se-section-placesMap p.se-map-address'],
    '삽입된 지도 블록 — 주소',
  ),

  insertedPlaceMapImage: entry(
    '.se-component.se-placesMap img.se-map-image',
    ['.se-module-map-image img'],
    '삽입된 지도 블록 — 지도 이미지',
  ),
};
