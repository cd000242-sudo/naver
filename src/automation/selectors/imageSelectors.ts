/**
 * 네이버 에디터 이미지 관련 셀렉터
 */
import type { SelectorEntry, SelectorMap } from './types';

export type ImageSelectorKey =
  | 'imageResource'
  | 'moduleImage'
  | 'sectionImage'
  | 'componentImage'
  | 'allEditorImages'
  | 'imageFrame'
  | 'imageLinkButton'
  | 'linkToolbarButton'
  | 'imageToolbarButton'
  | 'urlInput'
  | 'imageLibrary'
  | 'imageSelector'
  | 'uploadedImageConfirm'
  | 'imageCaption';

const entry = (primary: string, fallbacks: readonly string[], description: string): SelectorEntry => ({
  primary, fallbacks, description,
});

export const IMAGE_SELECTORS: SelectorMap<ImageSelectorKey> = {
  imageResource: entry(
    'img.se-image-resource',
    [
      'img[data-se-image-resource="true"]',
      '.se-module-image img',
      '.se-section-image img',
    ],
    '에디터 내 이미지 요소',
  ),
  moduleImage: entry(
    '.se-module-image img',
    ['.se-section-image img', 'img.se-image-resource'],
    '모듈 내 이미지',
  ),
  sectionImage: entry(
    '.se-section-image img',
    ['.se-module-image img', '.se-component-image img'],
    '섹션 내 이미지',
  ),
  componentImage: entry(
    '.se-component-image img',
    ['.se-module-image img', 'img.se-image-resource'],
    '컴포넌트 내 이미지',
  ),
  allEditorImages: entry(
    'img.se-image-resource',
    ['.se-module-image img', '.se-component-image img'],
    '에디터 내 모든 이미지 (querySelectorAll용)',
  ),
  imageFrame: entry(
    'iframe#mainFrame',
    ['iframe.se-iframe', 'iframe[name="mainFrame"]'],
    '이미지 조작 대상 프레임',
  ),
  imageLinkButton: entry(
    'button[data-name="image-link"]',
    ['button.se-image-link-button', 'button[aria-label*="이미지 링크"]'],
    '이미지 링크 버튼',
  ),
  linkToolbarButton: entry(
    '.se-link-toolbar-button',
    ['button[data-name="link"]', 'button[aria-label*="링크"]'],
    '링크 도구모음 버튼',
  ),
  imageToolbarButton: entry(
    'button[data-name="image"]',
    ['button.se-image-toolbar-button', 'button[aria-label*="이미지"]'],
    '이미지 도구모음 버튼',
  ),
  urlInput: entry(
    'input[type="url"]',
    ['input[placeholder*="URL"]', 'input[placeholder*="url"]', 'input[name="url"]'],
    'URL 입력 필드',
  ),
  imageLibrary: entry(
    '.se-image-library',
    ['.se-image-selector', '.se-image-picker'],
    '이미지 라이브러리',
  ),
  imageSelector: entry(
    '.se-image-selector',
    ['.se-image-library', '.se-image-picker'],
    '이미지 선택기',
  ),
  uploadedImageConfirm: entry(
    'img[src*="postfiles"]',
    ['img[src*="blogfiles"]', 'img.se-image-resource'],
    '업로드된 이미지 확인 (src 기반)',
  ),
  imageCaption: entry(
    '.se-image-caption',
    ['.se-caption', '.se-module-image .se-caption-text'],
    '이미지 캡션 영역',
  ),
};
