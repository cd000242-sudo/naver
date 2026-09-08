// src/main/ipc/selectedEngineTextCaller.ts
// [2026-09-09] 이미지 보조 추론(검색어 최적화 · 핵심 주제 · 소제목 매칭)을 사용자가 고른
// 엔진으로 돌리기 위한 창구.
//
// 왜: 이 보조 호출들은 엔진 선택과 무관하게 Gemini 로 직행했다. GPT 를 골라 둔 사용자도
// 소제목마다 Gemini 를 때려 분당 한도(429)를 맞았다(사용자 실측). 사장님이 세운
// "보조 호출도 선택 엔진으로" 규칙을 지키는 자리다.
//
// 설계 원칙 두 가지.
//   1) 선택 엔진이 Gemini 이거나 키가 없으면 null 을 돌려준다 → 호출부는 기존 경로를
//      그대로 탄다. 즉 이 모듈은 "다른 엔진일 때만" 개입한다.
//   2) 실패해도 다른 벤더로 몰래 넘어가지 않는다. 자동 폴백 금지는 이 프로젝트의 규칙이다.

import { loadConfig } from '../../configManager.js';

export interface SelectedEngineTextCaller {
  /** 로그에 찍을 엔진/모델 이름. */
  readonly engine: string;
  /** 프롬프트 하나를 보내고 텍스트를 받는다. */
  readonly callText: (prompt: string, maxTokens?: number) => Promise<string>;
}

/** 구독 CLI 는 API 호출보다 훨씬 느리다 — 보조 호출에 몇 분을 쓸 수는 없다. */
const SIDE_CALL_TIMEOUT_MS = 60_000;

/**
 * 사용자가 고른 엔진의 텍스트 호출기를 만든다.
 *
 * @returns Gemini 선택 / 키 없음 / 해석 불가면 null (호출부는 기존 Gemini 경로 유지)
 */
export async function resolveSelectedEngineTextCaller(): Promise<SelectedEngineTextCaller | null> {
  try {
    const config = ((await loadConfig().catch(() => null)) as Record<string, unknown> | null) ?? {};
    const generator = String((config as any).defaultAiProvider || '').trim();

    // 선택이 없거나 Gemini 면 기존 경로가 이미 정답이다.
    if (!generator || generator === 'gemini') return null;

    const { resolveSelectedEngineRoute } = await import('./paraphraseAnalysisHandlers.js');
    const route = resolveSelectedEngineRoute(generator, config);
    if (!route) {
      // 키가 없어서 경로를 못 만든 경우. 여기서 다른 벤더로 넘어가지 않는다 —
      // 호출부의 기존 경로(및 그 자체 폴백)에 맡긴다.
      console.warn(`[SideCall] ⚠️ 선택 엔진(${generator}) 경로를 만들지 못했습니다 — 기존 경로를 사용합니다.`);
      return null;
    }

    return {
      engine: route.engine,
      callText: (prompt: string, maxTokens?: number) => route.callModel(prompt, {
        maxTokens,
        timeoutMs: route.subscription ? 180_000 : SIDE_CALL_TIMEOUT_MS,
      }),
    };
  } catch (error) {
    console.warn('[SideCall] ⚠️ 선택 엔진 해석 실패 — 기존 경로를 사용합니다:', (error as Error).message);
    return null;
  }
}
