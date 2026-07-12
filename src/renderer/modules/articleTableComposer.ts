import {
  applyArticleTablesToStructuredContent,
  articleTableToMarkdown,
  createEmptyArticleTable,
  insertArticleTableAtSelection,
  insertArticleTableByContext,
  type ArticleTable,
} from '../utils/articleTableUtils.js';
import { extractArticleTextFromClipboardHtml } from '../utils/articleTableClipboard.js';

const ARTICLE_TABLE_PENDING_KEY = 'better-life:article-table:next-post:v1';
const ARTICLE_TABLE_MODAL_ID = 'article-table-composer-modal';
const ARTICLE_TABLE_STYLE_ID = 'article-table-composer-style';
const ARTICLE_TABLE_MAX_PENDING = 8;

let articleTableComposerInitialized = false;
let articleTableComposerDraft: ArticleTable = createEmptyArticleTable(3, 2);

function isArticleTable(value: unknown): value is ArticleTable {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ArticleTable>;
  return typeof candidate.id === 'string'
    && Array.isArray(candidate.cells)
    && candidate.cells.length >= 2
    && candidate.cells.every((row) => Array.isArray(row));
}

export function readPendingArticleTables(): ArticleTable[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(ARTICLE_TABLE_PENDING_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(isArticleTable).slice(0, ARTICLE_TABLE_MAX_PENDING) : [];
  } catch {
    return [];
  }
}

function writePendingArticleTables(tables: readonly ArticleTable[]): void {
  const safeTables = tables.filter(isArticleTable).slice(0, ARTICLE_TABLE_MAX_PENDING);
  localStorage.setItem(ARTICLE_TABLE_PENDING_KEY, JSON.stringify(safeTables));
  updateArticleTableLauncherBadges();
  renderPendingArticleTableList();
}

export function queueArticleTableForNextGeneratedPost(table: ArticleTable): void {
  const pending = readPendingArticleTables();
  const withoutSameId = pending.filter((item) => item.id !== table.id);
  writePendingArticleTables([...withoutSameId, table]);
}

export function clearPendingArticleTables(): void {
  try {
    localStorage.removeItem(ARTICLE_TABLE_PENDING_KEY);
  } catch {
    // Storage can be unavailable in a hardened renderer; the UI still works for the current article.
  }
  updateArticleTableLauncherBadges();
  renderPendingArticleTableList();
}

export function applyPendingArticleTablesToGeneratedContent<T extends Record<string, any>>(content: T): T {
  const pending = readPendingArticleTables();
  if (!content || pending.length === 0) return content;
  const enhanced = applyArticleTablesToStructuredContent(content, pending);
  clearPendingArticleTables();
  return enhanced;
}

