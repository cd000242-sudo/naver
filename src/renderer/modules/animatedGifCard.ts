// src/renderer/modules/animatedGifCard.ts
// [2026-11-07 사장님] 소제목 이미지 카드의 "🎞️ 움짤로" 버튼 — 그 카드 한 장만 GPT 이미지 2.6 GIF 로 다시 만든다.
// 2.6 이 아니거나 다른 엔진이면 안내만 하고 멈춘다(2.5 → 2.6 자동 전환, 다른 엔진 대체 금지). 썸네일 칸은 만들지 않는다.
// Inline bundle = one scope: top-level names carry the animatedGif prefix; cross-module calls are direct.
import { ANIMATED_GIF_FRAME_COUNT, getAnimatedGifCostKRW } from '../utils/imageCostUtils.js';
import { animatedGifAvailability } from './headingImageAnimatedSetting.js';

declare const appendLog: any;
declare const toastManager: any;
declare const ImageManager: any;
declare const generateImagesWithCostSafety: any;
declare const syncGlobalImagesFromImageManager: any;
declare const toFileUrlMaybe: any;

export interface AnimatedGifCardArgs {
  readonly index: number;
  readonly heading: string;
  readonly prompt: string;
  /** The engine picked in the image tab (readSelectedImageSource). */
  readonly source: string;
  /** buildImageRegenerateRequest(...) — the same request a normal [재생성] sends. */
  readonly request: { items: any[]; [key: string]: any };
  readonly button?: HTMLButtonElement | null;
}

/** A generated image that is (or carries) a GIF: by extension or preview data URL. */
export function animatedGifIsAnimated(image: any): boolean {
  if (!image || typeof image !== 'object') return false;
  const pathText = String(image.filePath || image.savedToLocal || '').split(/[?#]/u)[0];
  return /\.gif$/iu.test(pathText) || /^data:image\/gif[;,]/iu.test(String(image.previewDataUrl || ''));
}

function animatedGifSay(kind: 'success' | 'warning' | 'error', message: string): void {
  try { appendLog(message, 'images-log-output'); } catch { /* log panel missing in isolated contexts */ }
  try { toastManager?.[kind]?.(message); } catch { /* toast missing in isolated contexts */ }
}

async function animatedGifReadConfig(): Promise<{ model: string; quality: string; rate: number }> {
  try {
    const config = await (globalThis as any).window?.api?.getConfig?.();
    return {
      model: String(config?.openaiImageModel || '').trim(),
      quality: String(config?.openaiImageQuality || 'medium').trim() || 'medium',
      rate: typeof config?.usdToKrwRate === 'number' && config.usdToKrwRate > 0 ? config.usdToKrwRate : 1400,
    };
  } catch {
    return { model: '', quality: 'medium', rate: 1400 };
  }
}

function animatedGifShowOnCard(index: number, previewDataUrl: string): void {
  const img = document.querySelector(`#generated-images-grid .generated-image-item[data-image-index="${index}"] img`) as HTMLImageElement | null;
  if (img) img.src = previewDataUrl;
}

/** Re-creates one section image as an animated GIF. Returns true only when the card was replaced with a real GIF. */
export async function animatedGifRegenerateCard(args: AnimatedGifCardArgs): Promise<boolean> {
  const { index, heading, prompt, source, request, button } = args;
  const first = request?.items?.[0];
  if (!first || first.isThumbnail === true) {
    animatedGifSay('warning', '썸네일은 움짤로 만들 수 없습니다.');
    return false;
  }
  const config = await animatedGifReadConfig();
  const gate = animatedGifAvailability(source, config.model);
  if (!gate.available) {
    animatedGifSay('warning', gate.notice);
    return false;
  }

  const label = button?.textContent ?? '';
  if (button) { button.disabled = true; button.textContent = '🎞️ 만드는 중…'; }
  try {
    const cost = getAnimatedGifCostKRW(config.model || 'gpt-image-2.6-sunburst', config.quality, config.rate);
    try {
      appendLog(`🎞️ "${heading}" 움짤 만드는 중… 1~2분 걸릴 수 있어요 (약 ₩${cost.toLocaleString('ko-KR')} 추정, 프레임 ${ANIMATED_GIF_FRAME_COUNT}장)`, 'images-log-output');
    } catch { /* log panel missing */ }

    const { missingEnglishPrompt: _missing, ...options } = request as any;
    const items = options.items.map((item: any) => ({ ...item, animatedGif: true, isThumbnail: false }));
    const result = await generateImagesWithCostSafety({ provider: 'openai-image', ...options, items, regenerate: true });
    const image = result?.success ? result.images?.[0] : null;
    if (!animatedGifIsAnimated(image)) {
      throw new Error(result?.message || '움짤을 만들지 못했습니다. 정지 이미지는 그대로 둡니다.');
    }

    const filePath = String(image.savedToLocal || image.filePath || '');
    const previewDataUrl = String(image.previewDataUrl || '');
    ImageManager.setImage(heading, {
      heading,
      filePath,
      url: toFileUrlMaybe(filePath || previewDataUrl),
      previewDataUrl,
      prompt,
      headingIndex: index,
      provider: image.provider || 'openai-image',
      textRendered: false,
      disableTextOverlay: true,
    });
    try { syncGlobalImagesFromImageManager(); } catch { /* sync is best-effort */ }
    animatedGifShowOnCard(index, previewDataUrl || toFileUrlMaybe(filePath));
    animatedGifSay('success', `"${heading}" 움짤이 만들어졌습니다.`);
    return true;
  } catch (error) {
    animatedGifSay('error', `움짤 만들기 실패: ${(error as Error).message}`);
    return false;
  } finally {
    if (button) { button.disabled = false; button.textContent = label; }
  }
}
