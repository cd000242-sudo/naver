// v2.7.50 — 공정위(FTC) 토글 결정 단일 함수 (SSOT)
//
// reviewer 진단(docs/diagnosis-2026-04-29/reviewer-summary.md):
//   "FTC 결정 우선순위 분기 3중. fullAutoFlow.ts/multiAccountManager.ts 양쪽 중복.
//    4번째 분기점 또 등장하면 재발 100%."
//
// 본 모듈은 FTC 활성 여부 + 텍스트를 결정하는 단일 SSOT 함수를 제공한다.

const DEFAULT_FTC_TEXT = '※ 이 포스팅은 제휴 마케팅의 일환으로, 구매 시 소정의 수수료를 제공받을 수 있습니다.';

interface FtcResolverOptions {
  /** 사용자 발행 모드 */
  contentMode?: string;
  /** 메인 발행 흐름의 체크박스 상태 (없으면 무시) */
  uiCheckboxChecked?: boolean;
  /** 사용자가 입력한 textarea 값 (없으면 localStorage / 기본값 사용) */
  uiTextValue?: string;
}

interface FtcResolution {
  /** 최종 활성화 여부 */
  enabled: boolean;
  /** 삽입할 텍스트 (활성화일 때만 의미 있음) */
  text: string;
  /** 결정 근거 (디버그용) */
  source: 'checkbox' | 'localStorage' | 'mode-default-affiliate' | 'mode-default-other';
}

/**
 * 공정위 문구 활성/비활성 결정 — 모든 발행 흐름의 단일 진입점.
 *
 * 우선순위:
 *   1. UI 체크박스 현재 상태 (사용자 즉시 의도)
 *   2. localStorage 명시 저장값 (이전 의도)
 *   3. 모드별 기본값 (affiliate=ON, 그 외=OFF)
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

  // 1순위: UI 체크박스 (현재 사용자 의도, 가장 권위 있음)
  let enabled: boolean;
  let source: FtcResolution['source'];
  if (options.uiCheckboxChecked !== undefined) {
    enabled = options.uiCheckboxChecked;
    source = 'checkbox';
  } else {
    // 2순위: localStorage 저장값 (사용자가 이전에 명시 설정한 값)
    let stored: string | null = null;
    try {
      if (typeof localStorage !== 'undefined') {
        stored = localStorage.getItem('ftcDisclosureEnabled');
      }
    } catch { /* renderer 외부 호출 또는 localStorage 미지원 */ }

    if (stored !== null) {
      enabled = stored === 'true';
      source = 'localStorage';
    } else {
      // 3순위: 모드별 기본값
      enabled = isAffiliateMode;
      source = isAffiliateMode ? 'mode-default-affiliate' : 'mode-default-other';
    }
  }

  // 텍스트 결정: UI 입력 > localStorage > 기본 텍스트(쇼핑커넥트만)
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
        text = DEFAULT_FTC_TEXT;
      }
    }
  }

  return { enabled, text, source };
}
