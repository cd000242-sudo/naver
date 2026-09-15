// src/renderer/modules/headingControlPanel.ts
// [2026-09-09] 반자동 편집에서 소제목을 사용자가 직접 정하는 패널.
//
// 사장님 요청: "붙여넣기하면 소제목을 알아서 분석하지만 내 의도와 다른 내용을 소제목으로
// 지정해놨더라고. 내가 소제목을 정할 수 있게 못하니?" — 그리고 "1번 2번 전부다".
//   1번 목록형: 감지된 소제목을 리스트로 고치고 지운다
//   2번 본문형: 본문에서 커서가 있는 줄을 소제목으로 지정한다
//
// 둘 다 결국 본문의 "## " 표기를 고치는 일이라, 본문 하나만 원천으로 두면 어긋날 수 없다.
// 모든 모드 공용이다 — 반자동 편집 영역은 사진·SEO·홈판·쇼핑 어디서나 같은 화면이다.

import {
  applyDetectedHeadings,
  lineIndexAtOffset,
  listHeadingLines,
  markSelectionAsHeading,
  renameHeadingLine,
  toggleHeadingLine,
} from '../utils/headingMarkup.js';
import {
  extractSemiAutoDocumentFromBody,
  extractSemiAutoHeadingsFromBody,
} from '../utils/semiAutoHeadingExtractor.js';

// 인라인 번들 단일 스코프에서 렌더러 전역으로 해결된다(contentGeneration.ts 와 같은 방식).
declare function syncIntegratedPreviewFromInputs(): void;
/*
 * [2026-09-11] 이 둘은 fullAutoFlow.ts 의 최상위 함수라 인라인 번들의 같은 스코프에서 풀린다.
 * window 에는 올라가지 않는다. 예전에 (window as any).updateUnifiedPreview 로 찾다가 항상
 * undefined 였고, typeof 검사에 걸려 **미리보기 갱신이 조용히 건너뛰어졌다** — 적용 버튼을
 * 눌러도 아무 일도 일어나지 않던 이유다. 다른 모듈들과 같은 방식으로 직접 부른다.
 */
declare function updateUnifiedPreview(content: any): void;
declare function updateUnifiedImagePreview(headings: any[], images: any[]): void;
/*
 * 이미지 관리 탭의 소제목 카드는 이 함수만 다시 그린다(headingImageGen.ts, 같은 번들 스코프).
 * 적용은 본문을 바꾸지 않으므로 input 이벤트가 나지 않고, 그래서 이미지 탭은 적용 이전의
 * 분석 결과를 그대로 들고 있었다 — 소제목 패널 6개, 이미지 탭 9개가 갈리던 이유다.
 */
declare function autoAnalyzeHeadings(content: any, options?: { localOnly?: boolean }): Promise<void>;

const HEADING_PANEL_IDS = {
  body: 'unified-generated-content',
  panel: 'heading-control-panel',
  list: 'heading-list',
  markBtn: 'heading-mark-current-line',
  applyBtn: 'heading-apply-detected',
  applyPreviewBtn: 'heading-apply-to-preview',
  lockBadge: 'heading-lock-badge',
} as const;

function headingPanelById<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function getBodyTextarea(): HTMLTextAreaElement | null {
  return headingPanelById<HTMLTextAreaElement>(HEADING_PANEL_IDS.body);
}

function escapeHeadingText(value: string): string {
  return String(value || '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string
  ));
}

/**
 * 사용자가 소제목을 손댔다고 표시한다.
 *
 * 이 표시가 있으면 rebuildHeadingsFromPreferredBody 가 자동 재추출을 건너뛴다.
 * 표시가 없으면 예전처럼 휴리스틱이 돈다 — 손대지 않은 사용자의 동작은 그대로다.
 */
function markUserOwned(): void {
  const content = (window as any).currentStructuredContent;
  if (content && typeof content === 'object') {
    content.headingsLockedByUser = true;
  }
  const badge = headingPanelById(HEADING_PANEL_IDS.lockBadge);
  if (badge) badge.style.display = 'inline';
}

