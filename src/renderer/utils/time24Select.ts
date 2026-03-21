// ═══════════════════════════════════════════════════════════════════
// ✅ [2026-03-22] 24시간 시간 선택 유틸리티
// OS 로케일과 무관하게 24시간 형식(00:00~23:50)을 보장하는
// 커스텀 <select> 기반 시간 선택기.
// 숨겨진 input에 HH:mm 값을 저장하여 기존 코드와 100% 호환.
// ═══════════════════════════════════════════════════════════════════

/**
 * 24시간 시간 선택기를 생성합니다.
 *
 * @param id - 숨겨진 input의 id (기존 time input의 id와 동일)
 * @param defaultValue - 기본 시간 (HH:mm 형식, 예: "09:00")
 * @param step - 분 단위 간격(기본 10분). 표시할 분 옵션: 0,10,20,30,40,50 (step=10) 등
 * @param style - 컨테이너에 적용할 추가 inline style
 * @param className - 숨겨진 input에 적용할 class (기존 selector로 검색 시 호환)
 * @param dataIdx - data-idx 속성값 (개별 설정에 사용)
 * @returns HTML 문자열
 */
export function createTime24Select(opts: {
  id?: string;
  className?: string;
  defaultValue?: string;
  step?: number;
  style?: string;
  dataIdx?: string | number;
  selectStyle?: string;
}): string {
  const {
    id = '',
    className = '',
    defaultValue = '09:00',
    step = 10,
    style = '',
    dataIdx,
    selectStyle = '',
  } = opts;

  const [defH, defM] = (defaultValue || '09:00').split(':').map(Number);
  const hourVal = isNaN(defH) ? 9 : defH;
  const minVal = isNaN(defM) ? 0 : defM;

  // 시 옵션 생성 (00~23)
  let hourOptions = '';
  for (let h = 0; h < 24; h++) {
    const hStr = String(h).padStart(2, '0');
    const selected = h === hourVal ? ' selected' : '';
    hourOptions += `<option value="${hStr}"${selected}>${hStr}시</option>`;
  }

  // 분 옵션 생성 (step 간격)
  let minOptions = '';
  const minStep = step > 0 ? step : 10;
  for (let m = 0; m < 60; m += minStep) {
    const mStr = String(m).padStart(2, '0');
    const selected = m === minVal ? ' selected' : '';
    minOptions += `<option value="${mStr}"${selected}>${mStr}분</option>`;
  }

  const idAttr = id ? `id="${id}"` : '';
  const classAttr = className ? `class="${className}"` : '';
  const dataIdxAttr = dataIdx !== undefined ? `data-idx="${dataIdx}"` : '';

  // 기본 select 스타일 (기존 time input 스타일과 유사하게)
  const baseSelectStyle = selectStyle || 'padding: 0.35rem; border-radius: 6px; border: 1px solid rgba(59, 130, 246, 0.3); background: var(--bg-secondary, #222); color: var(--text-strong, #fff); font-size: 0.8rem; color-scheme: dark; cursor: pointer; min-width: 0;';

  // uuid로 시/분 select를 식별
  const uid = id || `t24_${Math.random().toString(36).slice(2, 8)}`;
  const hourSelectId = `${uid}__hour`;
  const minSelectId = `${uid}__min`;

  return `
    <div class="time24-select-wrap" style="display: inline-flex; align-items: center; gap: 2px; ${style}" ${dataIdxAttr}>
      <select id="${hourSelectId}" data-time24-hour="${uid}" style="${baseSelectStyle}">${hourOptions}</select>
      <span style="color: var(--text-muted, #999); font-weight: 700; font-size: 0.85rem;">:</span>
      <select id="${minSelectId}" data-time24-min="${uid}" style="${baseSelectStyle}">${minOptions}</select>
      <input type="hidden" ${idAttr} ${classAttr} ${dataIdxAttr} value="${String(hourVal).padStart(2, '0')}:${String(minVal).padStart(2, '0')}">
    </div>
  `.trim();
}

/**
 * 프로그래밍 방식으로 time24 선택기의 값을 설정합니다.
 * hidden input의 value를 변경하고 시/분 select UI도 동기화합니다.
 *
 * @param id - hidden input의 id
 * @param value - HH:mm 형식의 시간값
 * @param container - 검색 범위 (기본: document)
 */
