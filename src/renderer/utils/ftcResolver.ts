// v2.7.50 ??怨듭젙??FTC) ?좉? 寃곗젙 ?⑥씪 ?⑥닔 (SSOT)
//
// reviewer 吏꾨떒(docs/diagnosis-2026-04-29/reviewer-summary.md):
//   "FTC 寃곗젙 ?곗꽑?쒖쐞 遺꾧린 3以? fullAutoFlow.ts/multiAccountManager.ts ?묒そ 以묐났.
//    4踰덉㎏ 遺꾧린?????깆옣?섎㈃ ?щ컻 100%."
//
// 蹂?紐⑤뱢? FTC ?쒖꽦 ?щ? + ?띿뒪?몃? 寃곗젙?섎뒗 ?⑥씪 SSOT ?⑥닔瑜??쒓났?쒕떎.

import { DEFAULT_AFFILIATE_FTC_DISCLOSURE } from '../../automation/ftcDisclosurePresets.js';

interface FtcResolverOptions {
  /** ?ъ슜??諛쒗뻾 紐⑤뱶 */
  contentMode?: string;
  /** 硫붿씤 諛쒗뻾 ?먮쫫??泥댄겕諛뺤뒪 ?곹깭 (?놁쑝硫?臾댁떆) */
  uiCheckboxChecked?: boolean;
  /** ?ъ슜?먭? ?낅젰??textarea 媛?(?놁쑝硫?localStorage / 湲곕낯媛??ъ슜) */
  uiTextValue?: string;
}

interface FtcResolution {
  /** 理쒖쥌 ?쒖꽦???щ? */
  enabled: boolean;
  /** ?쎌엯???띿뒪??(?쒖꽦?붿씪 ?뚮쭔 ?섎? ?덉쓬) */
  text: string;
  /** 寃곗젙 洹쇨굅 (?붾쾭洹몄슜) */
  source: 'checkbox' | 'localStorage' | 'mode-default-affiliate' | 'mode-default-other';
}

/**
 * 怨듭젙??臾멸뎄 ?쒖꽦/鍮꾪솢??寃곗젙 ??紐⑤뱺 諛쒗뻾 ?먮쫫???⑥씪 吏꾩엯??
 *
 * ?곗꽑?쒖쐞:
 *   1. UI 泥댄겕諛뺤뒪 ?꾩옱 ?곹깭 (?ъ슜??利됱떆 ?섎룄)
 *   2. localStorage 紐낆떆 ??κ컪 (?댁쟾 ?섎룄)
 *   3. 紐⑤뱶蹂?湲곕낯媛?(affiliate=ON, 洹???OFF)
 *
 * @example
 *   const ftc = resolveFtcSetting({
 *     contentMode: formData.contentMode,
 *     uiCheckboxChecked: ftcCheckboxEl?.checked,
 *     uiTextValue: ftcTextareaEl?.value,
 *   });
 *   if (ftc.enabled && ftc.text) {
 *     structuredContent.ftcDisclosure = ftc.text;
 *   }
 */
export function resolveFtcSetting(options: FtcResolverOptions = {}): FtcResolution {
  const isAffiliateMode = options.contentMode === 'affiliate';

  // 1?쒖쐞: UI 泥댄겕諛뺤뒪 (?꾩옱 ?ъ슜???섎룄, 媛??沅뚯쐞 ?덉쓬)
  let enabled: boolean;
  let source: FtcResolution['source'];
  if (options.uiCheckboxChecked !== undefined) {
    enabled = options.uiCheckboxChecked;
    source = 'checkbox';
  } else {
    // 2?쒖쐞: localStorage ??κ컪 (?ъ슜?먭? ?댁쟾??紐낆떆 ?ㅼ젙??媛?
    let stored: string | null = null;
    try {
      if (typeof localStorage !== 'undefined') {
        stored = localStorage.getItem('ftcDisclosureEnabled');
      }
    } catch { /* renderer ?몃? ?몄텧 ?먮뒗 localStorage 誘몄???*/ }

    if (stored !== null) {
      enabled = stored === 'true';
      source = 'localStorage';
    } else {
      // 3순위: 모드별 기본값
      enabled = isAffiliateMode;
      source = isAffiliateMode ? 'mode-default-affiliate' : 'mode-default-other';
    }
  }

  // ?띿뒪??寃곗젙: UI ?낅젰 > localStorage > 湲곕낯 ?띿뒪???쇳븨而ㅻ꽖?몃쭔)
  let text = '';
  if (enabled) {
    if (options.uiTextValue && options.uiTextValue.trim()) {
      text = options.uiTextValue.trim();
    } else {
      try {
        if (typeof localStorage !== 'undefined') {
          const storedText = localStorage.getItem('ftcDisclosureText');
          if (storedText && storedText.trim()) {
            text = storedText.trim();
          }
        }
      } catch { /* ignore */ }
      if (!text && isAffiliateMode) {
        text = DEFAULT_AFFILIATE_FTC_DISCLOSURE;
      }
    }
  }

  return { enabled, text, source };
}