function ensureArticleTableComposerStyles(): void {
  if (document.getElementById(ARTICLE_TABLE_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = ARTICLE_TABLE_STYLE_ID;
  style.textContent = `
    .article-table-launcher { display:inline-flex; align-items:center; gap:7px; min-height:38px; padding:8px 12px; border:1px solid #38bdf8; border-radius:7px; background:#0f172a; color:#e0f2fe; font:600 13px/1.2 inherit; cursor:pointer; }
    .article-table-launcher:hover { background:#172554; }
    .article-table-launcher-count { display:none; min-width:19px; height:19px; padding:0 5px; align-items:center; justify-content:center; border-radius:9px; background:#10b981; color:#04130e; font-size:11px; font-weight:800; }
    .article-table-launcher-wrap { display:flex; justify-content:flex-end; margin:8px 0; }
    #${ARTICLE_TABLE_MODAL_ID} { position:fixed; inset:0; z-index:12050; display:none; align-items:center; justify-content:center; padding:20px; background:rgba(2,6,23,.76); }
    #${ARTICLE_TABLE_MODAL_ID}[aria-hidden="false"] { display:flex; }
    .article-table-dialog { width:min(960px,96vw); max-height:92vh; overflow:auto; border:1px solid #475569; border-radius:8px; background:#0b1220; color:#e5e7eb; box-shadow:0 22px 70px rgba(0,0,0,.45); }
    .article-table-dialog-header { position:sticky; top:0; z-index:2; display:flex; align-items:center; justify-content:space-between; gap:16px; padding:16px 18px; border-bottom:1px solid #334155; background:#0b1220; }
    .article-table-dialog-title { margin:0; font-size:18px; letter-spacing:0; }
    .article-table-icon-button { width:36px; height:36px; display:grid; place-items:center; border:1px solid #475569; border-radius:7px; background:#111827; color:#f8fafc; cursor:pointer; font-size:22px; }
    .article-table-dialog-body { padding:18px; }
    .article-table-controls { display:grid; grid-template-columns:minmax(180px,1fr) 110px 110px auto; gap:10px; align-items:end; padding-bottom:16px; border-bottom:1px solid #334155; }
    .article-table-field { display:grid; gap:6px; min-width:0; color:#cbd5e1; font-size:12px; font-weight:700; }
    .article-table-field input { width:100%; min-height:40px; box-sizing:border-box; border:1px solid #475569; border-radius:6px; background:#111827; color:#f8fafc; padding:8px 10px; font:500 14px/1.3 inherit; }
    .article-table-command { min-height:40px; border:0; border-radius:7px; padding:8px 13px; background:#0284c7; color:#fff; font-weight:750; cursor:pointer; }
    .article-table-command.secondary { border:1px solid #64748b; background:#111827; color:#e2e8f0; }
    .article-table-command.success { background:#059669; }
    .article-table-command.danger { border:1px solid #ef4444; background:transparent; color:#fca5a5; }
    .article-table-grid-wrap { margin-top:16px; overflow:auto; border:1px solid #334155; border-radius:7px; }
    .article-table-grid { display:grid; width:100%; background:#334155; gap:1px; }
    .article-table-cell { width:100%; min-width:170px; min-height:46px; box-sizing:border-box; border:0; border-radius:0; padding:9px 10px; background:#111827; color:#f8fafc; font:500 13px/1.35 inherit; resize:none; }
    .article-table-cell[data-header="true"] { background:#172554; color:#dbeafe; font-weight:750; }
    .article-table-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:16px; }
    .article-table-pending { margin-top:18px; padding-top:14px; border-top:1px solid #334155; }
    .article-table-pending-row { display:flex; align-items:center; justify-content:space-between; gap:12px; min-height:38px; border-bottom:1px solid #1e293b; color:#cbd5e1; font-size:13px; }
    .article-table-status { min-height:22px; margin-top:12px; color:#7dd3fc; font-size:13px; }
    @media (max-width:720px) { .article-table-controls { grid-template-columns:1fr 1fr; } .article-table-controls .article-table-title-field { grid-column:1/-1; } .article-table-command { width:100%; } }
  `;
  document.head.appendChild(style);
}

function articleTableComposerMarkup(): string {
  return `
    <div class="article-table-dialog" role="dialog" aria-modal="true" aria-labelledby="article-table-dialog-title">
      <div class="article-table-dialog-header">
        <h2 class="article-table-dialog-title" id="article-table-dialog-title">표 만들기</h2>
        <button type="button" class="article-table-icon-button" id="article-table-close-btn" aria-label="닫기" title="닫기">×</button>
      </div>
      <div class="article-table-dialog-body">
        <div class="article-table-controls">
          <label class="article-table-field article-table-title-field">표 주제
            <input type="text" id="article-table-title-input" placeholder="예: 지원 조건 비교">
          </label>
          <label class="article-table-field">행
            <input type="number" id="article-table-row-count" min="2" max="20" value="3">
          </label>
          <label class="article-table-field">열
            <input type="number" id="article-table-column-count" min="2" max="8" value="2">
          </label>
          <button type="button" class="article-table-command" id="article-table-build-grid-btn">표 만들기</button>
        </div>
        <div class="article-table-grid-wrap"><div class="article-table-grid" id="article-table-edit-grid"></div></div>
        <div class="article-table-actions">
          <button type="button" class="article-table-command" id="article-table-insert-cursor-btn">커서 위치에 넣기</button>
          <button type="button" class="article-table-command success" id="article-table-insert-context-btn">문맥 분석 자동 배치</button>
          <button type="button" class="article-table-command secondary" id="article-table-copy-btn">표 복사</button>
          <button type="button" class="article-table-command secondary" id="article-table-queue-btn">다음 생성 글에 적용</button>
        </div>
        <div class="article-table-status" id="article-table-status" role="status" aria-live="polite"></div>
        <div class="article-table-pending">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
            <strong style="font-size:14px;">다음 글 적용 대기</strong>
            <button type="button" class="article-table-command danger" id="article-table-clear-pending-btn">전체 해제</button>
          </div>
          <div id="article-table-pending-list"></div>
        </div>
      </div>
    </div>`;
}

function ensureArticleTableComposerModal(): HTMLElement {
  const existing = document.getElementById(ARTICLE_TABLE_MODAL_ID);
  if (existing) return existing;
  const modal = document.createElement('div');
  modal.id = ARTICLE_TABLE_MODAL_ID;
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = articleTableComposerMarkup();
  document.body.appendChild(modal);
  return modal;
}

function setArticleTableComposerStatus(message: string, error = false): void {
  const status = document.getElementById('article-table-status');
  if (!status) return;
  status.textContent = message;
  status.style.color = error ? '#fca5a5' : '#7dd3fc';
}

function openArticleTableComposer(): void {
  const modal = ensureArticleTableComposerModal();
  modal.setAttribute('aria-hidden', 'false');
  renderArticleTableGrid(articleTableComposerDraft);
  renderPendingArticleTableList();
  window.setTimeout(() => document.getElementById('article-table-title-input')?.focus(), 0);
}

function closeArticleTableComposer(): void {
  document.getElementById(ARTICLE_TABLE_MODAL_ID)?.setAttribute('aria-hidden', 'true');
}

function renderArticleTableGrid(table: ArticleTable): void {
  articleTableComposerDraft = table;
  const grid = document.getElementById('article-table-edit-grid');
  if (!grid) return;
  const columnCount = table.cells[0]?.length || 2;
  grid.style.gridTemplateColumns = `repeat(${columnCount}, minmax(170px, 1fr))`;
  grid.style.minWidth = `${columnCount * 170}px`;
  grid.replaceChildren();
  table.cells.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      const input = document.createElement('textarea');
      input.className = 'article-table-cell';
      input.dataset.row = String(rowIndex);
      input.dataset.column = String(columnIndex);
      input.dataset.header = String(rowIndex === 0);
      input.rows = 2;
      input.value = cell;
      input.placeholder = rowIndex === 0 ? `열 ${columnIndex + 1} 제목` : `${rowIndex}행 ${columnIndex + 1}열`;
      grid.appendChild(input);
    });
  });
  const title = document.getElementById('article-table-title-input') as HTMLInputElement | null;
  if (title) title.value = table.title;
}

