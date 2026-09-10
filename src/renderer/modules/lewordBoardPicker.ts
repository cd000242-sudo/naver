// src/renderer/modules/lewordBoardPicker.ts
// [2026-09-10] leword "오늘의 글감" 을 화면에 띄우고 고르게 한다.
//
// 사장님 지적: "오늘의 글감 사이트까지 줬는데 이럴래? 지금은 또 실시간 검색어 상위 3개를
// 가져오는데?" — 앱은 leword 를 링크로만 걸어 두고 정작 키워드는 자체 랜덤 시드로 뽑았다.
//
// 자동으로 바꿔치지 않는다. 목록을 보여주고 **사용자가 고른다** — 검색량과 문서수를
// 나란히 보여줘서 왜 그 키워드인지 화면에서 판단할 수 있게 한다.

interface LewordBoardPick {
  keyword: string;
  searchVolume: number | null;
  documentCount: number | null;
  verdict: string;
  lane: string;
  recommended: boolean;
  /* [2026-09-10] 선점 보드에서만 오는 신호 — 이길 자리인가 · 돈이 도는가. */
  topic?: string;
  openSlot?: number | null;
  adClicks?: number | null;
  saturated?: boolean;
  layoutHeadline?: string;
}

/*
 * [2026-09-10] 식별자는 전역 유일해야 한다 — copy-static 이 렌더러 모듈을 **단일 스코프로
 * concat** 하므로 흔한 이름(byId·IDS)을 쓰면 다른 모듈과 중복 선언이 된다.
 * 실제로 placePicker 의 byId·IDS 와 부딪혀 빌드가 멈췄다(가드가 잡아 줬다).
 */
const LEWORD_IDS = {
  button: 'leword-board-btn',
  list: 'leword-board-list',
  meta: 'leword-board-meta',
  keyword: 'unified-keywords',
} as const;

function lewordById<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function lewordEscapeHtml(value: string): string {
  return String(value || '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string
  ));
}

/** 검색량은 "모름" 과 "0" 이 다르다 — 모르면 모른다고 적는다. */
function lewordVolumeLabel(pick: LewordBoardPick): string {
  if (pick.searchVolume === null) return '검색량 미측정';
  return `검색량 ${pick.searchVolume.toLocaleString()}`;
}

function lewordDocLabel(pick: LewordBoardPick): string {
  if (pick.documentCount === null) return '문서수 미측정';
  return `문서 ${pick.documentCount.toLocaleString()}건`;
}

/**
 * 선점 보드에서 온 항목에는 "블로그가 이기는 자리" 라는 근거가 붙어 온다.
 * 그 근거를 화면에 그대로 보여 준다 — 왜 이 키워드인지 눈으로 판단하게.
 *
 * [2026-09-10 실측] 43건 중 25건만 블로그가 이기는 자리였다. 검색량·문서수만 보고
 * 고르면 나머지 33%(워드프레스가 이기는 화면)에 헛힘을 쓴다.
 */
function lewordSignals(pick: LewordBoardPick): string {
  const parts: string[] = [];
  if (typeof pick.adClicks === 'number' && pick.adClicks > 0) {
    parts.push(`광고클릭 ${Math.round(pick.adClicks).toLocaleString()}`);
  }
  if (typeof pick.openSlot === 'number') parts.push(`빈자리 ${pick.openSlot}`);
  if (pick.saturated === true) parts.push('앞자리 포화');
  else if (pick.saturated === false) parts.push('앞자리 여유');
  return parts.join(' · ');
}

