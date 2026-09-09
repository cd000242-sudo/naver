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
  renameHeadingLine,
  toggleHeadingLine,
} from '../utils/headingMarkup.js';
import { extractSemiAutoHeadingsFromBody } from '../utils/semiAutoHeadingExtractor.js';

const HEADING_PANEL_IDS = {
  body: 'unified-generated-content',
  panel: 'heading-control-panel',
  list: 'heading-list',
  markBtn: 'heading-mark-current-line',
  applyBtn: 'heading-apply-detected',
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
}

/** 본문의 표기된 소제목을 목록으로 그린다. */
export function renderHeadingList(): void {
  const list = headingPanelById(HEADING_PANEL_IDS.list);
  const textarea = getBodyTextarea();
  if (!list || !textarea) return;

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

export function initHeadingControlPanel(): void {
  const panel = headingPanelById(HEADING_PANEL_IDS.panel);
  if (!panel || (panel as any).__bound) return;
  (panel as any).__bound = true;

  // 2번 — 본문에서 커서가 있는 줄을 소제목으로 지정/해제
  headingPanelById<HTMLButtonElement>(HEADING_PANEL_IDS.markBtn)?.addEventListener('click', () => {
    const textarea = getBodyTextarea();
    if (!textarea) return;
    const lineIndex = lineIndexAtOffset(textarea.value, textarea.selectionStart ?? 0);
    const next = toggleHeadingLine(textarea.value, lineIndex);
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

  // 사용자가 본문을 직접 고칠 때도 목록을 따라가게 한다(표기를 손으로 붙이는 경우).
  getBodyTextarea()?.addEventListener('input', () => renderHeadingList());

  // 다른 모듈(fillSemiAutoFields)이 본문을 채운 뒤 부를 수 있게 창구를 연다.
  try { (window as any).renderHeadingList = renderHeadingList; } catch { /* ignore */ }

  renderHeadingList();
}
