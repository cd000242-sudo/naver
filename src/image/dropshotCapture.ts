/**
 * 🍌 리더스 나노바나나 무제한 — low-level single-image capture engine.
 *
 * Drives the dropshot board page: fills the prompt, clicks generate, optionally
 * uploads i2i references, and waits for the NEW result image (data: or CDN blob).
 * Wrapped by makeDropshotImage with the §12.1 generation mutex so concurrent calls
 * are serialized over the single shared browser page.
 *
 * generateWithDropshot (dispatcher + dedup loop) lives in dropshotGenerator.ts.
 */

import {
  ensurePage,
  ensureDropshotControls,
  downloadAsFileBuffer,
  invalidateBrowserCache,
  getGenerationChain,
  setGenerationChain,
  type DropshotResult,
} from './dropshotCore.js';

const BOARD_URL =
  'https://aistudio.dropshot.io/ko/workspace/board?panel=image&imageModelName=google/nano-banana-pro';
const PROMPT_SELECTOR = 'textarea[placeholder="어떤 장면을 만들고 싶나요?"]';
const MAX_RETRIES = 3;

/** Low-level image generation (single prompt, single attempt chain). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function makeDropshotImageInternal(
  prompt: string,
  options: {
    referenceImageList?: string[];
  } = {},
  onLog?: (m: string) => void,
): Promise<DropshotResult> {
  let lastError: string | null = null;

  try {
    const page = await ensurePage(onLog);

    // §12.2 — ensure unlimited mode + counter=1
    await ensureDropshotControls(page, onLog);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      onLog?.(
        `[리더스 나노바나나] 이미지 생성 중... (시도 ${attempt}/${MAX_RETRIES})`,
      );

      try {
        // 1. Ensure we are on the board URL
        if (!page.url().includes('panel=image')) {
          await page.goto(BOARD_URL, {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
          });
          await new Promise((r) => setTimeout(r, 3000));
          // Re-apply controls after navigation
          await ensureDropshotControls(page, onLog);
        }

        // 2. Snapshot existing result images before generation (NEW-only detection)
        const beforeSrcs: string[] = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('img'))
            .map((i: HTMLImageElement) => i.src || '')
            .filter(
              (s: string) =>
                (s.startsWith('data:image/') ||
                  s.includes('cdn.aistudio.dropshot.io')) &&
                !s.includes('/icons/') &&
                !s.includes('/sample/'),
            );
        });

        // 3. i2i mode — upload reference images via setInputFiles
        const refList = (options.referenceImageList || []).slice(0, 4);
        if (refList.length > 0) {
          onLog?.(
            `[리더스 나노바나나] reference ${refList.length}장 업로드 중...`,
          );
          const buffers: Array<{
            name: string;
            mimeType: string;
            buffer: Buffer;
          }> = [];
          for (const url of refList) {
            const f = await downloadAsFileBuffer(url);
            if (f) buffers.push(f);
          }
          if (buffers.length > 0) {
            const fileInput = await page.$(
              'input[type="file"][data-dropzone-accept="image"][multiple], ' +
                '[data-sentry-component="UploadedImage"] input[type="file"], ' +
                'input[type="file"][accept*="image"]',
            );
            if (fileInput) {
              try {
                await fileInput.setInputFiles(buffers);
                onLog?.(
                  `[리더스 나노바나나] reference ${buffers.length}장 업로드 완료`,
                );
                await new Promise((r) => setTimeout(r, 2500));
              } catch (e) {
                onLog?.(
                  `[리더스 나노바나나] reference 업로드 실패: ${(e as Error).message?.slice(0, 100)}`,
                );
              }
            } else {
              onLog?.(
                '[리더스 나노바나나] reference 업로드 input 못 찾음 → 텍스트→이미지로 진행',
              );
            }
          }
        }

        // 4. Fill prompt textarea
        await page.waitForSelector(PROMPT_SELECTOR, { timeout: 10000 });
        await page.click(PROMPT_SELECTOR);
        await page.fill(PROMPT_SELECTOR, prompt);
        await new Promise((r) => setTimeout(r, 1000));

        // 5. Click generate button (absolute button inside textarea parent)
        const clicked: boolean = await page.evaluate(() => {
          const ta = document.querySelector(
            'textarea[placeholder="어떤 장면을 만들고 싶나요?"]',
          ) as HTMLTextAreaElement | null;
          if (!ta) return false;
          let parent = ta.parentElement;
          for (let depth = 0; depth < 5 && parent; depth++) {
            const btn = parent.querySelector(
              'button.absolute',
            ) as HTMLButtonElement | null;
            if (btn && !btn.disabled) {
              btn.click();
              return true;
            }
            parent = parent.parentElement;
          }
          return false;
        });
        if (!clicked) await page.keyboard.press('Enter');

        // 6. Wait for NEW result image (max 90 seconds)
        const startTs = Date.now();
        let foundDataUrl: string | null = null;
        while (Date.now() - startTs < 90_000) {
          await new Promise((r) => setTimeout(r, 2000));

          // base64 data URL
          const dataUrl: string | null = await page.evaluate(
            (before: string[]) => {
              const beforeSet = new Set(before);
              return (
                Array.from(document.querySelectorAll('img')).find(
                  (i: HTMLImageElement) => {
                    const src = i.src || '';
                    return (
                      src.startsWith('data:image/') &&
                      i.naturalWidth > 200 &&
                      !src.includes('icons/') &&
                      !beforeSet.has(src)
                    );
                  },
                )?.src || null
              );
            },
            beforeSrcs,
          );
          if (dataUrl) {
            foundDataUrl = dataUrl;
            break;
          }

          // CDN URL → blob → dataURL
          const cdnUrl: string | null = await page.evaluate(
            (before: string[]) => {
              const beforeSet = new Set(before);
              return (
                Array.from(document.querySelectorAll('img')).find(
                  (i: HTMLImageElement) => {
                    const src = i.src || '';
                    return (
                      src.includes('cdn.aistudio.dropshot.io') &&
                      !src.includes('/icons/') &&
                      !src.includes('/sample/') &&
                      i.naturalWidth > 200 &&
                      !beforeSet.has(src)
                    );
                  },
                )?.src || null
              );
            },
            beforeSrcs,
          );
          if (cdnUrl) {
            const blobDataUrl: string = await page.evaluate(async (url: string) => {
              const r = await fetch(url);
              const blob = await r.blob();
              return await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = () => reject(new Error('blob read failed'));
                reader.readAsDataURL(blob);
              });
            }, cdnUrl);
            foundDataUrl = blobDataUrl;
            break;
          }
        }

        if (foundDataUrl) {
          onLog?.('[리더스 나노바나나] 이미지 생성 완료');
          return { ok: true, dataUrl: foundDataUrl };
        }

        lastError = '90초 내 결과 이미지 미발견';
        onLog?.(
          `[리더스 나노바나나] ${lastError} (시도 ${attempt})`,
        );
      } catch (e) {
        lastError = (e as Error).message || String(e);
        onLog?.(`[리더스 나노바나나] 시도 ${attempt} 실패: ${lastError}`);
        if (
          lastError &&
          (lastError.includes('Target closed') ||
            lastError.includes('WebSocket'))
        ) {
          invalidateBrowserCache();
        }
      }
    }

    return { ok: false, dataUrl: '', error: lastError || 'unknown' };
  } catch (e) {
    return { ok: false, dataUrl: '', error: (e as Error).message || String(e) };
  }
}

/**
 * makeDropshotImage — §12.1 serialized via _generationChain mutex.
 * All concurrent calls are queued; each failure does not block the next.
 */
export async function makeDropshotImage(
  prompt: string,
  options: { referenceImageList?: string[] } = {},
  onLog?: (m: string) => void,
): Promise<DropshotResult> {
  const next = getGenerationChain().then(() =>
    makeDropshotImageInternal(prompt, options, onLog),
  );
  // Prevent one failure from blocking the chain
  setGenerationChain(next.catch(() => undefined as unknown));
  return next;
}
