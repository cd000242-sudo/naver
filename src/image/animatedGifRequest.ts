/**
 * [2026-11-07 owner] Per-call GIF plan for generateImages: reads the saved "움짤로 만들기" switch and the saved OpenAI
 * image model, then lets animatedGifPolicy pick the items (or throw the short notice).
 *
 * The switch lives in config (config.headingImageAnimated), read here per generation like "소제목 글자 넣기", so every
 * article flow — single, continuous, multi-account, regeneration, daily — gets the same answer without each renderer
 * path carrying a flag. Unreadable config means "off": nothing turns into a GIF by accident.
 */
import { planAnimatedGif } from './animatedGifPolicy.js';

export interface AnimatedGifConfig {
  readonly settingOn: boolean;
  readonly model: string;
}

export async function readAnimatedGifConfig(): Promise<AnimatedGifConfig> {
  try {
    const { loadConfig } = await import('../configManager.js');
    const config = (await loadConfig()) as { headingImageAnimated?: unknown; openaiImageModel?: unknown } | null | undefined;
    return { settingOn: config?.headingImageAnimated === true, model: String(config?.openaiImageModel ?? '').trim() };
  } catch {
    return { settingOn: false, model: '' };
  }
}

export interface AnimatedGifCall<T> {
  readonly provider: string;
  /** The model the screen sent (options.imageModel); the saved config model is used when it is empty. */
  readonly imageModel?: string;
  readonly items: readonly T[];
  readonly articleSectionImages: boolean;
  readonly isShoppingConnect: boolean;
}

export async function planAnimatedGifForCall<T extends { heading?: string; isThumbnail?: boolean; animatedGif?: boolean }>(
  call: AnimatedGifCall<T>,
): Promise<ReadonlySet<T>> {
  const config = await readAnimatedGifConfig();
  return planAnimatedGif({
    provider: call.provider,
    model: String(call.imageModel ?? '').trim() || config.model,
    items: call.items,
    settingOn: config.settingOn,
    articleSectionImages: call.articleSectionImages,
    isShoppingConnect: call.isShoppingConnect,
  });
}
