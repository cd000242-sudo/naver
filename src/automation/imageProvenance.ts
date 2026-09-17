// src/automation/imageProvenance.ts
// Single source of truth for "이 이미지는 AI 생성인가?" — 네이버 에디터의
// AI 활용 마크는 여기 판정으로만 결정한다.
//
// 정책: AI 엔진 허용목록 기반 opt-in. 앱이 스스로 생성한 이미지의 provider는
// 전부 우리가 부여하므로 허용목록으로 완전 커버되고, 모르는 이미지(수집·직접
// 삽입·태그 유실)는 절대 마크하지 않는다 — 실사진 오탐이 최악의 실패이기 때문.
// (2026-07-01 opt-in 전환 이후 "provider 없으면 스킵" 규칙과 결합해, 태깅이
//  없던 경로의 AI 썸네일이 전부 미마크되던 문제를 data-img-ai 태깅으로 해소.)

export const AI_MARK_ATTR = 'data-img-ai';

/** 앱의 AI 이미지 생성 엔진 provider 식별자 (부분 문자열 매칭, 소문자). */
const AI_PROVIDER_PATTERNS = [
  'nano-banana',
  'imagen',
  'gemini-image',
  'imagefx',
  'flow',
  'openai-image',
  'gpt-image',
  'dall',
  'prodia',
  'stability',
  'falai',
  'deepinfra',
  'leonardoai',
  'dropshot',
  'img2img',
  'ai-generated',
] as const;

export interface ImageProvenanceMeta {
  provider?: string;
  source?: string;
  isCollected?: boolean;
  aiGenerated?: boolean;
}

/** true = AI 생성 이미지 (네이버 AI 마크 대상). 불확실하면 항상 false. */
export function isAiGeneratedImage(meta: ImageProvenanceMeta | undefined | null): boolean {
  if (!meta) return false;
  if (meta.aiGenerated === true) return true;
  if (meta.isCollected === true) return false;
  const provider = String(meta.provider || '').toLowerCase();
  if (!provider) return false;
  return AI_PROVIDER_PATTERNS.some((p) => provider.includes(p));
}

/** data-img-ai 속성값: '1' = AI 생성, '0' = 실사진/수집/불명. */
export function aiMarkAttrValue(meta: ImageProvenanceMeta | undefined | null): '1' | '0' {
  return isAiGeneratedImage(meta) ? '1' : '0';
}

/**
 * [2026-09-17 사장님] "AI 생성 이미지는 자동으로 인식해서 체크되게 못하니?"
 *
 * 되고 있어야 했다 — 삽입 단계가 data-img-ai 를 img 에 찍고 발행 직전 루프가 읽는다.
 * 라이브 실측(나나 글): AI 생성 6장 전부 "ai=없음, provider=없음 → 마크 스킵". ImageManager 는
 * provider=openai-image 를 알고 있었다. 즉 판정이 아니라 **DOM 속성이 마크 시점까지 살아남지
 * 않는다**(업로드 완료 후 컴포넌트 재렌더 · 프레임 교체 뒤 evaluate 무음 실패 — 태깅은 .catch 로
 * 삼킨다). 그래서 삽입 시 판정을 자동화 인스턴스의 장부에도 적는다. 키는 삽입 직후 에디터
 * 이미지 개수 - 1, 즉 문서 순서상 위치 — 태깅 코드가 "마지막 img" 를 고르는 것과 같은 가정이다.
 * 발행 루프는 컴포넌트 i 를 장부 i 로 찾는다. 장부에 없으면 예전처럼 DOM 속성으로 간다.
 */
export interface ImageProvenanceLedgerEntry {
  readonly ai: '1' | '0';
  readonly provider: string;
}

const LEDGER_KEY = '__imageProvenanceLedger';

function ledgerOf(host: unknown): Map<number, ImageProvenanceLedgerEntry> | null {
  if (!host || typeof host !== 'object') return null;
  const h = host as Record<string, unknown>;
  if (!(h[LEDGER_KEY] instanceof Map)) h[LEDGER_KEY] = new Map<number, ImageProvenanceLedgerEntry>();
  return h[LEDGER_KEY] as Map<number, ImageProvenanceLedgerEntry>;
}

/** 발행 한 번마다 비운다 — 지난 글의 위치가 이번 글에 붙으면 실사진 오탐이 된다. */
export function resetImageProvenanceLedger(host: unknown): void {
  const ledger = ledgerOf(host);
  if (ledger) ledger.clear();
}

/** position = 삽입 직후 에디터 이미지 개수 - 1. 음수·비정수는 버린다. */
export function recordImageProvenance(
  host: unknown,
  position: number,
  meta: ImageProvenanceMeta | undefined | null,
): void {
  if (!Number.isInteger(position) || position < 0) return;
  const ledger = ledgerOf(host);
  if (!ledger) return;
  ledger.set(position, { ai: aiMarkAttrValue(meta), provider: String(meta?.provider || '') });
}

export function readImageProvenance(host: unknown, position: number): ImageProvenanceLedgerEntry | undefined {
  const ledger = ledgerOf(host);
  return ledger ? ledger.get(position) : undefined;
}

export function imageProvenanceLedgerSize(host: unknown): number {
  const ledger = ledgerOf(host);
  return ledger ? ledger.size : 0;
}
