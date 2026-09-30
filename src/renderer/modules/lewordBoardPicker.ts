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
  /* [2026-09-30] 오늘의 글감 브리프에만 있다 — 키워드만으로는 무슨 글인지 안 보인다. */
  briefTitle?: string;
}

interface LewordBoardSection {
  key: 'briefs' | 'preemption' | 'niche';
  label: string;
  publishedAt: string;
  picks: LewordBoardPick[];
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
  toggle: 'leword-board-toggle',
  keyword: 'unified-keywords',
} as const;

/** 로컬 "MM-DD HH:mm" — 출처마다 며칠 차이가 나는 것이 한눈에 보여야 한다. */
function lewordWhen(iso: string): string {
  const ms = Date.parse(String(iso || ''));
  if (!Number.isFinite(ms)) return '시각 미상';
  const d = new Date(ms);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

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

const LEWORD_BADGE_STYLE = 'font-size:0.65rem;padding:1px 6px;border-radius:999px;font-weight:700;';

function lewordBadge(pick: LewordBoardPick): string {
  const isBlogSlot = pick.openSlot !== undefined || pick.adClicks !== undefined;
  if (isBlogSlot) return `<span style="background:#22c55e;color:#052e16;${LEWORD_BADGE_STYLE}font-weight:800;">블로그 자리</span>`;
  // 브리프는 시점(NOW/NEXT/ALWAYS)이 곧 배지다 — 지금 뜨는 것인지 늘 찾는 것인지.
  if (pick.briefTitle !== undefined) {
    const timing = pick.verdict || 'NOW';
    const color = timing === 'NOW' ? '#f97316' : timing === 'NEXT' ? '#8b5cf6' : '#64748b';
    return `<span style="background:${color};color:#fff;${LEWORD_BADGE_STYLE}">${lewordEscapeHtml(timing)}</span>`;
  }
  if (pick.recommended) return `<span style="background:#0ea5e9;color:#fff;${LEWORD_BADGE_STYLE}">추천</span>`;
  return `<span style="background:var(--bg-tertiary);color:var(--text-muted);${LEWORD_BADGE_STYLE}font-weight:400;">관측</span>`;
}

function lewordRenderPicks(picks: LewordBoardPick[]): string {
  return picks.map((pick) => {
    const isBrief = pick.briefTitle !== undefined;
    return (
      `<button type="button" class="leword-pick" data-keyword="${lewordEscapeHtml(pick.keyword)}" `
      + 'style="display:block;width:100%;text-align:left;padding:0.55rem 0.7rem;background:transparent;'
      + 'border:none;border-bottom:1px solid var(--border-light);cursor:pointer;color:var(--text-strong);">'
      + `<div style="display:flex;align-items:center;gap:0.4rem;font-size:0.86rem;font-weight:600;">${lewordBadge(pick)}${lewordEscapeHtml(pick.keyword)}</div>`
      + (pick.briefTitle
        ? `<div style="font-size:0.76rem;color:var(--text-secondary);margin-top:0.15rem;">${lewordEscapeHtml(pick.briefTitle)}</div>`
        : '')
      + `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.2rem;">`
      + `${lewordEscapeHtml(lewordVolumeLabel(pick))} · ${lewordEscapeHtml(lewordDocLabel(pick))}`
      // 브리프의 verdict 는 시점이라 배지에 이미 있다 — 두 번 적지 않는다.
      + (pick.verdict && !isBrief ? ` · ${lewordEscapeHtml(pick.verdict)}` : '')
      + (pick.lane ? ` · ${lewordEscapeHtml(pick.lane)}` : '')
      + '</div>'
      + (lewordSignals(pick)
        ? `<div style="font-size: 0.72rem; color: #4ade80; margin-top: 0.15rem;">${lewordEscapeHtml(lewordSignals(pick))}</div>`
        : '')
      + '</button>'
    );
  }).join('');
}

/**
 * 출처별로 접히는 묶음. 오늘의 글감만 펼쳐 두고 나머지는 접는다 — 며칠 주기로 갱신되는
 * 선점 보드 78건이 매번 화면을 채우던 것이 "안 바뀐다" 의 실체였다. 묶음마다 제 갱신
 * 시각을 단다. `<details>` 라 접고 펴는 데 스크립트가 필요 없다.
 */
export function buildLewordSectionsHtml(sections: LewordBoardSection[]): string {
  // summary 를 flex 로 두면 기본 삼각형이 사라진다 — 열림 상태 표시는 ::before 로 붙인다.
  const style = '<style>'
    + '.leword-section>summary .leword-caret::before{content:"▸";margin-right:0.35rem;color:var(--text-muted);}'
    + '.leword-section[open]>summary .leword-caret::before{content:"▾";}'
    + '</style>';
  return style + sections.map((section) => {
    const open = section.key === 'briefs' && section.picks.length > 0 ? ' open' : '';
    const count = section.picks.length;
    return (
      `<details class="leword-section" data-key="${section.key}"${open}>`
      + '<summary style="cursor:pointer;padding:0.5rem 0.7rem;font-size:0.8rem;font-weight:700;color:var(--text-strong);'
      + 'background:var(--bg-tertiary);border-bottom:1px solid var(--border-light);list-style:none;display:flex;justify-content:space-between;gap:0.5rem;">'
      + `<span><span class="leword-caret"></span>${lewordEscapeHtml(section.label)} <span style="color:var(--text-muted);font-weight:500;">${count}건</span></span>`
      + `<span style="color:var(--text-muted);font-weight:500;">${lewordEscapeHtml(lewordWhen(section.publishedAt))} 갱신</span>`
      + '</summary>'
      + (count > 0
        ? lewordRenderPicks(section.picks)
        : '<div style="padding:0.5rem 0.7rem;font-size:0.72rem;color:var(--text-muted);">오늘은 고를 만한 것이 없습니다.</div>')
      + '</details>'
    );
  }).join('');
}

/** 목록 전체를 접고 편다. 키워드를 고르면 접히고, 다시 보고 싶으면 펼친다 — 재요청 없이. */
function lewordSetListOpen(open: boolean): void {
  const list = lewordById(LEWORD_IDS.list);
  const toggle = lewordById<HTMLButtonElement>(LEWORD_IDS.toggle);
  if (!list) return;
  list.style.display = open ? 'block' : 'none';
  if (toggle) {
    toggle.style.display = list.innerHTML ? 'inline-block' : 'none';
    toggle.textContent = open ? '▲ 접기' : '▼ 펼치기';
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
}

/** 묶음이 없는 응답(구버전 메인)도 한 묶음으로 그린다. */
function lewordSectionsOf(board: { picks?: LewordBoardPick[]; sections?: LewordBoardSection[]; publishedAt?: string }): LewordBoardSection[] {
  if (Array.isArray(board.sections) && board.sections.length > 0) return board.sections;
  return [{ key: 'niche', label: '글감', publishedAt: board.publishedAt || '', picks: board.picks || [] }];
}

function lewordMetaLine(sections: LewordBoardSection[]): string {
  const total = sections.reduce((sum, s) => sum + s.picks.length, 0);
  if (total === 0) return '오늘은 고를 만한 글감이 없습니다. 다음 갱신을 기다리세요.';
  const parts = sections.map((s) => `${s.label} ${s.picks.length}`);
  return `총 ${total}건 · ${parts.join(' · ')} — 묶음 제목을 누르면 접고 펼 수 있습니다`;
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

    const sections = lewordSectionsOf(res.board);
    const total = sections.reduce((sum, s) => sum + s.picks.length, 0);
    meta.style.display = 'block';
    meta.textContent = lewordMetaLine(sections);

    if (total === 0) {
      list.innerHTML = '';
      lewordSetListOpen(false);
      return;
    }
    list.innerHTML = buildLewordSectionsHtml(sections);
    lewordSetListOpen(true);
    list.querySelectorAll<HTMLButtonElement>('.leword-pick').forEach((item) => {
      item.addEventListener('click', () => {
        const input = lewordById<HTMLInputElement>(LEWORD_IDS.keyword);
        if (!input) return;
        input.value = item.dataset.keyword || '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        lewordSetListOpen(false);
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
  const toggle = lewordById<HTMLButtonElement>(LEWORD_IDS.toggle);
  toggle?.addEventListener('click', () => {
    const list = lewordById(LEWORD_IDS.list);
    lewordSetListOpen(!!list && list.style.display === 'none');
  });
}
