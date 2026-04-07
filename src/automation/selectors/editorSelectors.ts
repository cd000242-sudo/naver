/**
 * 네이버 스마트에디터 ONE 관련 셀렉터
 */
import type { SelectorEntry, SelectorMap } from './types';

export type EditorSelectorKey =
  | 'documentTitle'
  | 'titleText'
  | 'bodyText'
  | 'bodyFocusable'
  | 'contentEditable'
  | 'mainContainer'
  | 'editingArea'
  | 'textParagraph'
  | 'allTextElements'
  | 'editorContainer'
  | 'writeArea'
  | 'mainFrame'
  | 'mainFrameByName'
  | 'mainFrameByClass'
  | 'boldButton'
  | 'underlineButton'
  | 'fontSizeButton'
  | 'quotationButton'
  | 'quotationPopup'
  | 'popupLayer'
  | 'autocompleteLayer'
  | 'stickerLayer'
  | 'allPopups';

const entry = (primary: string, fallbacks: readonly string[], description: string): SelectorEntry => ({
  primary, fallbacks, description,
});

export const EDITOR_SELECTORS: SelectorMap<EditorSelectorKey> = {
  // --- 제목 ---
  documentTitle: entry(
    '.se-section-documentTitle',
    ['.se-documentTitle', '[data-name="documentTitle"]'],
    '제목 입력 영역 (섹션)',
  ),
  titleText: entry(
    '.se-section-documentTitle .se-title-text',
    ['.se-title-text', '.se-documentTitle-text'],
    '제목 텍스트 요소',
  ),

  // --- 본문 ---
  bodyText: entry(
    '.se-section-text',
    ['.se-main-container', '.se-editing-area', '.se-component-content'],
    '본문 편집 영역',
  ),
  bodyFocusable: entry(
    '.se-section-text',
    [
      '.se-main-container .se-editing-area',
      '.se-editing-area',
      '.se-component-content',
      '[contenteditable="true"]',
    ],
    '본문 포커스 대상 (setBold 등에서 사용)',
  ),
  contentEditable: entry(
    '[contenteditable="true"]',
    ['.se-text-paragraph[contenteditable]', '.se-component-content[contenteditable]'],
    '편집 가능한 요소 (범용 폴백)',
  ),
  mainContainer: entry(
    '.se-main-container',
    ['.se-editor-container', '#se-editor'],
    '에디터 메인 컨테이너',
  ),
  editingArea: entry(
    '.se-editing-area',
    ['.se-content', '.se-main-container .se-editing-area'],
    '에디터 편집 영역',
  ),
  textParagraph: entry(
    '.se-text-paragraph',
    ['.se-section-text p', '.se-module-text p'],
    '텍스트 문단 요소',
  ),
  allTextElements: entry(
    '.se-section-text',
    ['.se-module-text', '.se-text-paragraph', '.se-component'],
    '모든 텍스트 요소 (querySelectorAll용)',
  ),

  // --- 컨테이너 / 프레임 ---
  editorContainer: entry(
    '.se-container',
    ['#write_area', '.se-editor-wrap'],
    '편집기 최외곽 컨테이너',
  ),
  writeArea: entry(
    '#write_area',
    ['.se-container', '.editor_area'],
    '작성 영역',
  ),
  mainFrame: entry(
    '#mainFrame',
    ['iframe[name="mainFrame"]', 'iframe.se-main-frame', 'iframe#mainFrame'],
    '에디터 메인 iframe',
  ),
  mainFrameByName: entry(
    'iframe[name="mainFrame"]',
    ['#mainFrame', 'iframe.se-main-frame'],
    '에디터 iframe (name 속성)',
  ),
  mainFrameByClass: entry(
    'iframe.se-main-frame',
    ['iframe[name="mainFrame"]', '#mainFrame'],
    '에디터 iframe (class)',
  ),

  // --- 도구모음 ---
  boldButton: entry(
    'button[data-name="bold"]',
    [
      'button.se-toolbar-button[data-command="bold"]',
      'button[aria-label*="굵게"]',
      'button[title*="굵게"]',
    ],
    '굵게 버튼',
  ),
  underlineButton: entry(
    'button[data-name="underline"]',
    [
      'button.se-toolbar-button[data-command="underline"]',
      'button[aria-label*="밑줄"]',
      'button[title*="밑줄"]',
    ],
    '밑줄 버튼',
  ),
  fontSizeButton: entry(
    'button.se-font-size-code-toolbar-button[data-name="font-size"]',
    [
      'button[data-name="font-size"]',
      '.se-toolbar-button[aria-label*="크기"]',
      'button.se-toolbar-button-fontSize',
    ],
    '폰트 크기 버튼',
  ),
  quotationButton: entry(
    'button[data-name="quotation"]',
    ['button.se-toolbar-button-quotation', 'button[aria-label*="인용"]'],
    '인용구 버튼',
  ),
  quotationPopup: entry(
    '.se-popup-quotation',
    ['.se-toolbar-layer-quotation', '.se-popup-layer'],
    '인용구 스타일 팝업',
  ),

  // --- 팝업 / 레이어 ---
  popupLayer: entry(
    '.se-popup-layer',
    ['[class*="popup"]', '[class*="layer"]'],
    '범용 팝업 레이어',
  ),
  autocompleteLayer: entry(
    '.se-autocomplete-layer',
    ['.se-autocomplete-popup', '[class*="autocomplete"]'],
    '자동완성 레이어',
  ),
  stickerLayer: entry(
    '.se-sticker-layer',
    ['.se-sticker-popup', '[class*="sticker"]'],
    '스티커 레이어',
  ),
  allPopups: entry(
    '.se-popup',
    ['.se-panel', '.se-layer', '.se-modal'],
    '모든 팝업/모달/레이어 (querySelectorAll용)',
  ),
};
