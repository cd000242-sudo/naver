// src/automation/naverUploadRejection.ts
// [2026-10-09] 네이버 업로드 거부창("파일 전송 오류") 감지. 종전 ':is(:text(...))' 는 Playwright 문법이라
//   Puppeteer 에선 늘 null 이었다(감지 0회). DOM 글자를 직접 탐색하고, 본문·제목의 같은 글자는 오탐 방지로 제외한다.

/** 실측된 문구 하나만 쓴다 — 넓히면 본문 글자와 겹쳐 오탐이 난다. */
export const NAVER_UPLOAD_REJECTION_PHRASES: readonly string[] = Object.freeze(['파일 전송 오류']);

/**
 * frame.evaluate 로 직렬화된다 — 자기완결이어야 한다(바깥 식별자 금지).
 * 선례: typingFallbackPlan.readEditorBodyText
 */
export function scanUploadRejectionInPage(phrases: readonly string[], dismiss: boolean): string | null {
  const body = document.body;
  if (!body) return null;
  const all = body.textContent || '';
  if (!phrases.some((p) => all.includes(p))) return null;

  const editing = '[contenteditable], .se-components-wrap, .se-documentTitle, .se-component, .se-main-container';
  const boxSelector = '[role="dialog"], [role="alertdialog"], dialog, [class*="popup"], [class*="layer"], [class*="modal"], [class*="alert"]';
  const isHidden = (start: Element): boolean => {
    for (let el: Element | null = start; el; el = el.parentElement) {
      const style = window.getComputedStyle(el as HTMLElement);
      if (style.display === 'none' || style.visibility === 'hidden') return true;
      if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return true;
    }
    return false;
  };

  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const value = node.nodeValue || '';
    if (!phrases.some((p) => value.includes(p))) continue;
    const parent = node.parentElement;
    if (!parent || parent.closest(editing)) continue;

    // 가장 가까운 알림창 상자에서 시작해 글자 300자 이하·편집 영역 미포함인 동안만 바깥으로 넓힌다.
    let box: Element | null = parent.closest(boxSelector);
    if (!box) continue;
    for (;;) {
      const outer: Element | null = box.parentElement ? box.parentElement.closest(boxSelector) : null;
      if (!outer || (outer.textContent || '').length > 300 || outer.querySelector(editing)) break;
      box = outer;
    }
    if ((box.textContent || '').length > 300 || box.querySelector(editing)) continue;
    if (isHidden(box)) continue;

    if (dismiss) {
      const buttons = Array.from(box.querySelectorAll('button, [role="button"], a'));
      const ok = buttons.find((b) => ['확인', '닫기', 'OK'].includes((b.textContent || '').trim()));
      if (ok) (ok as HTMLElement).click();
    }
    return (box.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  }
  return null;
}

/** 프레임·페이지 어디서든 한 곳이라도 보이면 그 글자를 돌려준다. 평가 오류·프레임 분리는 null(못 봤다). */
export async function readNaverUploadRejection(
  targets: readonly unknown[],
  dismiss = false,
): Promise<string | null> {
  for (const target of targets) {
    try {
      const shown = await (target as any)?.evaluate?.(scanUploadRejectionInPage, NAVER_UPLOAD_REJECTION_PHRASES, dismiss);
      if (typeof shown === 'string' && shown) return shown;
    } catch {
      /* 못 봤다 — 종전 재시도 흐름 */
    }
  }
  return null;
}
