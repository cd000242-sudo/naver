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

import { safeKeyboardType } from './typingUtils.js';

/** 캡션 칸 후보. 네이버 UI 가 바뀌어도 하나만 맞으면 된다. */
const CAPTION_SELECTORS = [
  '.se-caption-input input',
  '.se-caption-textarea textarea',
  '.se-image-caption input',
  '.se-caption .se-text-paragraph',
  '.se-caption',
  '.se-module-caption',
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
}

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

    // 1. 마지막 이미지 컴포넌트의 캡션 칸을 화면에 올리고 좌표를 받는다.
    const target: CaptionTarget = await frame.evaluate(
      (args: { componentSelectors: string[]; captionSelectors: string[] }) => {
        const miss = { found: false, x: 0, y: 0, selector: '' };

        let component: Element | null = null;
        for (const selector of args.componentSelectors) {
          const nodes = document.querySelectorAll(selector);
          if (nodes.length > 0) {
            component = nodes[nodes.length - 1];
            break;
          }
        }
        // 컴포넌트를 못 찾으면 마지막 이미지의 조상에서 되짚는다.
        if (!component) {
          const imgs = document.querySelectorAll('img.se-image-resource, img[src*="blogfiles"], img[src*="postfiles"]');
          const lastImg = imgs[imgs.length - 1] as HTMLElement | undefined;
          component = lastImg?.closest('.se-component') || null;
        }
        if (!component) return miss;

        for (const selector of args.captionSelectors) {
          const node = component.querySelector(selector) as HTMLElement | null;
          if (!node) continue;
          node.scrollIntoView({ block: 'center' });
          const rect = node.getBoundingClientRect();
          // 캡션 칸은 포커스 전에 높이가 0일 수 있다 — 그 경우 이미지 바로 아래를 노린다.
          if (rect.width < 4 || rect.height < 4) continue;
          return {
            found: true,
            x: rect.left + Math.min(rect.width / 2, 120),
            y: rect.top + rect.height / 2,
            selector,
          };
        }
        return miss;
      },
      { componentSelectors: [...IMAGE_COMPONENT_SELECTORS], captionSelectors: [...CAPTION_SELECTORS] },
    ).catch(() => ({ found: false, x: 0, y: 0, selector: '' }));

    if (!target.found) {
      self.log('   ℹ️ 사진 설명 칸을 찾지 못해 출처를 건너뜁니다 (발행은 계속).');
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
