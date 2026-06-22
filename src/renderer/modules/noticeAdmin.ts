// 공지사항 + 관리자 모드 (소프트 게이트)
// - 공지: 앱 로드(로그인 후) 센터에 크게 표시. "오늘 하루 안 보기" 지원. localStorage 저장.
// - 관리자: 톱니바퀴 → 비번(소프트 게이트) → 공지 리치 편집(굵게/글자크기/색/이미지) + FAQ 관리.
// ⚠️ 비번은 클라이언트 하드코딩 소프트 게이트 — 진짜 보안 아님(공지 편집 접근 제한 용도).

const NOTICE_KEY = 'app_notice_html_v1';
const FAQ_KEY = 'app_faq_json_v1';
const DISMISS_KEY = 'app_notice_dismiss_date';
const ADMIN_PASSWORD = '2021645';

type FaqItem = { q: string; a: string };

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
function showNoticeIfAny(): void {
  const notice = getNotice();
  const faq = getFaq();
  if (!notice.trim() && !faq.length) return;
  let dismissed = '';
  try { dismissed = localStorage.getItem(DISMISS_KEY) || ''; } catch { /* ignore */ }
  if (dismissed === todayStr()) return;

  const modal = document.getElementById('notice-modal');
  const content = document.getElementById('notice-display-content');
  const faqHost = document.getElementById('notice-faq-display');
  if (!modal || !content || !faqHost) return;
  content.innerHTML = notice; // 관리자 작성 리치 HTML
  renderFaqDisplay(faqHost, faq);
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');
}

function closeNotice(): void {
  const modal = document.getElementById('notice-modal');
  const dontShow = document.getElementById('notice-dont-show-today') as HTMLInputElement | null;
  if (dontShow?.checked) {
    try { localStorage.setItem(DISMISS_KEY, todayStr()); } catch { /* ignore */ }
  }
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
  noticeEditor.innerHTML = getNotice();
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
    localStorage.setItem(NOTICE_KEY, noticeEditor.innerHTML);
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
  const tryUnlock = (): void => {
    const pw = document.getElementById('admin-password-input') as HTMLInputElement | null;
    const err = document.getElementById('admin-gate-error');
    if (pw?.value === ADMIN_PASSWORD) { if (err) err.style.display = 'none'; openAdminEditor(); }
    else if (err) err.style.display = 'block';
  };
  document.getElementById('admin-unlock-btn')?.addEventListener('click', tryUnlock);
  document.getElementById('admin-password-input')?.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Enter') tryUnlock();
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
  showNoticeIfAny();
}