function readArticleTableFromGrid(): ArticleTable | null {
  const grid = document.getElementById('article-table-edit-grid');
  if (!grid) return null;
  const inputs = Array.from(grid.querySelectorAll<HTMLTextAreaElement>('.article-table-cell'));
  const rowCount = Math.max(0, ...inputs.map((input) => Number(input.dataset.row) + 1));
  const columnCount = Math.max(0, ...inputs.map((input) => Number(input.dataset.column) + 1));
  const cells = Array.from({ length: rowCount }, (_, rowIndex) =>
    Array.from({ length: columnCount }, (_, columnIndex) =>
      inputs.find((input) => Number(input.dataset.row) === rowIndex && Number(input.dataset.column) === columnIndex)?.value.trim() || '',
    ),
  );
  if (cells.length < 2 || cells[0].some((cell) => !cell)) {
    setArticleTableComposerStatus('첫 행의 열 제목을 모두 입력해주세요.', true);
    return null;
  }
  if (!cells.slice(1).some((row) => row.some(Boolean))) {
    setArticleTableComposerStatus('표 본문을 한 칸 이상 입력해주세요.', true);
    return null;
  }
  return {
    ...articleTableComposerDraft,
    title: (document.getElementById('article-table-title-input') as HTMLInputElement | null)?.value.trim() || '',
    cells,
  };
}