function lewordRenderPicks(picks: LewordBoardPick[]): string {
  return picks.map((pick) => {
    const isBlogSlot = pick.openSlot !== undefined || pick.adClicks !== undefined;
    const badge = isBlogSlot
      ? '<span style="background:#22c55e;color:#052e16;font-size:0.65rem;padding:1px 6px;border-radius:999px;font-weight:800;">블로그 자리</span>'
      : pick.recommended
        ? '<span style="background:#0ea5e9;color:#fff;font-size:0.65rem;padding:1px 6px;border-radius:999px;font-weight:700;">추천</span>'
        : '<span style="background:var(--bg-tertiary);color:var(--text-muted);font-size:0.65rem;padding:1px 6px;border-radius:999px;">관측</span>';
    return (
      `<button type="button" class="leword-pick" data-keyword="${lewordEscapeHtml(pick.keyword)}" `
      + 'style="display:block;width:100%;text-align:left;padding:0.55rem 0.7rem;background:transparent;'
      + 'border:none;border-bottom:1px solid var(--border-light);cursor:pointer;color:var(--text-strong);">'
      + `<div style="display:flex;align-items:center;gap:0.4rem;font-size:0.86rem;font-weight:600;">${badge}${lewordEscapeHtml(pick.keyword)}</div>`
      + `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.2rem;">`
      + `${lewordEscapeHtml(lewordVolumeLabel(pick))} · ${lewordEscapeHtml(lewordDocLabel(pick))}`
      + (pick.verdict ? ` · ${lewordEscapeHtml(pick.verdict)}` : '')
      + (pick.lane ? ` · ${lewordEscapeHtml(pick.lane)}` : '')
      + '</div>'
      + (lewordSignals(pick)
        ? `<div style="font-size: 0.72rem; color: #4ade80; margin-top: 0.15rem;">${lewordEscapeHtml(lewordSignals(pick))}</div>`
        : '')
      + '</button>'
    );
  }).join('');
}

async function loadLewordBoard(): Promise<void> {
  const list = lewordById(LEWORD_IDS.list);
  const meta = lewordById(LEWORD_IDS.meta);
  const button = lewordById<HTMLButtonElement>(LEWORD_IDS.button);
  if (!list || !meta || !button) return;

  button.disabled = true;
  const label = button.textContent;
  button.textContent = '⏳ 불러오는 중...';
  try {
    const res = await (window as any).api?.getLewordBoard?.();
    if (!res?.success || !res.board) {
      meta.style.display = 'block';
      meta.textContent = res?.message || '오늘의 글감을 가져오지 못했습니다.';
      list.style.display = 'none';
      return;
    }

    const picks: LewordBoardPick[] = res.board.picks || [];
    const when = String(res.board.publishedAt || '').slice(0, 16).replace('T', ' ');
    const m = res.board.measured || {};
    meta.style.display = 'block';
    meta.textContent = picks.length > 0
      ? `${when} 갱신 · ${picks.length}건 (블로그가 이기는 자리 ${typeof m.blogWinnable === 'number' ? m.blogWinnable : 0}건 먼저) · 후보 ${m.candidates ?? '?'}개 중 틈새 ${m.niche ?? 0} · 선점 ${m.preemption ?? 0}`
      : `${when} 갱신 · 오늘은 고를 만한 글감이 없습니다 (후보 ${m.candidates ?? '?'}개 전부 탈락). 다음 갱신을 기다리세요.`;

    if (picks.length === 0) {
      list.style.display = 'none';
      return;
    }
    list.innerHTML = lewordRenderPicks(picks);
    list.style.display = 'block';
    list.querySelectorAll<HTMLButtonElement>('.leword-pick').forEach((item) => {
      item.addEventListener('click', () => {
        const input = lewordById<HTMLInputElement>(LEWORD_IDS.keyword);
        if (!input) return;
        input.value = item.dataset.keyword || '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        list.style.display = 'none';
        try { (window as any).toastManager?.success?.(`키워드 적용: ${input.value}`); } catch { /* ignore */ }
      });
    });
  } catch (error) {
    meta.style.display = 'block';
    meta.textContent = `오늘의 글감을 가져오지 못했습니다 — ${(error as Error)?.message ?? '알 수 없는 오류'}`;
  } finally {
    button.disabled = false;
    button.textContent = label || '📋 오늘의 글감 불러오기 (leword)';
  }
}

export function initLewordBoardPicker(): void {
  const button = lewordById(LEWORD_IDS.button);
  if (!button || (button as any).__bound) return;
  (button as any).__bound = true;
  button.addEventListener('click', () => { void loadLewordBoard(); });
}
