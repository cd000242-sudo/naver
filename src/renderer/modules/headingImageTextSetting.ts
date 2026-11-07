// src/renderer/modules/headingImageTextSetting.ts
// [2026-11-03] 사장님: "썸네일 텍스트 포함 아래 체크박스 하나 더 만들어서 소제목 텍스트 포함하기 — 소제목 텍스트가 그대로".
// One switch for config.headingImageTextInclude. main reads it per generation (imageGenerator → resolveHeadingImageText)
// and puts the heading verbatim on each section image — only for engines that draw Korean themselves
// (koreanTextEngines); the others stay text-free. The image tab's checkbox, the full-auto image settings modal, the
// full-auto publish screen (single publish, full-auto mode), the continuous publishing panel + settings window and the
// multi-account full-auto settings window show the same saved value (a global switch, not a per queue item / account field).
// Inline bundle = one scope, so top-level names carry the headingTextSetting prefix.

export const HEADING_TEXT_SETTING_IDS: readonly string[] = [
  'heading-image-text-option',
  'heading-image-text-include',
  'fullauto-heading-text-option',
  'continuous-include-heading-text',
  'continuous-modal-include-heading-text',
  'ma-setting-heading-text-option',
];

interface HeadingTextSettingConfig {
  headingImageTextInclude?: boolean;
  success?: boolean;
}
export interface HeadingTextSettingApi {
  getConfig?: () => Promise<HeadingTextSettingConfig | null | undefined>;
  saveConfig?: (update: { headingImageTextInclude: boolean }) => Promise<HeadingTextSettingConfig | null | undefined>;
}
export type HeadingTextSettingNotice = (message: string, kind: 'success' | 'error') => void;

let headingTextSettingValue = false;
let headingTextSettingListening = false;
let headingTextSettingApiRef: HeadingTextSettingApi | undefined;
let headingTextSettingNotify: HeadingTextSettingNotice = () => undefined;

/** Every heading-text checkbox that exists right now shows the saved value (the modal is created on first open). */
export function headingTextSettingPaint(): void {
  if (typeof document === 'undefined') return;
  for (const id of HEADING_TEXT_SETTING_IDS) {
    const box = document.getElementById(id) as HTMLInputElement | null;
    if (box && box.checked !== headingTextSettingValue) box.checked = headingTextSettingValue;
  }
}

async function headingTextSettingSave(
  box: HTMLInputElement,
  api: HeadingTextSettingApi | undefined,
  notify: HeadingTextSettingNotice,
): Promise<void> {
  const requested = box.checked;
  box.disabled = true;
  try {
    if (!api?.saveConfig) throw new Error('Config connection unavailable');
    const persisted = await api.saveConfig({ headingImageTextInclude: requested });
    if (persisted?.success === false || persisted?.headingImageTextInclude !== requested) {
      throw new Error('Config save was not acknowledged');
    }
    headingTextSettingValue = requested;
    headingTextSettingPaint();
    notify(requested
      ? '소제목 텍스트 포함: 켬 — 소제목 이미지에 소제목 글자를 그대로 넣습니다 (한글을 직접 그리는 엔진만)'
      : '소제목 텍스트 포함: 끔 — 소제목 이미지는 글자 없이 만듭니다', 'success');
  } catch {
    box.checked = headingTextSettingValue;
    notify('소제목 텍스트 포함 설정을 저장하지 못했습니다. 이전 상태를 유지합니다. 다시 눌러 주세요.', 'error');
  } finally {
    box.disabled = false;
  }
}

/** Wires once (document listener — the modal checkbox appears later), then reads and paints the saved value. */
export async function headingTextSettingInstall(
  api: HeadingTextSettingApi | undefined,
  notify: HeadingTextSettingNotice,
): Promise<void> {
  if (typeof document === 'undefined') return;
  headingTextSettingApiRef = api;
  headingTextSettingNotify = notify;
  if (!headingTextSettingListening) {
    headingTextSettingListening = true;
    document.addEventListener('change', (event) => {
      const box = event.target as HTMLInputElement | null;
      if (!box || box.tagName !== 'INPUT' || !HEADING_TEXT_SETTING_IDS.includes(box.id)) return;
      void headingTextSettingSave(box, headingTextSettingApiRef, headingTextSettingNotify);
    });
  }
  try {
    const config = await api?.getConfig?.();
    headingTextSettingValue = config?.headingImageTextInclude === true;
  } catch {
    headingTextSettingValue = false; // unreadable config: shown off, same as main's defensive read
  }
  headingTextSettingPaint();
}

/** Test hook: forget the cached value (the single document listener stays). */
export function headingTextSettingResetForTest(): void {
  headingTextSettingValue = false;
}
