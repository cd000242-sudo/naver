// src/renderer/modules/headingImageAnimatedSetting.ts
// [2026-11-07 사장님] "움짤로 만들기" — 켜면 본문 소제목 이미지를 GPT 이미지 2.6 의 움직이는 GIF 로 만든다(썸네일은 정지).
// One switch for config.headingImageAnimated. main reads it per generation (imageGenerator → animatedGifRequest), so every
// article flow gets it without a renderer flag. The image tab's checkbox and the full-auto image settings modal show the
// same saved value. 2.6 + GPT 이미지(덕트테이프) only: on any other engine / model the box is locked with a one-line notice
// (a box that is already on can still be turned off). Inline bundle = one scope: top-level names carry the animatedGif prefix.
import { ANIMATED_GIF_FRAME_COUNT, getAnimatedGifCostKRW } from '../utils/imageCostUtils.js';

export const ANIMATED_GIF_SETTING_IDS: readonly string[] = ['heading-image-animated-option', 'heading-image-animated-include'];
export const ANIMATED_GIF_ONLY_26_NOTICE = '움짤은 GPT 이미지 2.6 에서만 됩니다.';

const ANIMATED_GIF_MODEL_PATTERN = /^gpt-image-2\.6-(sunburst|flare)$/u;

interface AnimatedGifSettingConfig {
  headingImageAnimated?: boolean;
  openaiImageModel?: string;
  openaiImageQuality?: string;
  usdToKrwRate?: number;
  success?: boolean;
}
export interface AnimatedGifSettingApi {
  getConfig?: () => Promise<AnimatedGifSettingConfig | null | undefined>;
  saveConfig?: (update: { headingImageAnimated: boolean }) => Promise<AnimatedGifSettingConfig | null | undefined>;
}
export type AnimatedGifSettingNotice = (message: string, kind: 'success' | 'error') => void;

let animatedGifSettingValue = false;
let animatedGifSettingConfigModel = '';
let animatedGifSettingQuality = 'medium';
let animatedGifSettingRate = 1400;
let animatedGifSettingListening = false;
let animatedGifSettingApiRef: AnimatedGifSettingApi | undefined;
let animatedGifSettingNotify: AnimatedGifSettingNotice = () => undefined;

/** 2.6 sunburst/flare on the GPT 이미지(덕트테이프) engine. An empty model means the app default, which is 2.6. */
export function animatedGifAvailability(engine: string, model: string): { available: boolean; notice: string } {
  const picked = String(model || '').trim();
  const modelOk = picked === '' || ANIMATED_GIF_MODEL_PATTERN.test(picked);
  const available = String(engine || '').trim() === 'openai-image' && modelOk;
  return { available, notice: available ? '' : ANIMATED_GIF_ONLY_26_NOTICE };
}

/** The engine the screen generates with right now: the image tab dropdown, then the shared saved choice. */
export function animatedGifCurrentEngine(): string {
  if (typeof document === 'undefined') return '';
  const dropdown = String((document.getElementById('image-source-select') as HTMLSelectElement | null)?.value || '').trim();
  if (dropdown) return dropdown;
  try {
    return String(localStorage.getItem('globalImageSource') || localStorage.getItem('fullAutoImageSource') || '').trim();
  } catch {
    return '';
  }
}

/** The model on screen first (a click is not saved yet), then the saved config model. */
function animatedGifCurrentModel(): string {
  if (typeof document === 'undefined') return animatedGifSettingConfigModel;
  const radio = document.querySelector('input[name="openai-image-model"]:checked') as HTMLInputElement | null;
  const select = document.getElementById('submodal-openai-image-model') as HTMLSelectElement | null;
  return String(radio?.value || select?.value || animatedGifSettingConfigModel || '').trim();
}

