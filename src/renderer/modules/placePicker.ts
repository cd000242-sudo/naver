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
} as const;

/**
 * [2026-08-25] 확정된 장소 목록.
 *
 * 한 곳만 넣던 시절에는 단일 값이었다. 사용자가 "중간중간 다녀온 곳을 지도로 찍고
 * 마지막에 맛집 지도"를 요청해 목록으로 바꿨다. 위치는 곳마다 따로 고른다.
 * position 기본값이 'auto' 인 이유: 풀오토는 설정 시점에 소제목을 모른다.
 */
const MAX_PLACES = 5;

interface PickedEntry {
  name: string;
  address: string;
  position: string;
}

const pickedList: PickedEntry[] = [];

function byId<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function escapeHtml(value: string): string {
  return String(value || '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string
  ));
}

/** 위치 선택지 — '자동'이 기본이다. */
const POSITION_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'auto', label: '자동 (본문이 언급한 곳)' },
  { value: 'bottom', label: '본문 맨 끝 (해시태그 앞)' },
  ...Array.from({ length: 7 }, (_, i) => ({
    value: `heading-${i + 1}`,
    label: `${i + 1}번 소제목 아래`,
  })),
];

function positionSelectHtml(index: number, selected: string): string {
  const options = POSITION_OPTIONS
    .map((opt) => `<option value="${opt.value}"${opt.value === selected ? ' selected' : ''}>${escapeHtml(opt.label)}</option>`)
    .join('');
  return (
    `<select data-place-position="${index}" style="padding: 0.28rem 0.4rem; background: var(--bg-primary); ` +
    `border: 1px solid var(--border-medium); border-radius: 6px; color: var(--text-strong); font-size: 0.78rem;">${options}</select>`
  );
}

function renderSelected(): void {
  const el = byId(IDS.selected);
  if (!el) return;

  if (pickedList.length === 0) {
    el.innerHTML = '<div style="font-size: 0.82rem; color: var(--text-muted);">아직 고른 장소가 없습니다.</div>';
    return;
  }

  el.innerHTML = pickedList
    .map((entry, index) => (
      `<div style="display: flex; align-items: center; gap: 0.5rem; padding: 0.45rem 0.55rem; margin-bottom: 0.35rem; ` +
      `background: var(--bg-primary); border: 1px solid var(--border-medium); border-radius: 8px;">` +
      `<span style="font-size: 0.78rem; color: var(--text-muted); min-width: 1.1rem;">${index + 1}.</span>` +
      `<span style="flex: 1; min-width: 0;">` +
      `<strong style="font-size: 0.84rem; color: var(--text-strong); display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(entry.name)}</strong>` +
      `<span style="font-size: 0.75rem; color: var(--text-muted); display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(entry.address)}</span>` +
      `</span>` +
      positionSelectHtml(index, entry.position) +
      `<button type="button" data-place-remove="${index}" title="삭제" ` +
      `style="padding: 0.25rem 0.45rem; background: transparent; border: 1px solid var(--border-medium); ` +
      `border-radius: 6px; color: var(--text-muted); cursor: pointer; font-size: 0.8rem;">&times;</button>` +
      `</div>`
    ))
    .join('');

  el.querySelectorAll<HTMLSelectElement>('select[data-place-position]').forEach((select) => {
    select.addEventListener('change', () => {
      const index = Number(select.dataset.placePosition);
      if (pickedList[index]) pickedList[index].position = select.value;
    });
  });
  el.querySelectorAll<HTMLButtonElement>('button[data-place-remove]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.placeRemove);
      if (Number.isFinite(index)) {
        pickedList.splice(index, 1);
        renderSelected();
      }
    });
  });
}

/** 같은 가게를 두 번 담지 않는다. 비교는 이름+주소로 한다. */
function alreadyPicked(name: string, address: string): boolean {
  const key = (v: string) => v.replace(/\s+/g, '').toLowerCase();
  return pickedList.some((e) => key(e.name) === key(name) && key(e.address) === key(address));
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

      const address = item.roadAddress || item.address || '';
      if (alreadyPicked(item.name, address)) {
        renderSelected();
        return;
      }
      if (pickedList.length >= MAX_PLACES) {
        const results = byId(IDS.results);
        if (results) {
          results.innerHTML =
            `<div style="font-size: 0.82rem; color: var(--danger, #d9534f);">장소는 한 글에 최대 ${MAX_PLACES}곳까지 넣을 수 있습니다. 목록에서 하나를 지운 뒤 다시 골라주세요.</div>`;
        }
        return;
      }

      pickedList.push({ name: item.name, address, position: 'auto' });
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
 * 발행 payload 에 실을 장소 목록. 체크가 꺼져 있거나 아직 고르지 않았으면 빈 배열 —
 * 이때는 장소 블록 자체가 들어가지 않는다.
 */
export function readPickedPlaces(): PickedPlace[] {
  const enabled = byId<HTMLInputElement>(IDS.enabled)?.checked === true;
  if (!enabled) return [];
  return pickedList
    .filter((entry) => entry.name.trim().length > 0)
    .slice(0, MAX_PLACES)
    .map((entry) => ({
      name: entry.name,
      address: entry.address,
      position: entry.position || 'auto',
    }));
}

/**
 * 구버전 호출부 호환 — 첫 번째 장소만 돌려준다.
 * 새 코드는 readPickedPlaces() 를 써야 나머지 장소가 버려지지 않는다.
 */
export function readPickedPlace(): PickedPlace | null {
  return readPickedPlaces()[0] || null;
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