/** 본문을 바꾸고, 화면과 상태를 함께 갱신한다. */
function writeBody(next: string, options: { userEdit?: boolean } = {}): void {
  const textarea = getBodyTextarea();
  if (!textarea) return;
  if (textarea.value === next) return;

  textarea.value = next;
  if (options.userEdit !== false) markUserOwned();

  // 다른 모듈(미리보기·저장)이 input 을 듣고 있으므로 알려 준다.
  try {
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  } catch { /* 이벤트 생성 실패는 무시 — 화면 갱신은 아래에서 한다 */ }

  renderHeadingList();

  /*
   * [2026-09-15 사장님] "반자동 편집이랑 소제목 미리보기는 한 몸이어야 돼.
   * 수정하면 똑같이 수정돼서 바로바로 보여줘야 돼."
   *
   * 지정·해제·이름 수정을 누르는 즉시 미리보기와 이미지 탭까지 같은 소제목이 된다.
   * 적용 버튼은 이제 확인용이다 — 누르지 않아도 어긋나지 않는다.
   */
  if (options.userEdit !== false) applyEditedHeadingsToPreview({ silent: true });
}

/** 본문의 표기된 소제목을 목록으로 그린다. */
export function renderHeadingList(): void {
  const list = headingPanelById(HEADING_PANEL_IDS.list);
  const textarea = getBodyTextarea();
  if (!list || !textarea) return;

  const badge = headingPanelById(HEADING_PANEL_IDS.lockBadge);
  if (badge) badge.style.display = textarea.value.trim() && (window as any).currentStructuredContent?.headingsLockedByUser === true ? 'inline' : 'none';

  const headings = listHeadingLines(textarea.value);
  if (headings.length === 0) {
    list.innerHTML =
      '<div style="font-size: 0.8rem; color: var(--text-muted);">'
      + '지정된 소제목이 없습니다. 본문 줄에 커서를 두고 위 버튼을 누르거나, '
      + '"자동 감지 결과 불러오기"로 시작하세요.</div>';
    return;
  }

  list.innerHTML = headings
    .map((heading, order) => (
      `<div style="display: flex; align-items: center; gap: 0.4rem;">`
      + `<span style="font-size: 0.75rem; color: var(--text-muted); min-width: 1.3rem;">${order + 1}.</span>`
      + `<input type="text" data-heading-line="${heading.lineIndex}" value="${escapeHeadingText(heading.title)}" `
      + `style="flex: 1; min-width: 0; padding: 0.4rem 0.55rem; background: var(--bg-primary); `
      + `border: 1px solid var(--border-medium); border-radius: 6px; color: var(--text-strong); font-size: 0.83rem;" />`
      + `<button type="button" data-heading-unmark="${heading.lineIndex}" title="소제목 해제 (글은 남습니다)" `
      + `style="padding: 0.35rem 0.55rem; background: transparent; border: 1px solid var(--border-medium); `
      + `border-radius: 6px; color: var(--text-muted); cursor: pointer; font-size: 0.78rem;">해제</button>`
      + `</div>`
    ))
    .join('');

  list.querySelectorAll<HTMLInputElement>('input[data-heading-line]').forEach((input) => {
    input.addEventListener('change', () => {
      const lineIndex = Number(input.dataset.headingLine);
      const body = getBodyTextarea()?.value ?? '';
      writeBody(renameHeadingLine(body, lineIndex, input.value));
    });
  });

  list.querySelectorAll<HTMLButtonElement>('button[data-heading-unmark]').forEach((button) => {
    button.addEventListener('click', () => {
      const lineIndex = Number(button.dataset.headingUnmark);
      const body = getBodyTextarea()?.value ?? '';
      writeBody(toggleHeadingLine(body, lineIndex));
    });
  });
}

/**
 * 편집한 본문을 미리보기·발행이 쓰는 상태(currentStructuredContent)에 그대로 굳힌다.
 *
 * 사장님 요청: "자동 감지 결과 불러오기로 불러와서 수정하고 적용하기 버튼이 누락됐다.
 * 적용되면 위에 반자동 편집과 미리보기에도 정확하게 적용되어야 한다. 수정하고 적용했으면
 * 그대로 적용한 상태로 발행까지 완벽히 되어야 한다."
 *
 * 왜 버튼이 필요한가: 패널은 본문의 "## " 표기만 고쳤고, 미리보기와 발행이 읽는
 * structuredContent.headings 는 자동 감지 시절 값 그대로였다. 표기를 손대면 자동 재추출을
 * 막으므로(headingsLockedByUser), 아무도 headings 를 다시 세우지 않는 구멍이 생긴다.
 * 이 함수가 그 구멍을 메운다 — 본문 표기가 유일한 원천이고, 나머지는 거기서 파생된다.
 */
