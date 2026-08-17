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
