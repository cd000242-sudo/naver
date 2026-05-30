/**
 * imageGenStudio.ts
 *
 * "이미지 관리 → 🎨 이미지 생성" 서브탭: 멀티엔진 대량(batch) 이미지 생성 스튜디오.
 *
 * Ports from DROPSHOT_PORTING_KIT.md:
 *  - §12.9 parseBatchPromptList (1줄 vs N줄 자동 감지)
 *  - §12.8 모든 엔진 공통 variation seed (중복 이미지 차단)
 *  - §12.7 결과 lightbox
 *
 * Engine list mirrors src/runtime/imageEngineCatalog.ts (IMAGE_ENGINE_CATALOG).
 * Renderer convention: inline the catalog rather than importing main-side modules.
 */

import { openStudioLightbox, initStudioLightbox } from './imageGenStudioLightbox.js';
import {
  getSelectedEngine,
  populateEngineSelect,
  updateEngineNote,
  updateCostPreview,
  readCount,
  variationTail,
  parseBatchPromptList,
} from './imageGenStudioCore.js';

/** 비용 확인 모달을 띄우는 추가비용 임계값 (KRW). */
const COST_CONFIRM_THRESHOLD = 1000;

let _busy = false;
/** 현재 결과 그리드의 이미지 src 목록 (lightbox 네비게이션용). */
let _resultSrcs: string[] = [];

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

export function initImageGenStudio(): void {
  const panel = document.getElementById('images-subpanel-generate');
  if (!panel) {
    console.warn('[ImageGenStudio] generate subpanel not found — skipping init');
    return;
  }
  populateEngineSelect();
  _bindControls();
  initStudioLightbox();
  (window as any).switchImagesSubtab = _switchSubtab;
}

function _switchSubtab(name: 'manage' | 'generate'): void {
  const panels: Array<{ key: string; panel: string; btn: string }> = [
    { key: 'manage', panel: 'images-subpanel-manage', btn: 'images-subtab-manage' },
    { key: 'generate', panel: 'images-subpanel-generate', btn: 'images-subtab-generate' },
  ];
  for (const p of panels) {
    const panelEl = document.getElementById(p.panel);
    const btnEl = document.getElementById(p.btn);
    if (!panelEl || !btnEl) continue;
    const isActive = p.key === name;
    panelEl.style.display = isActive ? 'block' : 'none';
    btnEl.style.background = isActive ? 'var(--accent-primary)' : 'transparent';
    btnEl.style.color = isActive ? 'white' : 'var(--text-muted)';
  }
}

function _bindControls(): void {
  document.getElementById('imgstudio-engine')?.addEventListener('change', () => {
    updateEngineNote();
    updateCostPreview();
  });
  document.getElementById('imgstudio-prompt')?.addEventListener('input', updateCostPreview);
  document.getElementById('imgstudio-count')?.addEventListener('input', updateCostPreview);
  document.getElementById('imgstudio-generate-btn')?.addEventListener('click', () => void _run());
  document.getElementById('imgstudio-open-folder-btn')?.addEventListener('click', () => void _openSaveFolder());
  // 큰 미리보기 클릭 → 전체화면 라이트박스
  document.getElementById('imgstudio-preview-img')?.addEventListener('click', () => {
    if (_previewIndex >= 0) openStudioLightbox(_resultSrcs, _previewIndex);
  });
  updateCostPreview();
}

// ---------------------------------------------------------------------------
// Generate
// ---------------------------------------------------------------------------