export function applyEditedHeadingsToPreview(options: { silent?: boolean } = {}): boolean {
  const textarea = getBodyTextarea();
  if (!textarea) return false;

  let body = textarea.value || '';
  if (!body.trim()) {
    try { (window as any).toastManager?.warning?.('적용할 본문이 없습니다.'); } catch { /* ignore */ }
    return false;
  }

  const content = (window as any).currentStructuredContent;
  if (!content || typeof content !== 'object') {
    try { (window as any).toastManager?.warning?.('적용할 글이 없습니다. 먼저 글을 생성하거나 불러오세요.'); } catch { /* ignore */ }
    return false;
  }

  /*
   * [2026-09-15 사장님 실측] 붙여넣은 직후에는 본문에 "## " 표기가 하나도 없다. 소제목은
   * 휴리스틱이 잡아 미리보기에만 떠 있는 상태다. 여기서 적용을 누르면 표기 기준 추출이
   * 0개를 돌려줘 **소제목이 통째로 지워졌다** — 미리보기 카드가 사라지고 본문이 한 덩어리가
   * 되며, 그대로 발행하면 이미지 삽입 지점도 0개가 된다.
   *
   * 적용은 "화면에 보이는 것을 굳히는" 버튼이지 지우는 버튼이 아니다. 아직 패널을 한 번도
   * 건드리지 않은 글이면(잠금 없음) 감지된 소제목을 표기로 먼저 굳힌 뒤 적용한다.
   * 사용자가 직접 전부 해제한 경우(잠금 있음)는 의도이므로 0개 그대로 둔다.
   */
  if (listHeadingLines(body).length === 0 && content.headingsLockedByUser !== true) {
    const detected = extractSemiAutoHeadingsFromBody(body)
      .map((heading) => String(heading.title || '').trim())
      .filter(Boolean);
    if (detected.length > 0) {
      const marked = applyDetectedHeadings(body, detected);
      if (marked !== body) {
        // writeBody 는 다시 이 함수를 부르므로 여기서는 본문만 직접 갱신한다.
        textarea.value = marked;
        body = marked;
        try {
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
        } catch { /* 이벤트 실패는 무시 — 아래에서 상태를 직접 세운다 */ }
      }
    }
  }

  const document_ = extractSemiAutoDocumentFromBody(body, { markedOnly: true });

  const titleInput = headingPanelById<HTMLInputElement>('unified-generated-title');
  if (titleInput && titleInput.value.trim()) content.selectedTitle = titleInput.value.trim();

  content.bodyPlain = body;
  content.content = body;
  content.introduction = document_.introduction;
  content.conclusion = '';
  content.headings = document_.headings.map((heading) => ({
    title: heading.title,
    content: heading.content,
    prompt: heading.prompt || heading.title,
    source: 'user:heading-panel',
  }));
  /*
   * 발행 경로(resolveSemiAutoPublishStructure)는 "기존 소제목이 더 많으면 그쪽으로 복구"하는
   * 사다리를 갖고 있다. 위에서 headings 를 본문 표기와 같게 맞췄으므로 그 사다리가 사용자의
   * 지정을 되돌릴 근거가 사라진다. 잠금은 유지해 휴리스틱 재추출도 막는다.
   */
  content.headingsLockedByUser = true;
  content._bodyManuallyEdited = true;

  /*
   * updateUnifiedPreview 는 미리보기 영역을 펼치면서 테두리를 깜빡이고 그 자리로 스크롤한다.
   * 버튼을 누를 때마다 화면이 튀면 편집을 못 하므로, 자동 반영에서는 부르지 않는다.
   * 내용 자체는 아래 재분석과 편집 미리보기 동기화가 그린다.
   */
  if (options.silent !== true) {
    try {
      if (typeof updateUnifiedPreview === 'function') updateUnifiedPreview(content);
    } catch (error) {
      console.warn('[HeadingPanel] 통합 미리보기 갱신 실패:', (error as Error)?.message);
    }
  }
  /*
   * 이미지 관리 탭과 미리보기를 같은 원천(방금 굳힌 content.headings)으로 다시 그린다.
   * localOnly 라서 LLM 프롬프트 호출 없이 화면만 즉시 맞춘다. 예전처럼 빈 배열로
   * updateUnifiedImagePreview 만 부르면 이미 만들어 둔 이미지가 미리보기에서 사라졌다.
   */
  let refreshedByAnalysis = false;
  try {
    if (typeof autoAnalyzeHeadings === 'function') {
      refreshedByAnalysis = true;
      void Promise.resolve(autoAnalyzeHeadings(content, { localOnly: true })).catch((error) => {
        console.warn('[HeadingPanel] 소제목 재분석 실패:', (error as Error)?.message);
      });
    }
  } catch (error) {
    refreshedByAnalysis = false;
    console.warn('[HeadingPanel] 소제목 재분석 호출 실패:', (error as Error)?.message);
  }
  if (!refreshedByAnalysis) {
    try {
      if (typeof updateUnifiedImagePreview === 'function') updateUnifiedImagePreview(content.headings, []);
    } catch (error) {
      console.warn('[HeadingPanel] 이미지 미리보기 갱신 실패:', (error as Error)?.message);
    }
  }
  try {
    syncIntegratedPreviewFromInputs();
  } catch (error) {
    console.warn('[HeadingPanel] 편집 미리보기 동기화 실패:', (error as Error)?.message);
  }

  renderHeadingList();
  // 자동 반영까지 토스트를 띄우면 클릭마다 알림이 쌓인다 — 버튼을 누른 때만 알린다.
  if (options.silent !== true) {
    try {
      (window as any).toastManager?.success?.(`✅ 소제목 ${content.headings.length}개를 적용했습니다.`);
    } catch { /* ignore */ }
  }
  return true;
}