function insertArticleTableIntoSemiAuto(useContext: boolean): void {
  const table = readArticleTableFromGrid();
  const textarea = document.getElementById('unified-generated-content') as HTMLTextAreaElement | null;
  if (!table || !textarea) {
    if (!textarea) setArticleTableComposerStatus('반자동 본문 편집기를 찾지 못했습니다.', true);
    return;
  }
  const result = useContext
    ? insertArticleTableByContext(textarea.value, table)
    : insertArticleTableAtSelection(textarea.value, table, textarea.selectionStart, textarea.selectionEnd);
  textarea.value = result.text;
  textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.focus();
  setArticleTableComposerStatus(
    result.strategy === 'duplicate'
      ? '같은 표가 이미 본문에 있습니다.'
      : useContext ? '본문 문맥을 분석해 관련 소제목에 표를 배치했습니다.' : '현재 커서 위치에 표를 넣었습니다.',
  );
}

async function copyArticleTableMarkdown(): Promise<void> {
  const table = readArticleTableFromGrid();
  if (!table) return;
  const markdown = articleTableToMarkdown(table);
  try {
    await navigator.clipboard.writeText(markdown);
  } catch {
    const helper = document.createElement('textarea');
    helper.value = markdown;
    helper.style.position = 'fixed';
    helper.style.left = '-9999px';
    document.body.appendChild(helper);
    helper.select();
    document.execCommand('copy');
    helper.remove();
  }
  setArticleTableComposerStatus('표를 복사했습니다. 반자동 본문의 원하는 위치에 붙여넣을 수 있습니다.');
}

function renderPendingArticleTableList(): void {
  const list = document.getElementById('article-table-pending-list');
  if (!list) return;
  const pending = readPendingArticleTables();
  list.replaceChildren();
  if (pending.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'article-table-pending-row';
    empty.textContent = '예약된 표가 없습니다.';
    list.appendChild(empty);
    return;
  }
  pending.forEach((table, index) => {
    const row = document.createElement('div');
    row.className = 'article-table-pending-row';
    const label = document.createElement('span');
    label.textContent = `${index + 1}. ${table.title || table.cells[0].join(' / ')} (${table.cells.length}×${table.cells[0]?.length || 0})`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'article-table-icon-button';
    remove.style.width = '30px';
    remove.style.height = '30px';
    remove.textContent = '×';
    remove.title = '이 표 해제';
    remove.addEventListener('click', () => writePendingArticleTables(readPendingArticleTables().filter((item) => item.id !== table.id)));
    row.append(label, remove);
    list.appendChild(row);
  });
}

function updateArticleTableLauncherBadges(): void {
  const count = readPendingArticleTables().length;
  document.querySelectorAll<HTMLElement>('.article-table-launcher-count').forEach((badge) => {
    badge.textContent = String(count);
    badge.style.display = count > 0 ? 'inline-flex' : 'none';
  });
}

function makeArticleTableLauncher(surface: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'article-table-launcher';
  button.dataset.articleTableSurface = surface;
  button.title = '행과 열을 정해 표를 만들고 본문에 배치합니다';
  const icon = document.createElement('span');
  icon.textContent = '▦';
  icon.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.textContent = '표 만들기';
  const count = document.createElement('span');
  count.className = 'article-table-launcher-count';
  button.append(icon, text, count);
  button.addEventListener('click', openArticleTableComposer);
  return button;
}

function injectArticleTableLauncher(surface: string, anchor: Element | null, position: 'before' | 'after'): void {
  if (!anchor || document.querySelector(`[data-article-table-surface="${surface}"]`)) return;
  const wrap = document.createElement('div');
  wrap.className = 'article-table-launcher-wrap';
  wrap.appendChild(makeArticleTableLauncher(surface));
  if (position === 'before') anchor.parentElement?.insertBefore(wrap, anchor);
  else anchor.parentElement?.insertBefore(wrap, anchor.nextSibling);
}