export function setTime24Value(id: string, value: string, container: HTMLElement | Document = document): void {
  const hidden = container.querySelector<HTMLInputElement>(`input[type="hidden"][id="${id}"]`);
  if (hidden) {
    hidden.value = value;
  }
  const [h, m] = (value || '09:00').split(':');
  const hourSelect = container.querySelector<HTMLSelectElement>(`select[data-time24-hour="${id}"]`);
  const minSelect = container.querySelector<HTMLSelectElement>(`select[data-time24-min="${id}"]`);
  if (hourSelect) hourSelect.value = (h || '09').padStart(2, '0');
  if (minSelect) minSelect.value = (m || '00').padStart(2, '0');
}

/**
 * class + data-idx 기반으로 time24 선택기의 값을 설정합니다.
 * 개별 설정 모달의 각 행에서 사용.
 *
 * @param wrapSelector - .time24-select-wrap을 찾기 위한 추가 셀렉터 (data-idx 기준)
 * @param idx - data-idx 값
 * @param value - HH:mm 형식의 시간값
 * @param container - 검색 범위
 */
export function setTime24ValueByIdx(idx: string | number, value: string, container: HTMLElement | Document = document): void {
  const wrap = container.querySelector<HTMLElement>(`.time24-select-wrap[data-idx="${idx}"]`);
  if (!wrap) return;
  const hidden = wrap.querySelector<HTMLInputElement>('input[type="hidden"]');
  if (hidden) {
    hidden.value = value;
  }
  const [h, m] = (value || '09:00').split(':');
  const hourSelect = wrap.querySelector<HTMLSelectElement>('select[data-time24-hour]');
  const minSelect = wrap.querySelector<HTMLSelectElement>('select[data-time24-min]');
  if (hourSelect) hourSelect.value = (h || '09').padStart(2, '0');
  if (minSelect) minSelect.value = (m || '00').padStart(2, '0');
}

/**
 * 페이지 내의 모든 time24-select 이벤트를 바인딩합니다.
 * 시/분 select가 변경되면 숨겨진 input의 value를 HH:mm으로 업데이트.
 *
 * 반드시 DOM에 렌더링 된 후 호출해야 합니다.
 * @param container - 이벤트를 바인딩할 범위 (기본: document)
 */
export function bindTime24Events(container: HTMLElement | Document = document): void {
  // 시 select 변경 이벤트
  container.querySelectorAll<HTMLSelectElement>('select[data-time24-hour]').forEach(hourSelect => {
    if ((hourSelect as any).__time24Bound) return; // 중복 방지
    (hourSelect as any).__time24Bound = true;

    hourSelect.addEventListener('change', () => {
      const uid = hourSelect.getAttribute('data-time24-hour')!;
      const minSelect = container.querySelector<HTMLSelectElement>(`select[data-time24-min="${uid}"]`);
      const hidden = container.querySelector<HTMLInputElement>(`input[type="hidden"][id="${uid}"]`)
        || container.querySelector<HTMLInputElement>(`.time24-select-wrap[data-idx="${hourSelect.closest('.time24-select-wrap')?.getAttribute('data-idx')}"] input[type="hidden"]`);

      if (hidden && minSelect) {
        hidden.value = `${hourSelect.value}:${minSelect.value}`;
        // 호환성: change 이벤트 발생
        hidden.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  });

  // 분 select 변경 이벤트
  container.querySelectorAll<HTMLSelectElement>('select[data-time24-min]').forEach(minSelect => {
    if ((minSelect as any).__time24Bound) return;
    (minSelect as any).__time24Bound = true;

    minSelect.addEventListener('change', () => {
      const uid = minSelect.getAttribute('data-time24-min')!;
      const hourSelect = container.querySelector<HTMLSelectElement>(`select[data-time24-hour="${uid}"]`);
      const hidden = container.querySelector<HTMLInputElement>(`input[type="hidden"][id="${uid}"]`)
        || container.querySelector<HTMLInputElement>(`.time24-select-wrap[data-idx="${minSelect.closest('.time24-select-wrap')?.getAttribute('data-idx')}"] input[type="hidden"]`);

      if (hidden && hourSelect) {
        hidden.value = `${hourSelect.value}:${minSelect.value}`;
        hidden.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  });
}
