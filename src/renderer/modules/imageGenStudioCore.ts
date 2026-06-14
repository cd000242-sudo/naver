/**
 * imageGenStudioCore.ts
 *
 * Pure logic + engine/cost helpers for the image-generation studio.
 * Split from imageGenStudio.ts to keep each file under the 300-line limit.
 *
 * Ports from DROPSHOT_PORTING_KIT.md §12.9 (parseBatchPromptList) and §12.8 (variation seed).
 * Engine list mirrors src/runtime/imageEngineCatalog.ts (renderer inline convention).
 */

export interface StudioEngine {
  readonly value: string;
  readonly label: string;
  /** 1장당 추가 비용 (KRW). dropshot = 0 (구독자 무제한). */
  readonly costKrw: number;
  readonly note: string;
}

// Mirror of IMAGE_ENGINE_CATALOG (nano×3 · 덕테이프 · flow · prodia · dropshot).
const STUDIO_ENGINES: readonly StudioEngine[] = [
  { value: 'nano-banana-2', label: '🍌 나노바나나2 (Gemini 3.1 Flash)', costKrw: 97, note: '적정 가격 · 한글 텍스트 가능 · ★ 추천' },
  { value: 'nano-banana-pro', label: '🍌 나노바나나 프로 (Gemini 3 Pro)', costKrw: 185, note: '이미지 끝판왕 · 한글 최강 · 고가' },
  { value: 'nano-banana', label: '🍌 나노바나나 (Gemini 2.5 Flash)', costKrw: 54, note: '퀄리티 좋음 · 한글 텍스트 깨짐(구버전)' },
  { value: 'openai-image', label: '🦆 덕테이프 (OpenAI gpt-image-2)', costKrw: 280, note: '한글 텍스트 가능 · Org 인증 필요 · 고가' },
  { value: 'flow', label: '🍌 Flow (Google Labs)', costKrw: 0, note: 'Google Labs UI 자동화 · 로그인 필요 · 순차 생성' },
  { value: 'prodia', label: '⚡ Prodia', costKrw: 14, note: 'Prodia API · 빠른 저비용 이미지 생성 · API 키 필요' },
  { value: 'dropshot', label: '🍌 리더스 나노바나나 무제한', costKrw: 0, note: '구독자 무제한 · 추가비용 0원 (Pro 월 구독료 별도)' },
];

/** 한 번에 생성 가능한 최대 프롬프트 수 (kit §12.9 slice 50과 동일). */
const MAX_PROMPTS = 50;

// ---------------------------------------------------------------------------
// §12.9 — prompt 파싱 자동 감지 (1줄 vs N줄)
// ---------------------------------------------------------------------------

/**
 * 빈 줄 구분 → explicit / 평균 길이 ≥80자 또는 150자+ 줄 → 단일 prompt / 그 외 → 각 줄 = 1 prompt.
 */
export function parseBatchPromptList(raw: string): string[] {
  const text = String(raw || '');
  if (!text.trim()) return [];
  if (/\n\s*\n/.test(text)) {
    return text.split(/\n\s*\n+/).map((s) => s.trim()).filter(Boolean).slice(0, MAX_PROMPTS);
  }
  const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
  if (lines.length <= 1) return lines;
  const avgLen = lines.reduce((sum, l) => sum + l.length, 0) / lines.length;
  const hasLongLine = lines.some((l) => l.length >= 150);
  if (avgLen >= 80 || hasLongLine) return [lines.join(' ')];
  return lines.slice(0, MAX_PROMPTS);
}

// ---------------------------------------------------------------------------
// §12.8 — 매 호출 unique variation seed (모든 엔진 공통, dispatcher 외부 강제)
// ---------------------------------------------------------------------------

export function variationTail(includeText: boolean): string {
  const nonce = Math.random().toString(36).slice(2, 8);
  const ts = Date.now().toString(36);
  const variation = `\n\n[Gen-${ts}-${nonce}: unique composition, fresh angle, different subjects/setting/lighting — never duplicate previous outputs / 매번 완전히 다른 구도와 시점]`;
  const textTail = includeText
    ? `\n\n[IMPORTANT: Include clear, legible Korean text overlay on the image that visually summarizes the topic]`
    : '';
  return `${textTail}${variation}`;
}

// ---------------------------------------------------------------------------
// Engine select + cost preview (DOM helpers)
// ---------------------------------------------------------------------------

export function getSelectedEngine(): StudioEngine {
  const value = (document.getElementById('imgstudio-engine') as HTMLSelectElement | null)?.value;
  return STUDIO_ENGINES.find((e) => e.value === value) ?? STUDIO_ENGINES[0];
}

export function updateEngineNote(): void {
  const note = document.getElementById('imgstudio-engine-note');
  if (note) note.textContent = `💡 ${getSelectedEngine().note}`;
}

export function populateEngineSelect(): void {
  const select = document.getElementById('imgstudio-engine') as HTMLSelectElement | null;
  if (!select) return;
  select.innerHTML = STUDIO_ENGINES.map((e) => `<option value="${e.value}">${e.label}</option>`).join('');
  updateEngineNote();
}

export function readCount(): number {
  const raw = (document.getElementById('imgstudio-count') as HTMLInputElement | null)?.value;
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 20) : 1;
}

function plannedTotal(): { prompts: number; total: number } {
  const raw = (document.getElementById('imgstudio-prompt') as HTMLTextAreaElement | null)?.value ?? '';
  const prompts = parseBatchPromptList(raw).length;
  return { prompts, total: prompts * readCount() };
}

export function updateCostPreview(): void {
  const el = document.getElementById('imgstudio-cost');
  if (!el) return;
  const { prompts, total } = plannedTotal();
  const engine = getSelectedEngine();
  if (total === 0) {
    el.textContent = '프롬프트를 입력하세요.';
    return;
  }
  if (engine.costKrw === 0) {
    el.textContent = `프롬프트 ${prompts}개 → 총 ${total}장 · 구독자 무제한 · 추가비용 0원`;
  } else {
    el.textContent = `프롬프트 ${prompts}개 → 총 ${total}장 · 예상 추가비용 약 ₩${(total * engine.costKrw).toLocaleString()}`;
  }
}
