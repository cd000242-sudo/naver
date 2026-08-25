// src/renderer/modules/placePicker.ts
// [v2.11.206] 장소(지도) 미리 확정 UI — 사진 모드 전용.
//
// 발행 도중에 후보를 고르면 동명 업체가 끼어들 수 있다. 그래서 여기서 업체명 +
// 주소를 눈으로 보고 하나 확정해 두고, 발행은 그 값만 그대로 쓴다.
// 아무것도 고르지 않으면 장소 블록 없이 평소대로 발행된다.

export interface PickedPlace {
  readonly name: string;
  readonly address: string;
  readonly position: string;
}

interface PlaceSearchItem {
  name: string;
  category: string;
  address: string;
  roadAddress: string;
  telephone: string;
  link: string;
}

const IDS = {
  enabled: 'image-narrative-place-enabled',
  body: 'image-narrative-place-body',
  query: 'image-narrative-place-query',
  searchBtn: 'image-narrative-place-search-btn',
  results: 'image-narrative-place-results',
  selected: 'image-narrative-place-selected',
  position: 'image-narrative-place-position',
} as const;

/** 확정된 장소. 사용자가 카드를 고르기 전에는 null 이다. */
let picked: { name: string; address: string } | null = null;

function byId<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function escapeHtml(value: string): string {
  return String(value || '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string
  ));
}

function renderSelected(): void {
  const el = byId(IDS.selected);
  if (!el) return;
  if (!picked) {
    el.innerHTML = '아직 고른 장소가 없습니다.';
    return;
  }
  el.innerHTML =
    `✅ <strong style="color: var(--text-strong);">${escapeHtml(picked.name)}</strong>` +
    `<br/><span style="opacity:0.85;">${escapeHtml(picked.address)}</span>`;
}

function renderResults(items: readonly PlaceSearchItem[]): void {
  const el = byId(IDS.results);
  if (!el) return;

  if (items.length === 0) {
    el.innerHTML = '<div style="font-size: 0.82rem; color: var(--text-muted);">검색 결과가 없습니다. 가게 이름을 더 정확히 적어보세요.</div>';
    return;
  }

  el.innerHTML = items
    .map((item, index) => {
      const address = item.roadAddress || item.address || '';
      return (
        `<button type="button" class="place-result-card" data-place-index="${index}" ` +
        `style="display: block; width: 100%; text-align: left; margin-bottom: 0.35rem; padding: 0.5rem 0.6rem; ` +
        `background: var(--bg-primary); border: 1px solid var(--border-medium); border-radius: 8px; cursor: pointer;">` +
        `<span style="font-weight: 700; font-size: 0.85rem; color: var(--text-strong);">${escapeHtml(item.name)}</span>` +
        (item.category ? ` <span style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(item.category)}</span>` : '') +
        `<br/><span style="font-size: 0.78rem; color: var(--text-muted);">${escapeHtml(address)}</span>` +
        `</button>`
      );
    })
    .join('');

  el.querySelectorAll<HTMLButtonElement>('button[data-place-index]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.placeIndex);
      const item = items[index];
      if (!item) return;
      picked = { name: item.name, address: item.roadAddress || item.address || '' };
      renderSelected();
    });
  });
}

async function runSearch(): Promise<void> {
  const input = byId<HTMLInputElement>(IDS.query);
  const results = byId(IDS.results);
  const query = input?.value?.trim() || '';
  if (!query) {
    if (results) results.innerHTML = '<div style="font-size: 0.82rem; color: var(--text-muted);">가게 이름을 입력해주세요.</div>';
    return;
  }

  if (results) results.innerHTML = '<div style="font-size: 0.82rem; color: var(--text-muted);">검색 중...</div>';

  try {
    const api = (window as any).electronAPI;
    // [2026-08-25] "알 수 없는 오류"의 정체를 가르는 세 갈래.
    //   기존에는 셋을 한 문구로 뭉개서, 화면만 보고는 키 문제인지 배선 문제인지
    //   구분할 수 없었다(사용자 실측 스크린샷).
    if (typeof api?.searchPlaces !== 'function') {
      if (results) {
        results.innerHTML =
          '<div style="font-size: 0.82rem; color: var(--danger, #d9534f);">검색 기능이 이 버전에 없습니다 — 앱을 최신 버전으로 업데이트한 뒤 다시 시도해주세요.</div>';
      }
      return;
    }
    const response = await api.searchPlaces(query);
    if (!response) {
      if (results) {
        results.innerHTML =
          '<div style="font-size: 0.82rem; color: var(--danger, #d9534f);">검색 응답이 오지 않았습니다 — 앱을 재시작한 뒤 다시 시도해주세요.</div>';
      }
      return;
    }
    if (!response.success) {
      if (results) {
        const detail = String(response.message || '').trim() || '원인 미상 (앱 로그를 확인해주세요)';
        results.innerHTML =
          `<div style="font-size: 0.82rem; color: var(--danger, #d9534f);">검색 실패: ${escapeHtml(detail)}</div>`;
      }
      return;
    }
    renderResults(response.items || []);
  } catch (error) {
    if (results) {
      results.innerHTML =
        `<div style="font-size: 0.82rem; color: var(--danger, #d9534f);">검색 실패: ${escapeHtml((error as Error).message)}</div>`;
    }
  }
}

/**
 * 발행 payload 에 실을 값. 체크가 꺼져 있거나 아직 고르지 않았으면 null —
 * 이때는 장소 블록 자체가 들어가지 않는다.
 */
export function readPickedPlace(): PickedPlace | null {
  const enabled = byId<HTMLInputElement>(IDS.enabled)?.checked === true;
  if (!enabled || !picked) return null;
  return {
    name: picked.name,
    address: picked.address,
    position: byId<HTMLSelectElement>(IDS.position)?.value || 'bottom',
  };
}

export function initPlacePicker(): void {
  const enabled = byId<HTMLInputElement>(IDS.enabled);
  const body = byId(IDS.body);
  const searchBtn = byId<HTMLButtonElement>(IDS.searchBtn);
  const query = byId<HTMLInputElement>(IDS.query);
  if (!enabled || !body) return;

  const syncVisibility = () => {
    body.style.display = enabled.checked ? 'block' : 'none';
  };
  enabled.addEventListener('change', syncVisibility);
  syncVisibility();

  searchBtn?.addEventListener('click', () => { void runSearch(); });
  query?.addEventListener('keydown', (event) => {
    if ((event as KeyboardEvent).key === 'Enter') {
      event.preventDefault();
      void runSearch();
    }
  });

  renderSelected();
}
