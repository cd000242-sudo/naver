// src/renderer/modules/publishFlowChooser.ts
// [2026-10-13 사장님] "초보자들은 완전히 내렸다 올렸다가 어디에 뭘 선택해야 하는지 헷갈려한다 — 외부에서 가져오는 걸 기본으로."
// The publish tab mixes two flows on one long page: generating in the app (URL/keyword/photo) and pasting an
// article written elsewhere (ChatGPT/Claude/LDB). This module adds a two-card chooser at the top of the tab,
// shows only the chosen flow's input block, folds the tone/personal-prompt fields into "고급 설정", and
// remembers the choice. No field is removed or renamed — existing ids, listeners and publish paths are untouched.

export type PublishFlow = 'app' | 'import';

export const PUBLISH_FLOW_STORAGE_KEY = 'bln.publishFlow';
export const DEFAULT_PUBLISH_FLOW: PublishFlow = 'import';

const CHOOSER_ID = 'publish-flow-chooser';
const ADVANCED_ID = 'unified-advanced-settings';
const IMPORT_HINT_ID = 'publish-flow-import-hint';
const STEPS_ID = 'publish-flow-steps';

const STEPS: Record<PublishFlow, string> = {
  app: '① 발행 계정 → ② 카테고리·모드 → ③ 소재(URL·키워드·사진) → ④ AI 글 생성 → ⑤ 이미지 → ⑥ 발행',
  import: '① 발행 계정 → ② 원고 붙여넣기(제목·본문) → ③ 소제목 확인 → ④ 이미지 → ⑤ 발행',
};

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readStoredPublishFlow(storage: StorageLike | null | undefined): PublishFlow {
  try {
    const value = storage?.getItem(PUBLISH_FLOW_STORAGE_KEY);
    return value === 'app' || value === 'import' ? value : DEFAULT_PUBLISH_FLOW;
  } catch {
    return DEFAULT_PUBLISH_FLOW;
  }
}

/** Pure decision: which input block each flow shows. Semi-auto stays visible in the app flow once it holds text. */
export function resolveFlowVisibility(flow: PublishFlow, semiAutoHasText: boolean): { generation: boolean; semiAuto: boolean } {
  if (flow === 'import') return { generation: false, semiAuto: true };
  return { generation: true, semiAuto: semiAutoHasText };
}

function semiAutoHasText(doc: Document): boolean {
  const title = doc.getElementById('unified-generated-title') as HTMLInputElement | null;
  const body = doc.getElementById('unified-generated-content') as HTMLTextAreaElement | null;
  return Boolean(String(title?.value || '').trim() || String(body?.value || '').trim());
}

/** The tab-level block that holds `el` (the element whose parent is the same as #content-generation-tabs' parent). */
function tabBlockOf(doc: Document, el: Element | null): HTMLElement | null {
  const host = doc.getElementById('content-generation-tabs')?.parentElement;
  let node: Element | null = el;
  while (node && node.parentElement && node.parentElement !== host) node = node.parentElement;
  return node && node.parentElement === host ? (node as HTMLElement) : null;
}

function buildChooser(doc: Document): HTMLElement {
  const chooser = doc.createElement('div');
  chooser.id = CHOOSER_ID;
  chooser.className = 'field';
  chooser.innerHTML = `
    <div class="publish-flow-cards">
      <button type="button" class="publish-flow-card" data-flow="import">
        <span class="publish-flow-title"><span>📥 내 원고·LLM 원고 가져오기</span><span class="publish-flow-tag">기본</span></span>
        <span class="publish-flow-desc">ChatGPT·Claude 등에서 쓴 원고를 붙여넣고 제목·소제목만 손봐서 발행합니다.</span>
      </button>
      <button type="button" class="publish-flow-card" data-flow="app">
        <span class="publish-flow-title"><span>⚡ 앱에서 AI로 생성</span><span class="publish-flow-tag">선택</span></span>
        <span class="publish-flow-desc">URL·키워드·사진만 넣으면 앱이 자료를 조사하고 글을 씁니다.</span>
      </button>
    </div>
    <div id="${STEPS_ID}" class="publish-flow-steps"></div>`;
  return chooser;
}

