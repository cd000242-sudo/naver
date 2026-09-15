// src/crawler/issueHarness/textRoute.ts
//
// [2026-09-15 사장님] "남긴 것도 수정하고."
//
// 수집기의 검색어 플랜(제목·본문을 읽고 사건 맥락과 소제목별 검색어를 만드는 단계)도
// Gemini 로 박혀 있었다. 비전과 같은 원칙으로 — 고른 글생성 엔진 그대로 간다.
// 에이전트를 골랐으면 구독 CLI(추가 과금 0), API 모드면 그 벤더의 키로만.
// 고른 엔진을 쓸 수 없으면 null 이고, 플랜은 휴리스틱으로 내려간다(무료).

import { isAgentTextProvider } from '../../runtime/modelRegistry.js';

/** 모델 키 한 줄로 프롬프트를 보내고 원문 텍스트를 받는 호출. */
export type IssuePlanCaller = (prompt: string) => Promise<string>;

/**
 * 설정에 저장된 글생성 엔진 키(primaryGeminiTextModel)를
 * resolveSelectedEngineRoute 가 쓰는 generator 이름으로 옮긴다.
 *
 * 두 곳의 어휘가 다르다 — 저장값은 'openai-gpt41' / 'claude-sonnet' / 'gemini-3.5-flash'
 * 같은 모델 키고, 보조 호출 라우터는 벤더 이름('openai' / 'claude' / 'gemini')을 받는다.
 * 에이전트 값('agent-*')은 양쪽이 같아 그대로 넘긴다. 텍스트는 agy(agent-gemini)도 된다
 * — 비전만 막히는 제약이라 여기서는 거르지 않는다.
 */
export function resolveIssueTextGenerator(config: unknown): string {
  const c = (config ?? {}) as Record<string, unknown>;
  const engine = String(c.primaryGeminiTextModel ?? '').trim();
  if (!engine) return '';
  if (isAgentTextProvider(engine)) return engine;
  if (engine.startsWith('openai-')) return 'openai';
  if (engine.startsWith('claude-')) return 'claude';
  if (engine.startsWith('perplexity')) return 'perplexity';
  if (engine.startsWith('gemini-')) return 'gemini';
  return '';
}
