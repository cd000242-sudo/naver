// 공지사항 + 관리자 모드 (소프트 게이트)
// - 공지: 앱 로드(로그인 후) 센터에 크게 표시. "오늘 하루 안 보기" 지원. localStorage 저장.
// - 관리자: 톱니바퀴 → 비번(소프트 게이트) → 공지 리치 편집(굵게/글자크기/색/이미지) + FAQ 관리.
// ⚠️ 비번은 클라이언트 하드코딩 소프트 게이트 — 진짜 보안 아님(공지 편집 접근 제한 용도).

const NOTICE_KEY = 'app_notice_html_v1';
const FAQ_KEY = 'app_faq_json_v1';
const DISMISS_KEY = 'app_notice_dismiss_date';

type FaqItem = { q: string; a: string };
type NoticeDisplayElements = {
  modal: HTMLElement;
  content: HTMLElement;
  faqHost: HTMLElement;
};

const SAFE_NOTICE_TAGS = new Set([
  'A', 'B', 'BR', 'DIV', 'EM', 'FONT', 'H1', 'H2', 'H3', 'H4',
  'I', 'IMG', 'LI', 'OL', 'P', 'SPAN', 'STRONG', 'U', 'UL',
]);
const SAFE_NOTICE_STYLE_PROPS = new Set([
  'background-color', 'color', 'font-size', 'font-style', 'font-weight',
  'text-align', 'text-decoration',
]);

