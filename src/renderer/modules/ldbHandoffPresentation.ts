interface LdbDisplayedDraft { images?: Array<{ heading: string }> }

/** Route through the existing tab handlers; never invoke generation or publication. */
export function revealLdbDraft(post: LdbDisplayedDraft, doc: Document): void {
  const images = post.images || [];
  const hasImages = images.length > 0;
  const tab = doc.querySelector<HTMLElement>(`.tab-button[data-tab="${hasImages ? 'images' : 'unified'}"]`);
  const subtab = doc.querySelector<HTMLElement>(hasImages ? '#images-subtab-manage' : '.pub-mode-tab[data-pubmode="single"]');
  const target = doc.getElementById(hasImages ? 'prompts-container' : 'unified-semi-auto-section');
  if (!tab || !subtab || !target) throw new Error('원고를 받을 앱 화면이 준비되지 않았습니다. 앱을 다시 열어주세요.');
  if (hasImages) {
    const items = Array.from(target.querySelectorAll<HTMLElement>('.prompt-item'));
    for (const image of images) {
      const item = items.find(value => value.dataset.headingTitle === image.heading);
      if (!item?.querySelector<HTMLImageElement>('.generated-image img')?.getAttribute('src')) {
        throw new Error('이미지 미리보기를 배치하지 못했습니다. 앱을 다시 열고 전송을 다시 눌러주세요.');
      }
    }
  }
  tab.click();
  subtab.click();
  if (!tab.classList.contains('active')) throw new Error('앱 수신 화면으로 이동하지 못했습니다. 앱을 다시 열어주세요.');
  target.tabIndex = -1;
  target.setAttribute('aria-label', hasImages ? '전송받은 소제목별 이미지와 프롬프트' : '전송받은 원고 반자동 편집');
  target.scrollIntoView({ behavior: 'instant', block: 'start' });
  target.focus({ preventScroll: true });
}

/**
 * 확장에서 온 원고는 임시저장 전용이다(2026-10-21). 반자동 발행 버튼의 기본값은 '즉시'라서,
 * 그대로 누르면 확장이 draft 로 보낸 글이 공개 발행됐다. 기존 '📝 임시' 버튼 경로로 바꾸고 확인한다.
 */
export function selectLdbDraftPublishMode(doc: Document): void {
  const draft = doc.querySelector<HTMLElement>('.publish-mode-btn[data-mode="draft"]');
  const hidden = doc.getElementById('unified-publish-mode') as HTMLInputElement | null;
  if (!draft || !hidden) throw new Error('임시저장 발행 방식을 찾지 못했습니다. 앱을 다시 열어주세요.');
  draft.click();
  if (hidden.value !== 'draft') throw new Error('발행 방식을 임시저장으로 바꾸지 못했습니다. 앱을 다시 열어주세요.');
}

/**
 * 2026-11-10: press the existing "✅ 적용" handler for a freshly received draft so the user
 * does not have to. A failure must not reject the handoff — the draft is already stored and
 * shown — so every problem falls back to the manual button with a log line.
 */
export function autoApplyLdbDraftHeadings(apply: () => boolean, log: (message: string) => void): boolean {
  try {
    if (apply()) {
      log('✅ 소제목을 자동으로 적용했습니다.');
      return true;
    }
    log('ℹ️ 자동 적용을 하지 않았습니다. 원고를 확인한 뒤 앱에서 ✅ 적용을 눌러 주세요.');
  } catch (error) {
    log('⚠️ 소제목 자동 적용에 실패했습니다. 앱에서 ✅ 적용을 눌러 주세요.');
  }
  return false;
}