/** Every animated-GIF checkbox that exists right now shows the saved value and the engine/model state (the modal is created on first open). */
export function animatedGifSettingPaint(): void {
  if (typeof document === 'undefined') return;
  const state = animatedGifAvailability(animatedGifCurrentEngine(), animatedGifCurrentModel());
  const model = animatedGifCurrentModel() || 'gpt-image-2.6-sunburst';
  const cost = getAnimatedGifCostKRW(model, animatedGifSettingQuality, animatedGifSettingRate);
  const costText = `움짤 한 장 약 ₩${cost.toLocaleString('ko-KR')} (추정 · 프레임 ${ANIMATED_GIF_FRAME_COUNT}장)`;
  for (const id of ANIMATED_GIF_SETTING_IDS) {
    const box = document.getElementById(id) as HTMLInputElement | null;
    if (!box) continue;
    if (box.checked !== animatedGifSettingValue) box.checked = animatedGifSettingValue;
    // Locked only while it is off and unavailable: a stale "on" must stay switchable off.
    box.disabled = !state.available && !animatedGifSettingValue;
    const note = document.getElementById(`${id}-note`);
    if (note) note.textContent = state.available ? costText : state.notice;
  }
}

async function animatedGifSettingSave(
  box: HTMLInputElement,
  api: AnimatedGifSettingApi | undefined,
  notify: AnimatedGifSettingNotice,
): Promise<void> {
  const requested = box.checked;
  box.disabled = true;
  try {
    if (!api?.saveConfig) throw new Error('Config connection unavailable');
    const persisted = await api.saveConfig({ headingImageAnimated: requested });
    if (persisted?.success === false || persisted?.headingImageAnimated !== requested) {
      throw new Error('Config save was not acknowledged');
    }
    animatedGifSettingValue = requested;
    notify(requested
      ? '움짤 켬 — 소제목 이미지를 움직이는 GIF 로 만듭니다 (썸네일은 그대로)'
      : '움짤 끔 — 소제목 이미지는 정지 이미지로 만듭니다', 'success');
  } catch {
    box.checked = animatedGifSettingValue;
    notify('움짤 설정을 저장하지 못했습니다. 이전 상태를 유지합니다. 다시 눌러 주세요.', 'error');
  } finally {
    box.disabled = false;
    animatedGifSettingPaint();
  }
}

/** Wires once (document listeners — the modal checkbox appears later), then reads and paints the saved value. */
export async function animatedGifSettingInstall(
  api: AnimatedGifSettingApi | undefined,
  notify: AnimatedGifSettingNotice,
): Promise<void> {
  if (typeof document === 'undefined') return;
  animatedGifSettingApiRef = api;
  animatedGifSettingNotify = notify;
  if (!animatedGifSettingListening) {
    animatedGifSettingListening = true;
    document.addEventListener('change', (event) => {
      const target = event.target as HTMLInputElement | HTMLSelectElement | null;
      if (!target) return;
      if (target.tagName === 'INPUT' && ANIMATED_GIF_SETTING_IDS.includes(target.id)) {
        void animatedGifSettingSave(target as HTMLInputElement, animatedGifSettingApiRef, animatedGifSettingNotify);
        return;
      }
      // Engine or model changed on screen: the box's availability follows.
      if (target.id === 'image-source-select' || (target as HTMLInputElement).name === 'openai-image-model' || target.id === 'submodal-openai-image-model') {
        animatedGifSettingPaint();
      }
    });
  }
  try {
    const config = await api?.getConfig?.();
    animatedGifSettingValue = config?.headingImageAnimated === true;
    animatedGifSettingConfigModel = String(config?.openaiImageModel || '').trim();
    animatedGifSettingQuality = String(config?.openaiImageQuality || 'medium').trim() || 'medium';
    animatedGifSettingRate = typeof config?.usdToKrwRate === 'number' && config.usdToKrwRate > 0 ? config.usdToKrwRate : 1400;
  } catch {
    animatedGifSettingValue = false; // unreadable config: shown off, same as main's defensive read
  }
  animatedGifSettingPaint();
}

/** Test hook: forget the cached values (the single document listener stays). */
export function animatedGifSettingResetForTest(): void {
  animatedGifSettingValue = false;
  animatedGifSettingConfigModel = '';
  animatedGifSettingQuality = 'medium';
  animatedGifSettingRate = 1400;
}
