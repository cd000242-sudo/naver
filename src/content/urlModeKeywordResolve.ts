/**
 * URL 모드 키워드 선정의 IO 층 — 모델 호출과 검색량 조회를 실제로 수행한다.
 * 결정 규칙은 urlModeKeywordPicker.ts(순수 함수)에 있다.
 *
 * [2026-08-23] 실패는 전부 "미선정"으로 흡수한다. 키워드를 못 고르는 건 예전 동작이고,
 *   여기서 예외를 던지면 사용자가 이미 값을 치른 생성이 통째로 죽는다.
 *   메모리 [자동 폴백 금지]와 충돌하지 않는다 — 사용자가 고른 *생성 모델*은 바꾸지 않는다.
 *   키워드 추론에만 저비용 보조 모델을 쓴다.
 */

import {
  buildKeywordInferencePrompt,
  parseKeywordCandidates,
  pickPrimaryKeyword,
  buildShoppingKeywordInferencePrompt,
  pickShoppingSearchKeyword,
  type ShoppingKeywordPick,
  type KeywordVolume,
  type UrlKeywordPick,
} from './urlModeKeywordPicker.js';

/** 검색량을 확인할 후보 수 상한 — 광고 API 호출을 늘리지 않기 위한 제한. */
const MAX_VOLUME_LOOKUPS = 3;
const INFERENCE_TIMEOUT_MS = 30_000;
const KEYWORD_INFERENCE_MODEL = 'gpt-4.1-mini';

export interface UrlKeywordDeps {
  /** 프롬프트를 넣으면 후보 목록 텍스트를 돌려준다. */
  readonly inferCandidates: (prompt: string) => Promise<string>;
  /** 월간 검색수(PC+모바일). 못 구하면 null. */
  readonly lookupVolume?: (keyword: string) => Promise<number | null>;
}

const NONE: UrlKeywordPick = Object.freeze({
  keyword: '',
  candidates: [],
  monthlySearches: null,
  decidedBy: 'none' as const,
  reason: '미선정',
});

export async function resolveUrlModeKeyword(
  rawText: string,
  sourceTitle: string | undefined,
  deps: UrlKeywordDeps,
): Promise<UrlKeywordPick> {
  let candidates: string[] = [];
  try {
    const answer = await deps.inferCandidates(buildKeywordInferencePrompt(rawText, sourceTitle));
    candidates = parseKeywordCandidates(answer);
  } catch (error) {
    console.warn('[UrlKeyword] 후보 추론 실패 — 키워드 미선정으로 진행:', (error as Error)?.message);
    return NONE;
  }
  if (candidates.length === 0) return NONE;

  const volumes: KeywordVolume[] = [];
  if (deps.lookupVolume) {
    const targets = candidates.slice(0, MAX_VOLUME_LOOKUPS);
    const results = await Promise.all(targets.map(async (keyword) => {
      try {
        return { keyword, monthlySearches: await deps.lookupVolume!(keyword) };
      } catch (error) {
        console.warn(`[UrlKeyword] 검색량 조회 실패(${keyword}):`, (error as Error)?.message);
        return { keyword, monthlySearches: null };
      }
    }));
    volumes.push(...results);
  }

  return pickPrimaryKeyword(candidates, volumes);
}

/** OpenAI 저비용 모델로 후보를 뽑는다. 키가 없으면 호출하지 않는다. */
export function createOpenAiCandidateInferencer(apiKey: string): UrlKeywordDeps['inferCandidates'] {
  return async (prompt: string): Promise<string> => {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: KEYWORD_INFERENCE_MODEL,
        messages: [{ role: 'user', content: prompt }],
        // max_completion_tokens: 최신 모델은 max_tokens를 거부한다 (2026-07 교훈).
        max_completion_tokens: 256,
      }),
      signal: AbortSignal.timeout(INFERENCE_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`OpenAI ${response.status}`);
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content || '';
  };
}

/**
 * 네이버 검색광고 API 기반 월간 검색수 조회기.
 * 광고 키가 없으면 undefined를 돌려준다 — 그러면 검색량 검증 없이 모델 1순위로 간다.
 */
