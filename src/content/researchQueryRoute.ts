// src/content/researchQueryRoute.ts
// [2026-10-13 심층 리서치 A3] One low-cost call on the engine the user selected (utility tier) that turns the
// keyword into 5~8 search queries. Rules kept: the selected engine only (no vendor fallback), subscription CLIs
// are skipped because a research step cannot wait a minute, and any failure simply means "no extra rounds".

import { buildResearchQueryPrompt, parseResearchQueries } from './researchRounds.js';

export interface ResearchQueryRoute {
  readonly engine: string;
  readonly subscription?: boolean;
  callModel(prompt: string, options: { maxTokens?: number; timeoutMs?: number }): Promise<string>;
}

export interface ResearchQueryDeps {
  loadConfig(): Promise<Record<string, unknown> | null>;
  resolveRoute(generator: string, config: Record<string, unknown>): ResearchQueryRoute | null;
  log(message: string): void;
  /** API calls only; default 12s so the collection budget (45s) keeps most of its time for fetching. */
  timeoutMs?: number;
}

export const RESEARCH_QUERY_TIMEOUT_MS = 12_000;
const RESEARCH_QUERY_MAX_TOKENS = 300;

export async function resolveResearchQueries(keyword: string, mode: string | undefined, deps: ResearchQueryDeps): Promise<string[]> {
  const topic = String(keyword || '').trim();
  if (!topic) return [];
  try {
    const config = (await deps.loadConfig().catch(() => null)) ?? {};
    const generator = String((config as Record<string, unknown>).defaultAiProvider || '').trim();
    if (!generator) {
      deps.log('[심층 리서치] 글 생성 엔진이 선택되지 않아 질문 분해를 건너뜁니다.');
      return [];
    }
    const route = deps.resolveRoute(generator, config);
    if (!route) {
      deps.log(`[심층 리서치] ${generator} 저비용 경로를 만들 수 없어(키 없음) 질문 분해를 건너뜁니다.`);
      return [];
    }
    if (route.subscription) {
      deps.log(`[심층 리서치] ${route.engine} 는 구독 CLI 라 응답이 느려 질문 분해를 건너뜁니다.`);
      return [];
    }
    const reply = await route.callModel(buildResearchQueryPrompt(topic, mode), {
      maxTokens: RESEARCH_QUERY_MAX_TOKENS,
      timeoutMs: deps.timeoutMs ?? RESEARCH_QUERY_TIMEOUT_MS,
    });
    const queries = parseResearchQueries(reply, topic);
    deps.log(queries.length > 0
      ? `[심층 리서치] 질문 분해(${route.engine}) ${queries.length}개: ${queries.join(' · ')}`
      : `[심층 리서치] 질문 분해 응답에서 검색어를 읽지 못했습니다(${route.engine}) — 기본 수집만 진행`);
    return queries;
  } catch (error) {
    deps.log(`[심층 리서치] 질문 분해 실패 — 기본 수집만 진행: ${(error as Error)?.message || error}`);
    return [];
  }
}

/** Main-process wiring: config + the selected-engine route, loaded lazily so sourceAssembler keeps no static cycle. */
export async function resolveResearchQueriesForCollection(keyword: string, mode: string | undefined, log: (m: string) => void): Promise<string[]> {
  try {
    const [{ loadConfig }, { resolveSelectedEngineRoute }] = await Promise.all([
      import('../configManager.js'),
      import('../main/ipc/paraphraseAnalysisHandlers.js'),
    ]);
    return resolveResearchQueries(keyword, mode, {
      loadConfig: () => loadConfig() as Promise<Record<string, unknown>>,
      resolveRoute: (generator, config) => resolveSelectedEngineRoute(generator, config) as ResearchQueryRoute | null,
      log,
    });
  } catch (error) {
    log(`[심층 리서치] 질문 분해 모듈을 불러오지 못했습니다(생략): ${(error as Error)?.message || error}`);
    return [];
  }
}