function todayStr(): string {
  try { return new Date().toISOString().slice(0, 10); } catch { return ''; }
}
function getNotice(): string {
  try { return localStorage.getItem(NOTICE_KEY) || ''; } catch { return ''; }
}
function getFaq(): FaqItem[] {
  try {
    const raw = localStorage.getItem(FAQ_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((x) => x && typeof x.q === 'string' && typeof x.a === 'string') : [];
  } catch { return []; }
}
function escapeHtml(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function isSafeNoticeUrl(value: string, allowImageData = false): boolean {
  const trimmed = String(value || '').trim();
  const lower = trimmed.toLowerCase();
  if (!trimmed || lower.includes('javascript:')) return false;
  if (allowImageData && /^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(trimmed)) return true;
  return /^(https?:|mailto:)/i.test(trimmed);
}

function sanitizeNoticeStyle(value: string): string {
  return String(value || '')
    .split(';')
    .map((chunk) => {
      const separator = chunk.indexOf(':');
      if (separator <= 0) return '';
      const name = chunk.slice(0, separator).trim().toLowerCase();
      const styleValue = chunk.slice(separator + 1).trim();
      const lowerValue = styleValue.toLowerCase();
      if (!SAFE_NOTICE_STYLE_PROPS.has(name)) return '';
      if (!styleValue || /url\s*\(|expression\s*\(|javascript:|[<>]/i.test(lowerValue)) return '';
      return `${name}: ${styleValue}`;
    })
    .filter(Boolean)
    .join('; ');
}

function sanitizeNoticeElement(el: Element): void {
  const tag = el.tagName.toUpperCase();
  if (!SAFE_NOTICE_TAGS.has(tag)) {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
    return;
  }

  Array.from(el.attributes).forEach((attr) => {
    const name = attr.name.toLowerCase();
    const value = attr.value || '';
    if (attr.name.startsWith('on')) {
      el.removeAttribute(attr.name);
      return;
    }
    if (name === 'style') {
      const safeStyle = sanitizeNoticeStyle(value);
      if (safeStyle) el.setAttribute('style', safeStyle);
      else el.removeAttribute(attr.name);
      return;
    }
    if (tag === 'A' && name === 'href') {
      if (isSafeNoticeUrl(value)) {
        el.setAttribute('href', value.trim());
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      } else {
        el.removeAttribute(attr.name);
      }
      return;
    }
    if (tag === 'IMG' && name === 'src') {
      if (isSafeNoticeUrl(value, true)) el.setAttribute('src', value.trim());
      else el.removeAttribute(attr.name);
      return;
    }
    if (tag === 'IMG' && name === 'alt') return;
    if (tag === 'FONT' && ['color', 'face', 'size'].includes(name) && !/[<>]/.test(value)) return;
    el.removeAttribute(attr.name);
  });
}

function sanitizeNoticeHtml(raw: string): string {
  const template = document.createElement('template');
  template.innerHTML = String(raw || '');

  const visit = (node: Node): void => {
    Array.from(node.childNodes).forEach(visit);
    if (node.nodeType === 8) {
      node.parentNode?.removeChild(node);
      return;
    }
    if (node.nodeType === 1) sanitizeNoticeElement(node as Element);
  };

  visit(template.content);
  return template.innerHTML;
}

function getNoticeDisplayElements(): NoticeDisplayElements | null {
  const content = document.querySelector<HTMLElement>('#notice-display-content');
  const faqHost = document.querySelector<HTMLElement>('#notice-faq-display');
  const modal = content ? content.closest<HTMLElement>('#notice-modal') : null;

  if (!modal || !content || !faqHost) return null;
  return { modal, content, faqHost };
}

async function verifyAdminPin(pin: string): Promise<{ success: boolean; message?: string }> {
  const input = String(pin || '').trim();
  if (!input) return { success: false, message: '관리자 PIN을 입력해주세요.' };

  const api = (window as any).api;
  if (typeof api?.verifyAdminPin === 'function') {
    return api.verifyAdminPin(input);
  }

  const electronAPI = (window as any).electronAPI;
  if (typeof electronAPI?.invoke === 'function') {
    return electronAPI.invoke('admin:verifyPin', input);
  }

  return { success: false, message: '관리자 인증 API를 사용할 수 없습니다.' };
}

function renderFaqDisplay(host: HTMLElement, faq: FaqItem[]): void {
  if (!faq.length) { host.innerHTML = ''; return; }
  host.innerHTML = `<h4 style="color:var(--text-gold); margin:0 0 0.6rem; font-size:1.05rem;">❓ 자주 묻는 질문</h4>` +
    faq.map((f) => `
      <div style="margin-bottom:0.7rem; padding:0.7rem 0.9rem; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:8px;">
        <div style="font-weight:700; color:var(--text-strong); margin-bottom:0.3rem;">Q. ${escapeHtml(f.q)}</div>
        <div style="color:var(--text-muted); font-size:0.92rem; white-space:pre-wrap;">A. ${escapeHtml(f.a)}</div>
      </div>`).join('');
}

/** 공지가 있고 오늘 안 봤으면 센터에 표시. */
export function showNoticeIfAny(): void {
  const notice = getNotice();
  const faq = getFaq();
  if (!notice.trim() && !faq.length) return;
  let dismissed = '';
  try { dismissed = localStorage.getItem(DISMISS_KEY) || ''; } catch { /* ignore */ }
  if (dismissed === todayStr()) return;

  const elements = getNoticeDisplayElements();
  if (!elements) return;
  const { modal, content, faqHost } = elements;

  document.querySelectorAll<HTMLElement>('#notice-modal').forEach((candidate) => {
    if (candidate !== modal) {
      candidate.style.display = 'none';
      candidate.setAttribute('aria-hidden', 'true');
    }
  });

  content.innerHTML = sanitizeNoticeHtml(notice);
  renderFaqDisplay(faqHost, faq);
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');
}

function closeNotice(): void {
  const modal = getNoticeDisplayElements()?.modal || null;
  const dontShow = document.getElementById('notice-dont-show-today') as HTMLInputElement | null;
  if (dontShow?.checked) {
    try { localStorage.setItem(DISMISS_KEY, todayStr()); } catch { /* ignore */ }
  }
  document.querySelectorAll<HTMLElement>('#notice-modal').forEach((candidate) => {
    candidate.style.display = 'none';
    candidate.setAttribute('aria-hidden', 'true');
  });
  if (modal) { modal.style.display = 'none'; modal.setAttribute('aria-hidden', 'true'); }
}

// ── 관리자 편집 ───────────────────────────────────────────────
function addFaqRow(host: HTMLElement, q = '', a = ''): void {
  const row = document.createElement('div');
  row.className = 'admin-faq-row';
  row.style.cssText = 'display:flex; gap:0.4rem; margin-bottom:0.5rem; align-items:flex-start;';
  row.innerHTML = `
    <div style="flex:1; display:flex; flex-direction:column; gap:0.3rem;">
      <input type="text" class="admin-faq-q" placeholder="질문" style="padding:0.5rem; border-radius:6px; border:1px solid var(--border-medium); background:var(--bg-primary); color:var(--text-strong); font-size:0.85rem;">
      <textarea class="admin-faq-a" placeholder="답변" rows="2" style="padding:0.5rem; border-radius:6px; border:1px solid var(--border-medium); background:var(--bg-primary); color:var(--text-strong); font-size:0.85rem; resize:vertical;"></textarea>
    </div>
    <button type="button" class="admin-faq-del" style="padding:0.4rem 0.6rem; background:#7f1d1d; color:#fff; border:none; border-radius:6px; cursor:pointer; font-size:0.8rem;">삭제</button>`;
  (row.querySelector('.admin-faq-q') as HTMLInputElement).value = q;
  (row.querySelector('.admin-faq-a') as HTMLTextAreaElement).value = a;
  row.querySelector('.admin-faq-del')?.addEventListener('click', () => row.remove());
  host.appendChild(row);
}

function openAdminEditor(): void {
  const gate = document.getElementById('admin-gate');
  const editor = document.getElementById('admin-editor');
  const noticeEditor = document.getElementById('notice-editor');
  const faqList = document.getElementById('admin-faq-list');
  if (!editor || !noticeEditor || !faqList) return;
  if (gate) gate.style.display = 'none';
  editor.style.display = 'block';
  noticeEditor.innerHTML = sanitizeNoticeHtml(getNotice());
  faqList.innerHTML = '';
  const faq = getFaq();
  if (faq.length) faq.forEach((f) => addFaqRow(faqList, f.q, f.a));
  else addFaqRow(faqList);
}

function saveAdmin(): void {
  const noticeEditor = document.getElementById('notice-editor');
  const faqList = document.getElementById('admin-faq-list');
  if (!noticeEditor || !faqList) return;
  try {
    localStorage.setItem(NOTICE_KEY, sanitizeNoticeHtml(noticeEditor.innerHTML));
    const rows = Array.from(faqList.querySelectorAll('.admin-faq-row'));
    const faq: FaqItem[] = rows.map((r) => ({
      q: (r.querySelector('.admin-faq-q') as HTMLInputElement)?.value.trim() || '',
      a: (r.querySelector('.admin-faq-a') as HTMLTextAreaElement)?.value.trim() || '',
    })).filter((f) => f.q || f.a);
    localStorage.setItem(FAQ_KEY, JSON.stringify(faq));
    localStorage.removeItem(DISMISS_KEY); // 변경됐으니 다시 보이게
  } catch { /* ignore */ }
  const modal = document.getElementById('admin-modal');
  if (modal) { modal.style.display = 'none'; modal.setAttribute('aria-hidden', 'true'); }
  if ((window as any).showToast) (window as any).showToast('✅ 공지/FAQ가 저장되었습니다.', 'success');
}

export function initNoticeAdmin(): void {
  // 공지 모달 닫기/확인
  document.getElementById('notice-close-btn')?.addEventListener('click', closeNotice);
  document.getElementById('notice-confirm-btn')?.addEventListener('click', closeNotice);

  // 톱니바퀴 → 관리자 모달(비번 게이트)
  const gearBtn = document.getElementById('admin-gear-btn');
  gearBtn?.addEventListener('click', () => {
    const modal = document.getElementById('admin-modal');
    const gate = document.getElementById('admin-gate');
    const editor = document.getElementById('admin-editor');
    const pw = document.getElementById('admin-password-input') as HTMLInputElement | null;
    const err = document.getElementById('admin-gate-error');
    if (gate) gate.style.display = 'block';
    if (editor) editor.style.display = 'none';
    if (pw) pw.value = '';
    if (err) err.style.display = 'none';
    if (modal) { modal.style.display = 'flex'; modal.setAttribute('aria-hidden', 'false'); }
  });
  document.getElementById('admin-close-btn')?.addEventListener('click', () => {
    const modal = document.getElementById('admin-modal');
    if (modal) { modal.style.display = 'none'; modal.setAttribute('aria-hidden', 'true'); }
  });

  // 잠금 해제
  const tryUnlock = async (): Promise<void> => {
    const pw = document.getElementById('admin-password-input') as HTMLInputElement | null;
    const err = document.getElementById('admin-gate-error');
    if (err) {
      err.style.display = 'none';
      err.textContent = '';
    }

    try {
      const result = await verifyAdminPin(pw?.value || '');
      if (result.success) {
        openAdminEditor();
        return;
      }
      if (err) {
        err.textContent = result.message || '관리자 PIN이 올바르지 않습니다.';
        err.style.display = 'block';
      }
    } catch (error) {
      if (err) {
        err.textContent = `관리자 PIN 확인 실패: ${(error as Error).message}`;
        err.style.display = 'block';
      }
    }
  };
  document.getElementById('admin-unlock-btn')?.addEventListener('click', () => { void tryUnlock(); });
  document.getElementById('admin-password-input')?.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') void tryUnlock();
  });

  // 리치 편집 툴바
  document.getElementById('notice-toolbar')?.querySelectorAll('[data-cmd]').forEach((b) => {
    b.addEventListener('click', () => {
      const cmd = (b as HTMLElement).dataset.cmd!;
      const val = (b as HTMLElement).dataset.val;
      document.getElementById('notice-editor')?.focus();
      try { document.execCommand(cmd, false, val); } catch { /* ignore */ }
    });
  });
  document.getElementById('notice-fontsize')?.addEventListener('change', (e) => {
    document.getElementById('notice-editor')?.focus();
    try { document.execCommand('fontSize', false, (e.target as HTMLSelectElement).value); } catch { /* ignore */ }
  });
  // 이미지 삽입(파일 → dataURL)
  const imgBtn = document.getElementById('notice-img-btn');
  const imgInput = document.getElementById('notice-img-input') as HTMLInputElement | null;
  imgBtn?.addEventListener('click', () => imgInput?.click());
  imgInput?.addEventListener('change', () => {
    const file = imgInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      document.getElementById('notice-editor')?.focus();
      try { document.execCommand('insertImage', false, String(reader.result)); } catch { /* ignore */ }
    };
    reader.readAsDataURL(file);
    imgInput.value = '';
  });

  // FAQ 추가/저장
  document.getElementById('admin-faq-add')?.addEventListener('click', () => {
    const host = document.getElementById('admin-faq-list');
    if (host) addFaqRow(host);
  });
  document.getElementById('admin-save-btn')?.addEventListener('click', saveAdmin);

  // 앱 로드 시 공지 표시
  (window as any).showNoticeIfAny = showNoticeIfAny;
  showNoticeIfAny();
  setTimeout(showNoticeIfAny, 250);
  setTimeout(showNoticeIfAny, 1000);
}