export async function createNaverVolumeLookup(): Promise<UrlKeywordDeps['lookupVolume']> {
  try {
    const { loadConfig } = await import('../configManager.js');
    const config = await loadConfig();
    const apiKey = String((config as any)?.naverAdApiKey || '').trim();
    const secretKey = String((config as any)?.naverAdSecretKey || '').trim();
    const customerId = String((config as any)?.naverAdCustomerId || '').trim();
    if (!apiKey || !secretKey || !customerId) return undefined;

    const { KeywordAnalyzer } = await import('../analytics/keywordAnalyzer.js');
    const analyzer = new KeywordAnalyzer();
    analyzer.setNaverAdConfig({ apiKey, secretKey, customerId });
    const searchClientId = String((config as any)?.naverDatalabClientId || '').trim();
    const searchClientSecret = String((config as any)?.naverDatalabClientSecret || '').trim();
    if (searchClientId && searchClientSecret) {
      analyzer.setNaverSearchConfig({ clientId: searchClientId, clientSecret: searchClientSecret });
    }

    return async (keyword: string): Promise<number | null> => {
      // analyzeKeyword는 블로그 문서수까지 함께 조회한다. 광고 API만 따로 부르는 공개 진입점이
      // 없어 이걸 쓴다 — 후보 3개 상한을 둔 이유이기도 하다.
      const analysis = await analyzer.analyzeKeyword(keyword);
      const adData = (analysis as { naverAdData?: Record<string, number> })?.naverAdData;
      const pc = Number(adData?.monthlyPcQcCnt);
      const mobile = Number(adData?.monthlyMobileQcCnt);
      const total = (Number.isFinite(pc) ? pc : 0) + (Number.isFinite(mobile) ? mobile : 0);
      return total > 0 ? total : null;
    };
  } catch (error) {
    console.warn('[UrlKeyword] 검색량 조회기 준비 실패:', (error as Error)?.message);
    return undefined;
  }
}

/** 쇼핑 경로: 검색량을 확인할 후보 수 — 기존 키워드 1 + 후보 4. */
const MAX_SHOPPING_VOLUME_LOOKUPS = 5;

/**
 * [2026-09-02 사장님 승인 ②] 쇼핑 경로의 검색량 기반 키워드 선정 — IO 층.
 * 상위호환 1단 분석이 정한 메인 키워드(모델 판단)를, 사람들이 실제로 치는 상품 검색어 중 검색량이
 * 확실히 더 큰 것으로만 바꾼다. 검색량을 못 구하면(광고 키 없음) 바꾸지 않는다. 실패는 전부 "유지" 로 흡수한다.
 */
export async function resolveShoppingSearchKeyword(
  rawText: string,
  productName: string,
  existingKeyword: string,
  deps: UrlKeywordDeps,
): Promise<ShoppingKeywordPick> {
  const existing = String(existingKeyword || '').trim();
  const keep = (reason: string): ShoppingKeywordPick => ({ keyword: existing, replaced: false, candidates: [], reason });
  if (!existing) return keep('기존 키워드 없음');
  if (!deps.lookupVolume) return keep('검색량 조회 불가(광고 키 없음) — 모델 판단만으로는 바꾸지 않는다');
  let candidates: string[] = [];
  try {
    const answer = await deps.inferCandidates(buildShoppingKeywordInferencePrompt(rawText, productName, existing));
    candidates = parseKeywordCandidates(answer);
  } catch (error) {
    console.warn('[ShoppingKeyword] 후보 추론 실패 — 기존 유지:', (error as Error)?.message);
    return keep('후보 추론 실패');
  }
  const targets = [existing, ...candidates.filter((c) => c !== existing)].slice(0, MAX_SHOPPING_VOLUME_LOOKUPS);
  const volumes: KeywordVolume[] = await Promise.all(targets.map(async (keyword) => {
    try {
      return { keyword, monthlySearches: await deps.lookupVolume!(keyword) };
    } catch (error) {
      console.warn(`[ShoppingKeyword] 검색량 조회 실패(${keyword}):`, (error as Error)?.message);
      return { keyword, monthlySearches: null };
    }
  }));
  return pickShoppingSearchKeyword(existing, candidates, volumes);
}
