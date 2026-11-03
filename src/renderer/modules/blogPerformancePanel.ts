// src/renderer/modules/blogPerformancePanel.ts
// "이 블로그 성과" 칸(2026-10-21) — 크리에이터 어드바이저 · 운영 대장 CSV를 가져오고, 다음 글에 들어갈 요약을 보여 준다.
// 빈 칸은 미수집, 0은 실제 0. 기간 합계와 발행 후 24h · 72h · 7d 는 따로. 관측 비교일 뿐 인과가 아니다.
// NOTE: inline bundle = single scope. Every top-level identifier here is prefixed blogPerformance* / BLOG_PERFORMANCE_*.

type BlogPerformanceWindow = { window: string; measured: number; missing: number; medianPv: number | null; medianHomefeed: number | null; top: Array<{ title: string; pv: number }>; low: Array<{ title: string; pv: number }> };
type BlogPerformanceSummary = { success: boolean; total?: number; digest?: { windows: BlogPerformanceWindow[]; caveats: string[] }; message?: string };
type BlogPerformanceApi = {
  importBlogPerformance?: (id: string, fileName: string, csv: string) => Promise<{ success: boolean; imported?: number; added?: number; replaced?: number; rejected?: Record<string, number>; message?: string }>;
  getBlogPerformanceSummary?: (id: string) => Promise<BlogPerformanceSummary>;
  getBlogPerformancePending?: (id: string) => Promise<{ success: boolean; pending?: BlogPerformancePending[]; message?: string }>;
  addBlogPerformanceManual?: (id: string, input: unknown) => Promise<{ success: boolean; message?: string }>;
};
type BlogPerformancePending = { postId: string; url: string; title: string; publishedAt: string; missing: string[] };

const BLOG_PERFORMANCE_WINDOW_TEXT: Record<string, string> = { '24h': '발행 후 24시간', '72h': '발행 후 72시간', '7d': '발행 후 7일', range: '기간 합계' };
const BLOG_PERFORMANCE_REASON_TEXT: Record<string, string> = { NO_POST_URL: '글 주소 없음', OTHER_BLOG: '다른 블로그 글', NO_METRICS: '측정값 없음' };
const BLOG_PERFORMANCE_MAX_BYTES = 2_000_000;

function blogPerformanceApi(): BlogPerformanceApi { return ((window as unknown as { api?: BlogPerformanceApi }).api) || {}; }
function blogPerformanceEl<K extends keyof HTMLElementTagNameMap>(tag: K, css: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag); element.style.cssText = css; if (text !== undefined) element.textContent = text; return element;
}

function blogPerformanceRender(target: HTMLElement, summary: BlogPerformanceSummary | undefined): void {
  target.replaceChildren();
  const windows = summary?.digest?.windows || [];
  if (!summary?.success) { target.append(blogPerformanceEl('div', 'color:#fca5a5;', summary?.message || '성과 기록을 읽지 못했습니다.')); return; }
  if (!windows.length) { target.append(blogPerformanceEl('div', '', '아직 가져온 성과가 없습니다. 통계가 없어도 글은 쓸 수 있고, 가져오면 다음 글부터 참고합니다.')); return; }
  for (const w of windows) {
    const line = `${BLOG_PERFORMANCE_WINDOW_TEXT[w.window] || w.window}: 측정 ${w.measured}편 · 미수집 ${w.missing}편 · 조회수 중앙값 ${w.medianPv ?? '—'} · 홈판 유입 중앙값 ${w.medianHomefeed ?? '—'}`;
    target.append(blogPerformanceEl('div', 'margin-bottom:0.25rem;', line));
    if (w.top[0]) target.append(blogPerformanceEl('div', 'margin-left:0.8rem;color:#6ee7b7;', `잘된 글: ${w.top[0].title} (${w.top[0].pv})`));
    if (w.low[0]) target.append(blogPerformanceEl('div', 'margin-left:0.8rem;color:#fcd34d;margin-bottom:0.3rem;', `약한 글: ${w.low[0].title} (${w.low[0].pv})`));
  }
  for (const caveat of summary.digest?.caveats || []) target.append(blogPerformanceEl('div', 'font-size:0.76rem;color:var(--text-muted,#94a3b8);', `· ${caveat}`));
}

