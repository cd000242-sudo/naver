// src/automation/imageCaption.ts
// 방금 삽입한 이미지의 네이버 "사진 설명" 칸에 출처 문구를 넣는다.
//
// [2026-10-01 사용자 요청 "이미지마다 출처를 입력하면 자동으로 들어가게"]
// 종전 applyCaption 은 frame.$(selector) 로 문서의 '첫 번째' 캡션 칸을 집었다.
// 이미지가 여러 장이면 2번째 이후 사진의 출처가 모두 1번 사진에 겹쳐 들어간다.
// 게다가 그 함수는 아무도 호출하지 않는 insertImages() 안에만 배선돼 있어서
// 한 번도 라이브에서 돈 적이 없다(실제 발행 경로는 insertImagesAtCurrentCursor).
//
// 그래서 "마지막 이미지 컴포넌트" 를 찾아 그 안의 캡션 칸만 물리 클릭하고 타이핑한다.
// 물리 클릭은 setImageSizeAndAttachLink 가 쓰는 검증된 방식과 같다 — DOM 에 글자를
// 직접 써 넣으면 에디터 문서 모델에 반영되지 않을 수 있다.
//
// [2026-10-13 live log 10/11 02:46] Every image logged "사진 설명 칸을 찾지 못해" — the caption element
//   exists but is zero-height until the image component is selected (richTextPaste relies on that same
//   fact). So when the caption is present-but-hidden, select the image with a physical click, re-measure,
//   and as a last resort click the strip right under the image where the caption line appears.

import { safeKeyboardType } from './typingUtils.js';

/** 캡션 칸 후보. 네이버 UI 가 바뀌어도 하나만 맞으면 된다. */
const CAPTION_SELECTORS = [
  '.se-caption-input input',
  '.se-caption-textarea textarea',
  '.se-image-caption input',
  '.se-caption .se-text-paragraph',
  '.se-caption',
  '.se-module-caption',
  '[class*="caption"]',
];

/** 이미지 컴포넌트 후보 — 마지막 것이 방금 넣은 이미지다. */
const IMAGE_COMPONENT_SELECTORS = [
  '.se-component.se-image',
  '.se-component.se-imageStrip',
  '.se-module-image',
];

interface CaptionTarget {
  readonly found: boolean;
  readonly x: number;
  readonly y: number;
  readonly selector: string;
  /** Caption node exists but is not laid out yet (0 height) — select the image first. */
  readonly hidden?: boolean;
  /** Last image's center / bottom edge (frame coordinates) for the select-then-retry clicks. */
  readonly image?: { x: number; y: number; left: number; bottom: number };
  /** Class names seen under the component that mention "caption" — logged when nothing matched. */
  readonly captionClasses?: string[];
}

const MISS: CaptionTarget = { found: false, x: 0, y: 0, selector: '' };

/** iframe 안의 좌표를 페이지 좌표로 옮기기 위한 오프셋. */
async function resolveFrameOffset(page: any): Promise<{ x: number; y: number }> {
  try {
    const frameElement = await page.$('iframe#mainFrame, iframe.se-iframe, iframe[name="mainFrame"]');
    if (!frameElement) return { x: 0, y: 0 };
    const rect = await frameElement.boundingBox();
    return rect ? { x: rect.x, y: rect.y } : { x: 0, y: 0 };
  } catch {
    return { x: 0, y: 0 };
  }
}

/** Runs inside the editor frame: last image component → its caption box (visible or hidden) + image geometry. */
function locateCaptionInPage(args: { componentSelectors: string[]; captionSelectors: string[] }): CaptionTarget {
  const miss = { found: false, x: 0, y: 0, selector: '' };
  let component: Element | null = null;
  for (const selector of args.componentSelectors) {
    const nodes = document.querySelectorAll(selector);
    if (nodes.length > 0) {
      component = nodes[nodes.length - 1];
      break;
    }
  }
  if (!component) {
    const imgs = document.querySelectorAll('img.se-image-resource, img[src*="blogfiles"], img[src*="postfiles"]');
    const lastImg = imgs[imgs.length - 1] as HTMLElement | undefined;
    component = lastImg?.closest('.se-component') || null;
  }
  if (!component) return miss;

  const img = component.querySelector('img') as HTMLElement | null;
  const imgRect = img ? img.getBoundingClientRect() : null;
  const image = imgRect && imgRect.width > 4 && imgRect.height > 4
    ? { x: imgRect.left + imgRect.width / 2, y: imgRect.top + imgRect.height / 2, left: imgRect.left, bottom: imgRect.bottom }
    : undefined;

  let hiddenSelector = '';
  for (const selector of args.captionSelectors) {
    const node = component.querySelector(selector) as HTMLElement | null;
    if (!node) continue;
    node.scrollIntoView({ block: 'center' });
    const rect = node.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) {
      if (!hiddenSelector) hiddenSelector = selector;
      continue;
    }
    return { found: true, x: rect.left + Math.min(rect.width / 2, 120), y: rect.top + rect.height / 2, selector, image };
  }
  const captionClasses = Array.from(component.querySelectorAll('*'))
    .map((el) => String((el as HTMLElement).className || ''))
    .filter((name) => /caption/i.test(name))
    .slice(0, 6);
  return { ...miss, hidden: Boolean(hiddenSelector), selector: hiddenSelector, image, captionClasses };
}