function ensureStyles(doc: Document): void {
  if (doc.getElementById('publish-flow-chooser-style')) return;
  const style = doc.createElement('style');
  style.id = 'publish-flow-chooser-style';
  style.textContent = `
    #${CHOOSER_ID}{margin:0 0 1.25rem}
    .publish-flow-cards{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}
    .publish-flow-card{text-align:left;background:var(--bg-secondary);border:2px solid var(--border-light);border-radius:14px;padding:.9rem 1.1rem;cursor:pointer;color:var(--text-strong);transition:border-color .15s}
    .publish-flow-card:hover{border-color:rgba(245,197,66,.5)}
    .publish-flow-card.active{border-color:#f5c542;box-shadow:0 0 0 3px rgba(245,197,66,.15)}
    .publish-flow-title{display:flex;align-items:center;gap:.5rem;font-size:1.05rem;font-weight:800;line-height:1.3}
    .publish-flow-title>span:first-child{flex:1 1 auto;min-width:0}
    .publish-flow-tag{flex:0 0 auto;white-space:nowrap;margin-left:auto;font-size:.72rem;font-weight:700;background:var(--bg-tertiary);color:var(--text-muted);padding:2px 8px;border-radius:999px}
    .publish-flow-card.active .publish-flow-tag{background:#f5c542;color:#1a0a00}
    .publish-flow-desc{display:block;margin-top:.35rem;font-size:.86rem;color:var(--text-muted);font-weight:400}
    .publish-flow-steps{margin-top:.6rem;font-size:.85rem;color:var(--text-muted)}
    #${ADVANCED_ID}{border:1px dashed var(--border-light);border-radius:12px;padding:.6rem 1rem;margin:.75rem 0}
    #${ADVANCED_ID}>summary{cursor:pointer;font-weight:700;color:var(--text-muted)}
    #${ADVANCED_ID}[open]>summary{color:var(--text-strong);margin-bottom:.5rem}
    #${IMPORT_HINT_ID}{background:rgba(59,130,246,.12);border:1px solid rgba(59,130,246,.35);border-radius:10px;padding:.6rem .9rem;margin-bottom:1rem;font-size:.9rem;color:var(--text-strong)}
    @media (max-width:720px){.publish-flow-cards{grid-template-columns:1fr}}`;
  doc.head.appendChild(style);
}

const CATEGORY_ANCHOR_ID = 'publish-flow-category-anchor';
const SUMMARY: Record<PublishFlow, string> = {
  app: '⚙️ 고급 설정 — 글 톤 · 개인 프롬프트 (기본값으로 두어도 됩니다)',
  import: '⚙️ 고급 설정 — 카테고리·콘텐츠 모드 · 글 톤 · 개인 프롬프트 (가져온 원고에는 거의 영향 없음)',
};

/** Moves the tone block and the personal-prompt section into one collapsed "고급 설정" details (listeners survive). */
function foldAdvancedSettings(doc: Document): void {
  if (doc.getElementById(ADVANCED_ID)) return;
  const toneBlock = tabBlockOf(doc, doc.getElementById('unified-tone-style'));
  const promptBlock = tabBlockOf(doc, doc.getElementById('custom-prompt-section'));
  const first = toneBlock || promptBlock;
  if (!first || !first.parentElement) return;
  const details = doc.createElement('details');
  details.id = ADVANCED_ID;
  details.innerHTML = `<summary>${SUMMARY.app}</summary>`;
  first.parentElement.insertBefore(details, first);
  for (const block of [toneBlock, promptBlock]) if (block) details.appendChild(block);
  // Remember where the category/content-mode block lives so the import flow can tuck it away and the
  // app flow can put it back (사장님 10/13: "이것도 앱에서 글 생성할 때 사용하는 건데?").
  const categoryBlock = tabBlockOf(doc, doc.getElementById('open-category-modal-btn'));
  if (categoryBlock && categoryBlock.parentElement && !doc.getElementById(CATEGORY_ANCHOR_ID)) {
    const anchor = doc.createElement('span');
    anchor.id = CATEGORY_ANCHOR_ID;
    anchor.hidden = true;
    categoryBlock.parentElement.insertBefore(anchor, categoryBlock);
  }
}

