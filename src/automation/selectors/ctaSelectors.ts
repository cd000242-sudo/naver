/**
 * CTA(Call-To-Action) 관련 셀렉터
 */
import type { SelectorEntry, SelectorMap } from './types';

export type CtaSelectorKey =
  | 'ctaPopup'
  | 'ctaPanel'
  | 'ctaLayer'
  | 'ctaModal'
  | 'closeButton'
  | 'ctaUrlInput'
  | 'ctaConfirmButton';

const entry = (primary: string, fallbacks: readonly string[], description: string): SelectorEntry => ({
  primary, fallbacks, description,
});

export const CTA_SELECTORS: SelectorMap<CtaSelectorKey> = {
  ctaPopup: entry(
    '.se-popup',
    ['.se-panel', '.se-layer', '.se-modal'],
    'CTA 팝업',
  ),
  ctaPanel: entry(
    '.se-panel',
    ['.se-popup', '.se-layer'],
    'CTA 패널',
  ),
  ctaLayer: entry(
    '.se-layer',
    ['.se-popup', '.se-panel'],
    'CTA 레이어',
  ),
  ctaModal: entry(
    '.se-modal',
    ['.se-popup', '.se-layer', '.se-panel'],
    'CTA 모달',
  ),
  closeButton: entry(
    'button[class*="close"]',
    ['.close', '[aria-label*="닫기"]', 'button[title*="닫기"]'],
    '닫기 버튼',
  ),
  ctaUrlInput: entry(
    'input[type="url"]',
    ['input[placeholder*="URL"]', 'input[name="url"]'],
    'CTA URL 입력',
  ),
  ctaConfirmButton: entry(
    'button:has-text("확인")',
    ['button[class*="confirm"]', 'button[data-action="confirm"]'],
    'CTA 확인 버튼',
  ),
};