/** 성과 미수집 글 — 발행 후 구간이 지났는데 숫자가 없는 글. 첫 빈 구간에 바로 숫자를 넣을 수 있다(빈 칸은 미수집으로 남는다). */
function blogPerformanceRenderPending(target: HTMLElement, accountId: string, pending: BlogPerformancePending[], say: (text: string, failed?: boolean) => void, refresh: () => Promise<void>): void {
  target.replaceChildren();
  if (!pending.length) return;
  target.append(blogPerformanceEl('div', 'font-weight:600;margin:0.6rem 0 0.3rem;', `성과 미수집 글 ${pending.length}편 — 크리에이터 어드바이저에서 보고 넣어 주세요`));
  for (const post of pending.slice(0, 10)) {
    const window = post.missing[0];
    const row = blogPerformanceEl('div', 'display:flex;flex-wrap:wrap;gap:0.35rem;align-items:center;margin-bottom:0.35rem;');
    row.dataset.postId = post.postId;
    row.append(blogPerformanceEl('span', 'flex:1 1 220px;min-width:0;word-break:break-all;', `${post.title || post.postId} · ${BLOG_PERFORMANCE_WINDOW_TEXT[window]}`));
    const input = (label: string) => { const el = blogPerformanceEl('input', 'width:4.6rem;padding:0.25rem;border-radius:6px;border:1px solid rgba(148,163,184,0.4);background:transparent;color:inherit;'); el.placeholder = label; el.inputMode = 'numeric'; el.setAttribute('aria-label', label); return el; };
    const pv = input('조회수'); const home = input('홈판'); const search = input('검색');
    const save = blogPerformanceEl('button', 'padding:0.25rem 0.6rem;border-radius:6px;border:1px solid #34d399;background:transparent;color:#34d399;cursor:pointer;', '기록');
    save.type = 'button';
    save.addEventListener('click', () => { void (async () => {
      const result = await blogPerformanceApi().addBlogPerformanceManual?.(accountId, { url: post.url, window, title: post.title, pv: pv.value, homefeed: home.value, search: search.value }).catch(() => undefined);
      if (!result?.success) { say(result?.message || '기록하지 못했습니다.', true); return; }
      say(`${post.title || post.postId} ${BLOG_PERFORMANCE_WINDOW_TEXT[window]} 성과를 기록했습니다.`); await refresh();
    })(); });
    row.append(pv, home, search, save); target.append(row);
  }
}

/** 블로그 설정 폼 아래에 붙는 성과 칸. */
export function blogPerformanceBuildPanel(accountId: string, say: (text: string, failed?: boolean) => void): HTMLElement {
  const api = blogPerformanceApi();
  const box = blogPerformanceEl('section', 'margin-top:1.2rem;padding-top:0.9rem;border-top:1px solid rgba(148,163,184,0.3);font-size:0.84rem;line-height:1.6;');
  box.append(blogPerformanceEl('h3', 'margin:0 0 0.4rem;font-size:0.95rem;', '📊 이 블로그 성과'));
  const summary = blogPerformanceEl('div', 'margin-bottom:0.7rem;', '불러오는 중…');
  const file = blogPerformanceEl('input', 'display:none;'); file.type = 'file'; file.accept = '.csv,text/csv';
  const pick = blogPerformanceEl('button', 'padding:0.45rem 0.9rem;border-radius:8px;border:1px solid #60a5fa;background:transparent;color:#60a5fa;font-weight:600;cursor:pointer;', '성과 CSV 가져오기');
  pick.type = 'button';
  const help = blogPerformanceEl('div', 'font-size:0.76rem;color:var(--text-muted,#94a3b8);margin-top:0.3rem;',
    '크리에이터 어드바이저 글 통계 · 발행 후 성과 기록 CSV. 이 블로그 주소의 글만 들어가고, 빈 칸은 미수집으로 남습니다.');
  const pendingBox = blogPerformanceEl('div', '');
  box.append(summary, pick, file, help, pendingBox);
  const refresh = async (): Promise<void> => {
    blogPerformanceRender(summary, await api.getBlogPerformanceSummary?.(accountId).catch(() => undefined));
    const pending = await api.getBlogPerformancePending?.(accountId).catch(() => undefined);
    blogPerformanceRenderPending(pendingBox, accountId, pending?.success ? pending.pending || [] : [], say, refresh);
  };
  pick.addEventListener('click', () => file.click());
  file.addEventListener('change', () => { void (async () => {
    const chosen = file.files?.[0]; file.value = '';
    if (!chosen) return;
    if (chosen.size > BLOG_PERFORMANCE_MAX_BYTES) { say('성과 파일은 2MB 이하만 가져올 수 있습니다.', true); return; }
    pick.disabled = true;
    const result = await api.importBlogPerformance?.(accountId, chosen.name, await chosen.text()).catch(() => undefined);
    pick.disabled = false;
    if (!result?.success) { say(result?.message || '성과를 가져오지 못했습니다.', true); return; }
    const rejected = Object.entries(result.rejected || {}).map(([reason, n]) => `${BLOG_PERFORMANCE_REASON_TEXT[reason] || reason} ${n}줄`).join(' · ');
    say(`성과 ${result.imported}건을 가져왔습니다(새로 ${result.added} · 갱신 ${result.replaced})${rejected ? ` · 제외: ${rejected}` : ''}.`);
    await refresh();
  })(); });
  void refresh();
  return box;
}
