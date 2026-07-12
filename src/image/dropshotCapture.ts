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
  closeAllDropshotContexts,
  ensurePage,
  ensureDropshotControls,
  downloadAsFileBuffer,
  endDropshotGeneration,
  invalidateBrowserCache,
  getDropshotGenerationEpoch,
  getGenerationChain,
  isDropshotGenerationAborted,
  sanitizeDropshotErrorMessage,
  setGenerationChain,
  tryBeginDropshotGeneration,
  openDropshotImageWorkspace,
  PROMPT_SELECTOR,
  type DropshotResult,
} from './dropshotCore.js';

const BOARD_URL =
  'https://aistudio.dropshot.io/ko/workspace/board?panel=image&imageModelName=google/nano-banana-pro';
const MAX_RETRIES = 3;
const DROPSHOT_GENERATION_ABORTED = 'IMAGE_GENERATION_ABORTED';

function createAbortedResult(): DropshotResult {
  return {
    ok: false,
    dataUrl: '',
    error: `${DROPSHOT_GENERATION_ABORTED}: 이미지 생성을 중지했습니다.`,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fillVisiblePrompt(page: any, prompt: string): Promise<boolean> {
  return await page.evaluate((value: string) => {
    const isVisible = (el: Element): boolean => {
      const rect = (el as HTMLElement).getBoundingClientRect();
      const style = window.getComputedStyle(el as HTMLElement);
      return rect.width > 80 && rect.height > 20 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const candidates = Array.from(
      document.querySelectorAll('textarea, [contenteditable="true"], div[role="textbox"]'),
    ) as HTMLElement[];
    const target = candidates.find((el) => isVisible(el) && !(el as HTMLInputElement).disabled);
    if (!target) return false;

    target.focus();
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
      const descriptor =
        Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target), 'value') ||
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') ||
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
      descriptor?.set?.call(target, value);
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

    target.textContent = value;
    target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, prompt);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readVisiblePromptValue(page: any): Promise<string> {
  return await page.evaluate(() => {
    const isVisible = (el: Element): boolean => {
      const rect = (el as HTMLElement).getBoundingClientRect();
      const style = window.getComputedStyle(el as HTMLElement);
      return rect.width > 80 && rect.height > 20 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const target = Array.from(
      document.querySelectorAll('textarea, [contenteditable="true"], div[role="textbox"]'),
    ).find((element) => isVisible(element) && !(element as HTMLInputElement).disabled) as HTMLElement | undefined;
    if (!target) return '';
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
      return target.value || '';
    }
    return target.innerText || target.textContent || '';
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readDropshotGenerationError(page: any): Promise<string | null> {
  return await page.evaluate(() => {
    const phrases = [
      '\uC54C \uC218 \uC5C6\uB294 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4',
      '\uC774\uB7F0, \uBB38\uC81C\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4',
      '\uC0AC\uC6A9\uD55C \uD06C\uB808\uB527\uC740 \uD658\uBD88\uB418\uC5C8\uC73C\uB2C8',
      'unknown error occurred',
      'something went wrong',
      'generation failed',
    ];
    const visibleTexts = Array.from(document.querySelectorAll('body *'))
      .filter((element) => {
        const rect = (element as HTMLElement).getBoundingClientRect();
        const style = window.getComputedStyle(element as HTMLElement);
        return rect.width > 20 && rect.height > 10 && style.display !== 'none' && style.visibility !== 'hidden';
      })
      .map((element) => ((element as HTMLElement).innerText || element.textContent || '').trim())
      .filter((text) => {
        const lower = text.toLowerCase();
        return phrases.some((phrase) => lower.includes(phrase.toLowerCase()));
      })
      .sort((a, b) => a.length - b.length);
    const visibleText = visibleTexts[0];
    return visibleText ? visibleText.replace(/\s+/g, ' ').slice(0, 220) : null;
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function clickGenerate(page: any): Promise<boolean> {
  return await page.evaluate(() => {
    const isVisible = (el: Element): boolean => {
      const rect = (el as HTMLElement).getBoundingClientRect();
      const style = window.getComputedStyle(el as HTMLElement);
      return rect.width > 8 && rect.height > 8 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const promptEl = Array.from(
      document.querySelectorAll('textarea, [contenteditable="true"], div[role="textbox"]'),
    ).find(isVisible) as HTMLElement | undefined;

    const buttons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
    const enabled = buttons.filter((btn) => !btn.disabled && isVisible(btn));
    const promptRectForGenerate = promptEl?.getBoundingClientRect();
    const normalizedText = (btn: HTMLButtonElement): string =>
      `${btn.innerText || ''} ${btn.getAttribute('aria-label') || ''} ${btn.getAttribute('title') || ''}`
        .replace(/\s+/g, ' ')
        .trim();
    const isGenerateText = (text: string): boolean => {
      const lower = text.toLowerCase();
      return (
        text.includes('\uC774\uBBF8\uC9C0 \uC0DD\uC131\uD558\uAE30') ||
        text.includes('\uC0DD\uC131\uD558\uAE30') ||
        lower.includes('generate') ||
        lower.includes('create image') ||
        lower.includes('submit') ||
        lower.includes('send')
      );
    };
    const rankedGenerateButton = enabled
      .filter((btn) => isGenerateText(normalizedText(btn)))
      .map((btn) => {
        const rect = btn.getBoundingClientRect();
        const text = normalizedText(btn);
        const horizontallyAligned = promptRectForGenerate
          ? rect.right >= promptRectForGenerate.left - 40 && rect.left <= promptRectForGenerate.right + 40
          : false;
        const belowPrompt = promptRectForGenerate ? rect.top >= promptRectForGenerate.bottom - 30 : false;
        const distance = promptRectForGenerate
          ? Math.abs(rect.left - promptRectForGenerate.left) + Math.abs(rect.top - promptRectForGenerate.bottom)
          : 0;
        let score = 0;
        if (text.includes('\uC0DD\uC131\uD558\uAE30')) score += 1000;
        if (text.includes('\uC774\uBBF8\uC9C0')) score += 200;
        if (belowPrompt) score += 300;
        if (horizontallyAligned) score += 300;
        score -= distance / 10;
        return { btn, score };
      })
      .sort((a, b) => b.score - a.score)[0]?.btn;
    if (rankedGenerateButton) {
      rankedGenerateButton.click();
      return true;
    }
    const textButton = enabled.find((btn) => {
      const text = `${btn.innerText || ''} ${btn.getAttribute('aria-label') || ''} ${btn.getAttribute('title') || ''}`;
      return /생성|만들|generate|create|submit|send/i.test(text);
    });
    if (textButton) {
      textButton.click();
      return true;
    }

    if (promptEl) {
      const promptRect = promptEl.getBoundingClientRect();
      const nearby = enabled
        .map((btn) => {
          const rect = btn.getBoundingClientRect();
          const distance =
            Math.abs(rect.left - promptRect.right) +
            Math.abs(rect.top + rect.height / 2 - (promptRect.top + promptRect.height / 2));
          return { btn, distance };
        })
        .sort((a, b) => a.distance - b.distance)[0]?.btn;
      if (nearby) {
        nearby.click();
        return true;
      }
    }

    const lastButton = enabled[enabled.length - 1];
    if (lastButton) {
      lastButton.click();
      return true;
    }
    return false;
  });
}

// Dropshot changes its result renderer often.  Some releases expose the final
// image as an <img>, others as blob URLs, CSS backgrounds, or a canvas.
// Capture a broad "before" snapshot so the wait loop can identify only NEW
// image-like outputs after the Generate click.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function collectDropshotCandidateKeys(page: any): Promise<string[]> {
  return await page.evaluate(() => {
    const keys: string[] = [];
    const add = (kind: string, src: string) => {
      if (!src) return;
      keys.push(`${kind}:${src}`);
      keys.push(src);
    };
    const absolutize = (value: string): string => {
      try {
        return new URL(value, window.location.href).href;
      } catch {
        return value;
      }
    };
    const parseSrcset = (value: string | null): string[] =>
      (value || '')
        .split(',')
        .map((part) => part.trim().split(/\s+/)[0])
        .filter(Boolean)
        .map(absolutize);
    const parseCssUrl = (value: string): string => {
      const match = /url\(["']?([^"')]+)["']?\)/i.exec(value || '');
      return match ? absolutize(match[1]) : '';
    };

    Array.from(document.querySelectorAll('img')).forEach((img) => {
      const el = img as HTMLImageElement;
      [el.currentSrc, el.src, ...parseSrcset(el.getAttribute('srcset'))].forEach((src) => add('img', src || ''));
    });
    Array.from(document.querySelectorAll('source[srcset]')).forEach((source) => {
      parseSrcset((source as HTMLSourceElement).getAttribute('srcset')).forEach((src) => add('source', src));
    });
    Array.from(document.querySelectorAll<HTMLElement>('*')).forEach((el) => {
      const bg = window.getComputedStyle(el).backgroundImage;
      const bgUrl = parseCssUrl(bg);
      if (bgUrl) add('background', bgUrl);
    });
    Array.from(document.querySelectorAll('a[href]')).forEach((anchor) => {
      add('link', (anchor as HTMLAnchorElement).href || '');
    });
    Array.from(document.querySelectorAll('canvas')).forEach((canvas) => {
      const el = canvas as HTMLCanvasElement;
      if (el.width < 200 || el.height < 120) return;
      try {
        const data = el.toDataURL('image/png');
        add(`canvas:${el.width}x${el.height}`, data.slice(0, 512));
      } catch {
        // Cross-origin canvases cannot be read; ignore them in the before set.
      }
    });

    return Array.from(new Set(keys));
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function collectStableDropshotCandidateKeys(page: any): Promise<string[]> {
  const collected = new Set<string>();
  let unchangedRounds = 0;

  for (let round = 0; round < 8 && unchangedRounds < 3; round += 1) {
    const beforeSize = collected.size;
    for (const key of await collectDropshotCandidateKeys(page)) collected.add(key);
    unchangedRounds = collected.size === beforeSize ? unchangedRounds + 1 : 0;
    if (unchangedRounds < 3) await new Promise((resolve) => setTimeout(resolve, 350));
  }

  return [...collected];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readFirstNewDropshotImageDataUrl(page: any, beforeKeys: string[]): Promise<string | null> {
  return await page.evaluate(async (before: string[]) => {
    type Candidate = {
      key: string;
      src: string;
      kind: string;
      width: number;
      height: number;
    };

    const beforeSet = new Set(before);
    const candidates: Candidate[] = [];
    const minWidth = 200;
    const minHeight = 120;

    const absolutize = (value: string): string => {
      try {
        return new URL(value, window.location.href).href;
      } catch {
        return value;
      }
    };
    const parseSrcset = (value: string | null): string[] =>
      (value || '')
        .split(',')
        .map((part) => part.trim().split(/\s+/)[0])
        .filter(Boolean)
        .map(absolutize);
    const parseCssUrl = (value: string): string => {
      const match = /url\(["']?([^"')]+)["']?\)/i.exec(value || '');
      return match ? absolutize(match[1]) : '';
    };
    const isVisibleRect = (rect: DOMRect): boolean => rect.width >= minWidth && rect.height >= minHeight;
    const isBadSrc = (src: string): boolean => {
      const lower = String(src || '').toLowerCase();
      return !lower ||
        lower.includes('/icons/') ||
        lower.includes('/icon/') ||
        lower.includes('/sample/') ||
        lower.includes('generation-error-fallback') ||
        lower.includes('error-fallback') ||
        lower.includes('logo') ||
        lower.endsWith('.svg');
    };
    const addUrl = (kind: string, src: string, width: number, height: number): void => {
      const normalizedSrc = absolutize(src || '');
      if (isBadSrc(normalizedSrc)) return;
      if (width < minWidth || height < minHeight) return;
      candidates.push({
        key: `${kind}:${normalizedSrc}`,
        src: normalizedSrc,
        kind,
        width,
        height,
      });
    };

    Array.from(document.querySelectorAll('img')).forEach((img) => {
      const el = img as HTMLImageElement;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return;
      const renderedWidth = rect.width;
      const renderedHeight = rect.height;
      if (!isVisibleRect(rect)) return;
      [el.currentSrc, el.src, ...parseSrcset(el.getAttribute('srcset'))].forEach((src) =>
        addUrl('img', src || '', renderedWidth, renderedHeight),
      );
    });

    Array.from(document.querySelectorAll<HTMLElement>('*')).forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (!isVisibleRect(rect)) return;
      const style = window.getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return;
      const bgUrl = parseCssUrl(style.backgroundImage);
      if (bgUrl) addUrl('background', bgUrl, rect.width, rect.height);
    });

    Array.from(document.querySelectorAll('canvas')).forEach((canvas) => {
      const el = canvas as HTMLCanvasElement;
      const rect = el.getBoundingClientRect();
      const renderedWidth = rect.width;
      const renderedHeight = rect.height;
      if (!isVisibleRect(rect)) return;
      try {
        const data = el.toDataURL('image/png');
        candidates.push({
          key: `canvas:${data.slice(0, 512)}:${renderedWidth}x${renderedHeight}`,
          src: data,
          kind: 'canvas',
          width: renderedWidth,
          height: renderedHeight,
        });
      } catch {
        // Cross-origin canvas; skip.
      }
    });

    const score = (candidate: Candidate): number => {
      const source = candidate.src.toLowerCase();
      let value = candidate.width * candidate.height;
      if (source.startsWith('data:image/')) value += 1_000_000;
      if (source.startsWith('blob:')) value += 900_000;
      if (source.includes('cdn.aistudio.dropshot.io')) value += 800_000;
      if (candidate.kind === 'canvas') value += 700_000;
      return value;
    };

    const ordered = candidates
      .filter((candidate) => !beforeSet.has(candidate.key) && !beforeSet.has(candidate.src))
      .sort((a, b) => score(b) - score(a));

    const toDataUrl = async (src: string): Promise<string | null> => {
      if (src.startsWith('data:image/')) return src;
      if (!src.startsWith('blob:') && !/^https?:\/\//i.test(src)) return null;
      try {
        const response = await fetch(src);
        if (!response.ok) return null;
        const blob = await response.blob();
        if (!blob.type.startsWith('image/')) return null;
        return await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('blob read failed'));
          reader.readAsDataURL(blob);
        });
      } catch {
        return null;
      }
    };

    for (const candidate of ordered) {
      const dataUrl = await toDataUrl(candidate.src);
      if (dataUrl) return dataUrl;
    }
    return null;
  }, beforeKeys);
}

/** Low-level image generation (single prompt, single attempt chain). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function makeDropshotImageInternal(
  prompt: string,
  options: {
    referenceImageList?: string[];
  } = {},
  onLog?: (m: string) => void,
  capturedEpoch = getDropshotGenerationEpoch(),
): Promise<DropshotResult> {
  let lastError: string | null = null;

  const wasAborted = (): boolean => isDropshotGenerationAborted(capturedEpoch);
  const stopAbortedGeneration = async (): Promise<DropshotResult> => {
    onLog?.('[리더스 나노바나나] 이미지 생성 중지 요청을 확인했습니다.');
    await closeAllDropshotContexts().catch(() => undefined);
    return createAbortedResult();
  };

  try {
    if (wasAborted()) return await stopAbortedGeneration();
    const page = await ensurePage(onLog);
    if (wasAborted()) return await stopAbortedGeneration();

    // §12.2 — ensure unlimited mode + counter=1
    await ensureDropshotControls(page, onLog);
    if (wasAborted()) return await stopAbortedGeneration();

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      if (wasAborted()) return await stopAbortedGeneration();
      onLog?.(
        `[리더스 나노바나나] 이미지 생성 중... (시도 ${attempt}/${MAX_RETRIES})`,
      );

      try {
        // 1. Ensure we are on the image workspace. Dropshot can land on /ko home
        // even with a valid session, so use the resilient workspace opener.
        const workspaceReady = await openDropshotImageWorkspace(page, onLog);
        if (wasAborted()) return await stopAbortedGeneration();
        if (!workspaceReady) {
          throw new Error('Dropshot image workspace prompt was not found');
        }
        await ensureDropshotControls(page, onLog);

        // 2. i2i mode — upload reference images via setInputFiles
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
                if (wasAborted()) return await stopAbortedGeneration();
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

        // 3. Fill the visible prompt input. Do not depend on a fixed Korean
        // placeholder because Dropshot changes copy per locale/release.
        await page.waitForSelector(PROMPT_SELECTOR, { timeout: 15000 });
        if (wasAborted()) return await stopAbortedGeneration();
        const promptFilled = await fillVisiblePrompt(page, prompt);
        if (!promptFilled) {
          throw new Error('Dropshot prompt input was not visible');
        }
        await new Promise((r) => setTimeout(r, 1000));
        if (wasAborted()) return await stopAbortedGeneration();
        const expectedPrompt = prompt.replace(/\s+/g, ' ').trim();
        const actualPrompt = (await readVisiblePromptValue(page)).replace(/\s+/g, ' ').trim();
        if (actualPrompt !== expectedPrompt) {
          throw new Error('Dropshot prompt value did not match the requested prompt');
        }
        await ensureDropshotControls(page, onLog);

        // Capture a settled baseline immediately before clicking. Delayed
        // sidebar thumbnails must never be accepted as a generated result.
        const beforeKeys = await collectStableDropshotCandidateKeys(page);

        // 4. Click generate. Prefer text/aria labels, then the nearest enabled
        // button to the prompt, then Enter as a final fallback.
        const clicked = await clickGenerate(page);
        if (!clicked) await page.keyboard.press('Enter');

        // 5. Wait for a newly rendered large result image (max 90 seconds)
        const startTs = Date.now();
        let foundDataUrl: string | null = null;
        while (Date.now() - startTs < 90_000) {
          if (wasAborted()) return await stopAbortedGeneration();
          await new Promise((r) => setTimeout(r, 2000));
          if (wasAborted()) return await stopAbortedGeneration();

          if (Date.now() - startTs >= 5_000) {
            const generationError = await readDropshotGenerationError(page);
            if (generationError) {
              throw new Error(`Dropshot generation failed: ${generationError}`);
            }
          }

          const broadDataUrl = await readFirstNewDropshotImageDataUrl(page, beforeKeys);
          if (broadDataUrl) {
            foundDataUrl = broadDataUrl;
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
        if (wasAborted()) return await stopAbortedGeneration();
        lastError = sanitizeDropshotErrorMessage(e, 300) || '이미지 생성 중 오류가 발생했습니다.';
        onLog?.(`[리더스 나노바나나] 시도 ${attempt} 실패: ${lastError}`);
        if (
          lastError &&
          (lastError.includes('Target closed') ||
            lastError.includes('WebSocket'))
        ) {
          await invalidateBrowserCache();
        }
      }
    }

    return { ok: false, dataUrl: '', error: lastError || 'unknown' };
  } catch (e) {
    if (wasAborted()) return await stopAbortedGeneration();
    return {
      ok: false,
      dataUrl: '',
      error: sanitizeDropshotErrorMessage(e, 300) || '이미지 생성 중 오류가 발생했습니다.',
    };
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
  if (!tryBeginDropshotGeneration()) {
    const error = '로그인 또는 로그인 확인이 진행 중입니다. 완료 후 이미지를 다시 생성해주세요.';
    onLog?.(`[리더스 나노바나나] ${error}`);
    return { ok: false, dataUrl: '', error };
  }

  try {
    const capturedEpoch = getDropshotGenerationEpoch();
    const next = getGenerationChain().then(() =>
      makeDropshotImageInternal(prompt, options, onLog, capturedEpoch),
    );
    // Prevent one failure from blocking the chain.
    setGenerationChain(next.catch(() => undefined as unknown));
    return await next;
  } finally {
    endDropshotGeneration();
  }
}