function installArticleTablePasteRecognition(textarea: HTMLTextAreaElement): void {
  if (textarea.dataset.articleTablePasteReady === 'true') return;
  textarea.dataset.articleTablePasteReady = 'true';
  textarea.addEventListener('paste', (event: ClipboardEvent) => {
    const html = event.clipboardData?.getData('text/html') || '';
    const plain = event.clipboardData?.getData('text/plain') || '';
    const converted = extractArticleTextFromClipboardHtml(html, plain);
    if (!converted) return;
    event.preventDefault();
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = textarea.value.slice(0, start);
    const after = textarea.value.slice(end);
    const prefix = before && !before.endsWith('\n\n') ? (before.endsWith('\n') ? '\n' : '\n\n') : '';
    const suffix = after && !after.startsWith('\n\n') ? (after.startsWith('\n') ? '\n' : '\n\n') : '';
    textarea.value = `${before}${prefix}${converted.text}${suffix}${after}`;
    const caret = before.length + prefix.length + converted.text.length;
    textarea.setSelectionRange(caret, caret);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function bindArticleTableComposerEvents(modal: HTMLElement): void {
  document.getElementById('article-table-close-btn')?.addEventListener('click', closeArticleTableComposer);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeArticleTableComposer();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal.getAttribute('aria-hidden') === 'false') closeArticleTableComposer();
  });
  document.getElementById('article-table-build-grid-btn')?.addEventListener('click', () => {
    const rows = Number((document.getElementById('article-table-row-count') as HTMLInputElement | null)?.value || 3);
    const columns = Number((document.getElementById('article-table-column-count') as HTMLInputElement | null)?.value || 2);
    const next = createEmptyArticleTable(rows, columns);
    renderArticleTableGrid({ ...next, title: (document.getElementById('article-table-title-input') as HTMLInputElement | null)?.value.trim() || '' });
    setArticleTableComposerStatus(`${next.cells.length}×${next.cells[0].length} 표를 만들었습니다. 셀 내용을 입력해주세요.`);
  });
  document.getElementById('article-table-insert-cursor-btn')?.addEventListener('click', () => insertArticleTableIntoSemiAuto(false));
  document.getElementById('article-table-insert-context-btn')?.addEventListener('click', () => insertArticleTableIntoSemiAuto(true));
  document.getElementById('article-table-copy-btn')?.addEventListener('click', () => void copyArticleTableMarkdown());
  document.getElementById('article-table-queue-btn')?.addEventListener('click', () => {
    const table = readArticleTableFromGrid();
    if (!table) return;
    queueArticleTableForNextGeneratedPost(table);
    setArticleTableComposerStatus('다음에 생성되는 글 1개에 이 표를 문맥 분석해 자동 배치합니다.');
  });
  document.getElementById('article-table-clear-pending-btn')?.addEventListener('click', () => {
    clearPendingArticleTables();
    setArticleTableComposerStatus('다음 글 표 예약을 모두 해제했습니다.');
  });
}

export function initArticleTableComposer(): void {
  if (articleTableComposerInitialized) return;
  articleTableComposerInitialized = true;
  ensureArticleTableComposerStyles();
  const modal = ensureArticleTableComposerModal();
  bindArticleTableComposerEvents(modal);
  renderArticleTableGrid(articleTableComposerDraft);

  const semiAutoEditor = document.getElementById('unified-generated-content') as HTMLTextAreaElement | null;
  injectArticleTableLauncher('semi-auto', semiAutoEditor, 'before');
  injectArticleTableLauncher(
    'full-auto',
    document.getElementById('unified-publish-btn') || document.getElementById('full-auto-publish-btn'),
    'before',
  );
  injectArticleTableLauncher('continuous', document.getElementById('continuous-open-settings-modal-btn'), 'after');
  injectArticleTableLauncher('multi-account', document.getElementById('ma-start-publish-btn'), 'before');
  if (semiAutoEditor) installArticleTablePasteRecognition(semiAutoEditor);
  updateArticleTableLauncherBadges();
}