/** Import flow: category/content-mode block goes to the top of 고급 설정; app flow: back to its own place. */
function placeCategoryBlock(doc: Document, flow: PublishFlow): void {
  const details = doc.getElementById(ADVANCED_ID);
  const anchor = doc.getElementById(CATEGORY_ANCHOR_ID);
  const button = doc.getElementById('open-category-modal-btn');
  if (!details || !anchor || !button) return;
  // Inside the details the block is its direct child; outside it is a tab-level block.
  let categoryBlock: HTMLElement | null = null;
  if (details.contains(button)) {
    let node: Element = button;
    while (node.parentElement && node.parentElement !== details) node = node.parentElement;
    categoryBlock = node as HTMLElement;
  } else {
    categoryBlock = tabBlockOf(doc, button);
  }
  if (!categoryBlock) return;
  const summary = details.querySelector('summary');
  if (summary) summary.textContent = SUMMARY[flow];
  if (flow === 'import') {
    if (categoryBlock.parentElement !== details) details.insertBefore(categoryBlock, summary ? summary.nextSibling : details.firstChild);
  } else if (categoryBlock.parentElement === details && anchor.parentElement) {
    anchor.parentElement.insertBefore(categoryBlock, anchor.nextSibling);
  }
}

function ensureImportHint(doc: Document): HTMLElement | null {
  const semi = doc.getElementById('unified-semi-auto-section');
  if (!semi) return null;
  let hint = doc.getElementById(IMPORT_HINT_ID);
  if (!hint) {
    hint = doc.createElement('div');
    hint.id = IMPORT_HINT_ID;
    hint.textContent = '📥 ChatGPT·Claude 등에서 쓴 원고를 아래 "본문" 칸에 붙여넣으세요. LDB 확장의 "앱으로 보내기"도 여기로 들어옵니다. 붙여넣은 글은 앱이 다시 쓰지 않고 그대로 발행합니다.';
    const heading = semi.querySelector('h3');
    if (heading && heading.nextSibling) semi.insertBefore(hint, heading.nextSibling);
    else semi.insertBefore(hint, semi.firstChild);
  }
  return hint;
}

export function applyPublishFlow(flow: PublishFlow, doc: Document = document, storage: StorageLike | null = safeStorage()): void {
  const visibility = resolveFlowVisibility(flow, semiAutoHasText(doc));
  const generation = doc.getElementById('content-generation-tabs');
  if (generation) generation.style.display = visibility.generation ? '' : 'none';
  const semi = doc.getElementById('unified-semi-auto-section');
  if (semi) semi.style.display = visibility.semiAuto ? 'block' : 'none';
  const hint = ensureImportHint(doc);
  if (hint) hint.style.display = flow === 'import' ? '' : 'none';
  placeCategoryBlock(doc, flow);
  doc.querySelectorAll<HTMLElement>(`#${CHOOSER_ID} .publish-flow-card`).forEach((card) => {
    card.classList.toggle('active', card.dataset.flow === flow);
  });
  const steps = doc.getElementById(STEPS_ID);
  if (steps) steps.textContent = STEPS[flow];
  try { storage?.setItem(PUBLISH_FLOW_STORAGE_KEY, flow); } catch { /* storage is a convenience only */ }
}

function safeStorage(): StorageLike | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

/** Idempotent: builds the chooser once, folds advanced fields, applies the remembered flow (default: import). */
export function initPublishFlowChooser(doc: Document = document, storage: StorageLike | null = safeStorage()): PublishFlow | null {
  if (doc.getElementById(CHOOSER_ID)) return readStoredPublishFlow(storage);
  const subtabs = doc.getElementById('publish-mode-subtabs');
  const account = doc.getElementById('publish-account-block');
  const anchor = subtabs || account;
  if (!anchor || !anchor.parentElement) return null;
  ensureStyles(doc);
  const chooser = buildChooser(doc);
  if (subtabs) subtabs.insertAdjacentElement('afterend', chooser);
  else anchor.parentElement.insertBefore(chooser, anchor);
  foldAdvancedSettings(doc);
  chooser.querySelectorAll<HTMLElement>('.publish-flow-card').forEach((card) => {
    card.addEventListener('click', () => {
      const flow = card.dataset.flow === 'app' ? 'app' : 'import';
      applyPublishFlow(flow, doc, storage);
      const target = flow === 'import' ? doc.getElementById('unified-generated-content') : doc.getElementById('content-generation-tabs');
      try { target?.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch { /* optional */ }
    });
  });
  const flow = readStoredPublishFlow(storage);
  applyPublishFlow(flow, doc, storage);
  return flow;
}