async function _run(): Promise<void> {
  if (_busy) return;
  const api = (window as any).api;
  if (!api?.generateImages) {
    _setStatus('이미지 생성 API를 사용할 수 없습니다.', 'error');
    return;
  }

  const raw = (document.getElementById('imgstudio-prompt') as HTMLTextAreaElement | null)?.value ?? '';
  const prompts = parseBatchPromptList(raw);
  if (prompts.length === 0) {
    _setStatus('프롬프트를 한 줄 이상 입력하세요.', 'error');
    return;
  }

  const engine = getSelectedEngine();
  const count = readCount();
  const includeText = (document.getElementById('imgstudio-include-text') as HTMLInputElement | null)?.checked ?? false;
  const total = prompts.length * count;

  const estimate = total * engine.costKrw;
  if (estimate >= COST_CONFIRM_THRESHOLD) {
    const ok = window.confirm(
      `${engine.label}로 총 ${total}장을 생성합니다.\n예상 추가비용 약 ₩${estimate.toLocaleString()}.\n계속할까요?`
    );
    if (!ok) return;
  }

  // §12.8: 모든 엔진 공통, 매 item unique variation seed.
  const items = prompts.flatMap((prompt) =>
    Array.from({ length: count }, () => ({
      heading: '이미지 생성 스튜디오',
      prompt: `${prompt}${variationTail(includeText)}`,
      allowText: includeText,
    }))
  );

  _busy = true;
  _resultSrcs = [];
  _previewIndex = -1;
  _clearGrid();
  _clearLog();
  _studioLog(`${engine.label} · 프롬프트 ${prompts.length}개 × ${count}장 = 총 ${total}장 생성 시작`);
  _setStatus(`${engine.label} · 총 ${total}장 생성 중…`, 'info');
  _setGenerateDisabled(true);

  let cleanup: (() => void) | undefined;
  let received = 0;
  try {
    cleanup = api.onImageGenerated?.((data: { image: any }) => {
      const src = _imageSrc(data?.image);
      if (src) {
        _appendImage(src);
        received += 1;
        _setStatus(`${engine.label} · ${received}/${total}장 생성됨…`, 'info');
      }
    });

    const res = await api.generateImages({ provider: engine.value, items, isFullAuto: false });

    // onImageGenerated가 없는 엔진 폴백: 최종 결과로 그리드 채움.
    if (received === 0 && res?.images?.length) {
      for (const img of res.images) {
        const src = _imageSrc(img);
        if (src) _appendImage(src);
      }
    }

    const done = _resultSrcs.length;
    if (done === 0) {
      const msg = `생성 실패: ${res?.message || '이미지를 받지 못했습니다.'}`;
      _setStatus(msg, 'error');
      _studioLog(`❌ ${msg}`);
    } else {
      _setStatus(`✅ ${done}장 생성 완료. 결과는 저장 폴더에 자동 저장됩니다.`, 'success');
      _studioLog(`✅ ${done}/${total}장 생성 완료`);
    }
  } catch (err) {
    console.error('[ImageGenStudio] generate failed:', err);
    const msg = `생성 중 오류: ${(err as Error)?.message ?? err}`;
    _setStatus(msg, 'error');
    _studioLog(`❌ ${msg}`);
  } finally {
    cleanup?.();
    _busy = false;
    _setGenerateDisabled(false);
  }
}

function _imageSrc(img: any): string | null {
  if (!img) return null;
  return img.previewDataUrl || img.url || (img.filePath ? `file://${img.filePath}` : null);
}

async function _openSaveFolder(): Promise<void> {
  const api = (window as any).api;
  try {
    const path = await api?.getDefaultImageSavePath?.();
    if (path) await api?.openPath?.(path);
  } catch (err) {
    console.warn('[ImageGenStudio] open folder failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Grid + status
// ---------------------------------------------------------------------------

function _clearGrid(): void {
  const grid = document.getElementById('imgstudio-grid');
  if (grid) grid.innerHTML = '';
}

function _appendImage(src: string): void {
  const grid = document.getElementById('imgstudio-grid');
  if (!grid) return;
  const index = _resultSrcs.length;
  _resultSrcs.push(src);

  const cell = document.createElement('div');
  cell.className = 'imgstudio-cell';
  const img = document.createElement('img');
  img.src = src;
  img.loading = 'lazy';
  img.alt = `생성 이미지 ${index + 1}`;
  img.addEventListener('click', () => _showPreview(index));
  const dl = document.createElement('a');
  dl.href = src;
  dl.download = `studio-${Date.now()}-${index + 1}.png`;
  dl.className = 'imgstudio-dl';
  dl.textContent = '💾 저장';
  cell.appendChild(img);
  cell.appendChild(dl);
  grid.appendChild(cell);

  // 첫 이미지는 자동으로 큰 미리보기에 표시.
  if (index === 0) _showPreview(0);
}

function _setStatus(msg: string, kind: 'info' | 'error' | 'success'): void {
  const el = document.getElementById('imgstudio-status');
  if (!el) return;
  el.textContent = msg;
  el.dataset.kind = kind;
}

function _setGenerateDisabled(disabled: boolean): void {
  const btn = document.getElementById('imgstudio-generate-btn') as HTMLButtonElement | null;
  if (btn) btn.disabled = disabled;
}

// ---------------------------------------------------------------------------
// 큰 인라인 미리보기 (그리드 아래)
// ---------------------------------------------------------------------------

let _previewIndex = -1;

function _showPreview(index: number): void {
  const src = _resultSrcs[index];
  if (!src) return;
  _previewIndex = index;
  const wrap = document.getElementById('imgstudio-preview');
  const img = document.getElementById('imgstudio-preview-img') as HTMLImageElement | null;
  const caption = document.getElementById('imgstudio-preview-caption');
  if (img) img.src = src;
  if (caption) caption.textContent = `${index + 1} / ${_resultSrcs.length} · 클릭하면 전체화면`;
  if (wrap) wrap.style.display = 'block';
}

// ---------------------------------------------------------------------------
// 로그 (그리드 아래)
// ---------------------------------------------------------------------------

function _clearLog(): void {
  const log = document.getElementById('imgstudio-log');
  if (log) log.innerHTML = '';
}

function _studioLog(message: string): void {
  const log = document.getElementById('imgstudio-log');
  if (!log) return;
  const line = document.createElement('div');
  const time = new Date().toLocaleTimeString('ko-KR', { hour12: false });
  line.textContent = `[${time}] ${message}`;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}