async function locate(frame: any): Promise<CaptionTarget> {
  return frame.evaluate(locateCaptionInPage, {
    componentSelectors: [...IMAGE_COMPONENT_SELECTORS],
    captionSelectors: [...CAPTION_SELECTORS],
  }).catch(() => MISS);
}

/**
 * Caption boxes are zero-height until the image is selected: click the image, re-measure, then try the
 * strip right under the image. Returns the first visible target, or the last miss.
 */
async function revealCaption(self: any, page: any, frame: any, offset: { x: number; y: number }, first: CaptionTarget): Promise<CaptionTarget> {
  if (first.found || !first.image) return first;
  await page.mouse.click(offset.x + first.image.x, offset.y + first.image.y);
  await self.delay(400);
  const afterSelect = await locate(frame);
  if (afterSelect.found) return afterSelect;
  const image = afterSelect.image || first.image;
  await page.mouse.click(offset.x + image.left + 24, offset.y + image.bottom + 14);
  await self.delay(300);
  const afterStrip = await locate(frame);
  return afterStrip.found ? afterStrip : { ...afterStrip, image };
}

/**
 * 출처 문구를 마지막으로 삽입된 이미지의 사진 설명 칸에 넣는다.
 * 실패해도 던지지 않는다 — 캡션은 선택 요소이고, 여기서 발행을 멈출 이유가 없다.
 * @returns 입력이 확인되면 true
 */
export async function applyCaptionToLastImage(self: any, caption: string): Promise<boolean> {
  const text = String(caption || '').trim();
  if (!text) return false;

  try {
    const page = self.ensurePage();
    const frame = await self.getAttachedFrame();
    const offset = await resolveFrameOffset(page);

    // 1. 마지막 이미지 컴포넌트의 캡션 칸을 화면에 올리고 좌표를 받는다(숨겨져 있으면 이미지를 선택해 드러낸다).
    const target = await revealCaption(self, page, frame, offset, await locate(frame));
    if (!target.found) {
      const seen = target.captionClasses && target.captionClasses.length > 0 ? ` · 보인 클래스: ${target.captionClasses.join(', ')}` : '';
      self.log(`   ℹ️ 사진 설명 칸을 찾지 못해 출처를 건너뜁니다 (발행은 계속)${target.hidden ? ' · 칸은 있으나 펼쳐지지 않음' : ''}${seen}.`);
      return false;
    }

    await self.delay(300);

    // 2. 물리 클릭으로 캡션 칸에 포커스를 준다.
    await page.mouse.click(offset.x + target.x, offset.y + target.y);
    await self.delay(400);

    // 3. 타이핑. 에디터 입력 핸들러를 통과해야 문서 모델에 남는다.
    await safeKeyboardType(page, text, { delay: 25 });
    await self.delay(300);

    // 4. 들어갔는지 확인한다 — "넣었다" 는 로그만 남기고 비어 있는 상태를 막는다.
    const verified = await frame.evaluate(
      (args: { selector: string; expected: string }) => {
        const nodes = document.querySelectorAll(args.selector);
        const node = nodes[nodes.length - 1] as HTMLElement | null;
        if (!node) return false;
        const value = (node as HTMLInputElement).value ?? node.textContent ?? '';
        return String(value).includes(args.expected);
      },
      { selector: target.selector, expected: text },
    ).catch(() => false);

    if (verified) {
      self.log(`   📝 출처를 사진 설명에 입력했습니다: ${text}`);
    } else {
      self.log(`   ⚠️ 출처 입력을 확인하지 못했습니다 (발행은 계속): ${text}`);
    }
    return verified === true;
  } catch (error) {
    self.log(`   ⚠️ 출처 입력 실패 (발행은 계속): ${(error as Error).message}`);
    return false;
  }
}