export function initHeadingControlPanel(): void {
  const panel = headingPanelById(HEADING_PANEL_IDS.panel);
  if (!panel || (panel as any).__bound) return;
  (panel as any).__bound = true;

  // 2번 — 드래그로 고른 만큼(없으면 커서가 있는 줄 전체)을 소제목으로 지정/해제
  headingPanelById<HTMLButtonElement>(HEADING_PANEL_IDS.markBtn)?.addEventListener('click', () => {
    const textarea = getBodyTextarea();
    if (!textarea) return;
    /*
     * [2026-09-10 사장님] "커서로 원하는 만큼 드래그하면 그만큼만 소제목이 되어야 합니다."
     * 드래그가 있으면 그 글자만 떼어내고, 없을 때만 예전처럼 줄 전체를 토글한다.
     */
    const selectionStart = textarea.selectionStart ?? 0;
    const selectionEnd = textarea.selectionEnd ?? selectionStart;
    const fromSelection = markSelectionAsHeading(textarea.value, selectionStart, selectionEnd);
    const next = fromSelection
      ?? toggleHeadingLine(textarea.value, lineIndexAtOffset(textarea.value, selectionStart));
    if (next === textarea.value) {
      try { (window as any).toastManager?.warning?.('빈 줄은 소제목으로 지정할 수 없습니다.'); } catch { /* ignore */ }
      return;
    }
    writeBody(next);
    // 커서를 그 줄에 되돌려 둔다 — 연속으로 지정할 때 매번 다시 클릭하지 않게.
    try { textarea.focus(); } catch { /* ignore */ }
  });

  // 자동 감지 결과를 표기로 굳혀 사용자가 고칠 수 있게 한다
  headingPanelById<HTMLButtonElement>(HEADING_PANEL_IDS.applyBtn)?.addEventListener('click', () => {
    const textarea = getBodyTextarea();
    if (!textarea) return;
    const detected = extractSemiAutoHeadingsFromBody(textarea.value)
      .map((heading) => String(heading.title || '').trim())
      .filter(Boolean);
    if (detected.length === 0) {
      try { (window as any).toastManager?.info?.('자동으로 감지된 소제목이 없습니다.'); } catch { /* ignore */ }
      return;
    }
    const next = applyDetectedHeadings(textarea.value, detected);
    if (next === textarea.value) {
      try { (window as any).toastManager?.info?.('이미 표기되어 있습니다.'); } catch { /* ignore */ }
      return;
    }
    writeBody(next);
  });

  // 편집한 결과를 미리보기·발행 상태에 굳힌다
  headingPanelById<HTMLButtonElement>(HEADING_PANEL_IDS.applyPreviewBtn)
    ?.addEventListener('click', () => { applyEditedHeadingsToPreview(); });

  // 사용자가 본문을 직접 고칠 때도 목록을 따라가게 한다(표기를 손으로 붙이는 경우).
  getBodyTextarea()?.addEventListener('input', () => renderHeadingList());

  // 다른 모듈(fillSemiAutoFields)이 본문을 채운 뒤 부를 수 있게 창구를 연다.
  try { (window as any).renderHeadingList = renderHeadingList; } catch { /* ignore */ }

  renderHeadingList();
}
