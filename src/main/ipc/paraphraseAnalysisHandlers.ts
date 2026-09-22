// paraphraseAnalysisHandlers.ts — stage 1 of the paraphrase chain, main-process side.
//
// 렌더러는 모델을 직접 부르지 못한다. 이 핸들러가 사용자가 고른 엔진으로 원본 글을 읽고
// "왜 떴는가" 분석 JSON을 돌려준다. 실패는 예외가 아니라 success:false 로 나간다 —
// 분석은 보조 단계이고, 페러프레이징은 재료 없이도 계속 가야 한다.

import { ipcMain } from 'electron';
import {
  PARAPHRASE_ANALYSIS_SCHEMA,
  analyzeParaphraseSource,
  buildParaphraseUpgradeBrief,
  type ParaphraseAnalysisInput,
} from '../../content/paraphraseSourceAnalysis.js';
import { resolveTextModelProfileForVendor } from '../../runtime/modelRegistry.js';
import { buildGeminiModelChain } from '../../contentGeminiModelPolicy.js';

/**
 * Utility-tier models: cheap models for mechanical side work (paraphrase source
 * analysis, image search-term tweaks). Quality-critical stages (blueprint, fact
 * check, throughline judge, heading repair, issue discipline) must NOT use these —
 * they call resolveSelectedEngineRoute(..., { tier: 'quality' }).
 * [2026-09-22 audit P0] The user selects Terra/Fable but quality stages silently ran
 * on mini/haiku/flash-lite and rewrote the body. Quality tier resolves the user's
 * own primary model for the selected vendor.
 */
const OPENAI_ANALYSIS_MODEL = 'gpt-4.1-mini';
const CLAUDE_ANALYSIS_MODEL = 'claude-haiku-4-5-20251001';
const GEMINI_ANALYSIS_MODEL = 'gemini-3.1-flash-lite';
const ANALYSIS_TIMEOUT_MS = 90_000;
const MAX_INPUT_CHARS = 20_000;
// Default output cap for side calls. Callers that need a longer structured answer (the 설계도) pass maxTokens.
const DEFAULT_MAX_OUTPUT_TOKENS = 2048;

export interface AnalysisCallOptions {
  readonly maxTokens?: number;
  /** Subscription CLIs are far slower than an API call; a caller that can wait says so. */
  readonly timeoutMs?: number;
}

function resolveTimeout(options?: AnalysisCallOptions): number {
  const requested = Number(options?.timeoutMs);
  return Number.isFinite(requested) && requested > 0 ? Math.min(600_000, Math.floor(requested)) : ANALYSIS_TIMEOUT_MS;
}

function resolveMaxTokens(options?: AnalysisCallOptions): number {
  const requested = Number(options?.maxTokens);
  return Number.isFinite(requested) && requested > 0 ? Math.min(16_384, Math.floor(requested)) : DEFAULT_MAX_OUTPUT_TOKENS;
}

export interface ParaphraseAnalysisHandlerDeps {
  loadConfig: () => Promise<Record<string, unknown>>;
}

function requireText(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.slice(0, limit) : '';
}

async function callOpenAi(prompt: string, apiKey: string, options?: AnalysisCallOptions, model: string = OPENAI_ANALYSIS_MODEL): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      // max_completion_tokens: 최신 모델은 max_tokens 를 거부한다 (2026-07 교훈).
      max_completion_tokens: resolveMaxTokens(options),
    }),
    signal: AbortSignal.timeout(ANALYSIS_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`OpenAI ${response.status}`);
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content || '';
}

async function callClaude(prompt: string, apiKey: string, options?: AnalysisCallOptions, model: string = CLAUDE_ANALYSIS_MODEL): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: resolveMaxTokens(options),
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(ANALYSIS_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Claude ${response.status}`);
  const data = (await response.json()) as { content?: Array<{ text?: string }> };
  return data.content?.[0]?.text || '';
}

async function callGemini(prompt: string, apiKey: string, model: string, options?: AnalysisCallOptions): Promise<string> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const client = new GoogleGenerativeAI(apiKey);
  const generative = client.getGenerativeModel({
    model,
    generationConfig: { temperature: 0.2, maxOutputTokens: resolveMaxTokens(options) },
  });
  const result = await generative.generateContent(prompt);
  return result.response.text();
}

/** 구독 에이전트(codex/claude/gemini)로 분석. 스키마를 주면 CLI가 JSON을 강제한다. */
async function callAgent(provider: 'codex' | 'claude' | 'gemini', prompt: string): Promise<string> {
  const { generateWithAgent } = await import('../../agentCli/index.js');
  const { createAgentProductPolicyContext } = await import('../../agentCli/productPolicy.js');
  const result = await generateWithAgent(
    { provider, prompt, schema: PARAPHRASE_ANALYSIS_SCHEMA, timeoutMs: ANALYSIS_TIMEOUT_MS },
    createAgentProductPolicyContext({ allowClaudeSubscription: true }),
  );
  return result.json ? JSON.stringify(result.json) : result.text;
}

/** 구독 에이전트로 자유 형식 텍스트 답을 받는다 — 스키마가 분석용이라 다른 보조 작업에는 맞지 않는다. */
async function callAgentText(provider: 'codex' | 'claude' | 'gemini', prompt: string, options?: AnalysisCallOptions): Promise<string> {
  const { generateWithAgent } = await import('../../agentCli/index.js');
  const { createAgentProductPolicyContext } = await import('../../agentCli/productPolicy.js');
  const result = await generateWithAgent(
    { provider, prompt, timeoutMs: resolveTimeout(options) },
    createAgentProductPolicyContext({ allowClaudeSubscription: true }),
  );
  return result.text;
}

async function callPerplexity(prompt: string, apiKey: string, model: string, options?: AnalysisCallOptions): Promise<string> {
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: resolveMaxTokens(options) }),
    signal: AbortSignal.timeout(ANALYSIS_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Perplexity ${response.status}`);
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content || '';
}

export interface AnalysisRoute {
  engine: string;
  /** True for the subscription CLIs — callers budget minutes, not seconds. */
  subscription?: boolean;
  /** 'quality' = the user's own primary model; 'utility' = cheap analysis model. */
  tier?: SideCallTier;
  callModel: (prompt: string, options?: AnalysisCallOptions) => Promise<string>;
}

export type SideCallTier = 'quality' | 'utility';

export interface RouteOptions {
  readonly tier?: SideCallTier;
}

/** The model the user actually selected for the vendor (quality tier). null when unresolvable. */
export function resolveQualityTierModel(generator: string, config: Record<string, unknown>): string | null {
  const primary = typeof config.primaryGeminiTextModel === 'string' ? config.primaryGeminiTextModel : '';
  try {
    if (generator === 'openai') return resolveTextModelProfileForVendor(primary, 'openai', 'openai-gpt41').model;
    if (generator === 'claude') return resolveTextModelProfileForVendor(primary, 'claude', 'claude-sonnet').model;
    if (generator === 'gemini') {
      return buildGeminiModelChain({
        primaryGeminiTextModel: primary || undefined,
        geminiModel: typeof config.geminiModel === 'string' ? config.geminiModel : undefined,
      }).primaryModel;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * 사용자가 고른 엔진을 그대로 쓴다. 에이전트면 구독으로(추가 과금 없음), API 키 모드면
 * 설정된 키 중 가장 싼 순서(openai → gemini → claude)로 — factCheckRouter 와 같은 규칙이다.
 * 이건 사용자가 고른 *본문 생성* 엔진을 몰래 바꾸는 폴백이 아니라, 보조 분석 단계의 경로다.
 */
/** [2026-08-29] URL 모드에서도 같은 라우팅을 쓰려고 export 한다 — 엔진 선택 규칙을 한 곳에 둔다. */
export function resolveRoute(generator: string, config: Record<string, unknown>): AnalysisRoute | null {
  // [2026-09-03 사장님] 예전엔 API 모드에서 "키 있는 순서(openai → gemini → claude)" 로 골랐다 — 사용자가 Gemini 를
  //   골랐어도 OpenAI 키가 있으면 OpenAI 로 갔다. 이제 고른 엔진 그대로만 간다 (아래 resolveSelectedEngineRoute).
  return resolveSelectedEngineRoute(generator, config);
}

/**
 * [2026-09-03 사장님] 보조 호출(소제목 보정 등)은 사용자가 고른 엔진 *그대로* 간다.
 * resolveRoute 와 달리 키가 있는 다른 벤더로 건너가지 않는다 — 고른 엔진의 키가 없으면 null 이고
 * 호출 측은 그 단계를 건너뛴다(조용한 폴백 금지). 에이전트면 그 구독 CLI, API 키 모드면 그 벤더의
 * 키와 그 벤더의 저비용 모델. 원래 소제목 보정기가 OpenAI gpt-4.1-mini 로 박혀 있던 것을 고친 자리.
 */
export function resolveSelectedEngineRoute(
  generator: string,
  config: Record<string, unknown>,
  routeOptions: RouteOptions = {},
): AnalysisRoute | null {
  const key = (name: string): string => (typeof config[name] === 'string' ? (config[name] as string).trim() : '');
  const tier: SideCallTier = routeOptions.tier === 'quality' ? 'quality' : 'utility';
  const qualityModel = tier === 'quality' ? resolveQualityTierModel(generator, config) : null;
  if (generator === 'agent-codex') return { engine: 'codex(구독)', subscription: true, tier, callModel: (p, o) => callAgentText('codex', p, o) };
  if (generator === 'agent-claude') return { engine: 'claude(구독)', subscription: true, tier, callModel: (p, o) => callAgentText('claude', p, o) };
  if (generator === 'agent-gemini') return { engine: 'gemini(구독)', subscription: true, tier, callModel: (p, o) => callAgentText('gemini', p, o) };
  if (generator === 'openai') {
    const openaiKey = key('openaiApiKey');
    const model = qualityModel || OPENAI_ANALYSIS_MODEL;
    return openaiKey ? { engine: model, tier, callModel: (p, o) => callOpenAi(p, openaiKey, o, model) } : null;
  }
  if (generator === 'gemini') {
    const geminiKey = key('geminiApiKey');
    if (!geminiKey) return null;
    const model = qualityModel || key('geminiModel') || GEMINI_ANALYSIS_MODEL;
    return { engine: model, tier, callModel: (p, o) => callGemini(p, geminiKey, model, o) };
  }
  if (generator === 'claude') {
    const claudeKey = key('claudeApiKey');
    const model = qualityModel || CLAUDE_ANALYSIS_MODEL;
    return claudeKey ? { engine: model, tier, callModel: (p, o) => callClaude(p, claudeKey, o, model) } : null;
  }
  if (generator === 'perplexity') {
    const perplexityKey = key('perplexityApiKey');
    if (!perplexityKey) return null;
    const model = key('perplexityModel') || 'sonar';
    return { engine: model, tier, callModel: (p, o) => callPerplexity(p, perplexityKey, model, o) };
  }
  return null;
}

export function registerParaphraseAnalysisHandlers(deps: ParaphraseAnalysisHandlerDeps): void {
  ipcMain.handle('paraphrase:analyzeSource', async (_event, payload: unknown) => {
    try {
      const source = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
      const input: ParaphraseAnalysisInput = {
        title: requireText(source.title, 300),
        body: requireText(source.body, MAX_INPUT_CHARS),
        hashtags: requireText(source.hashtags, 500) || undefined,
      };
      if (!input.body.trim()) return { success: false, reason: 'empty_body' };

      const config = await deps.loadConfig();
      const route = resolveRoute(requireText(source.generator, 40), config);
      if (!route) return { success: false, reason: 'no_engine' };

      const started = Date.now();
      const analysis = await analyzeParaphraseSource({ callModel: route.callModel }, input);
      if (!analysis) return { success: false, reason: 'unparsable', engine: route.engine };

      // 브리프까지 여기서 만든다 — 렌더러가 메인 프로세스 모듈을 import 하지 않게 하려는 것.
      return {
        success: true,
        analysis,
        brief: buildParaphraseUpgradeBrief(analysis),
        engine: route.engine,
        durationMs: Date.now() - started,
      };
    } catch (error) {
      return { success: false, reason: 'error', message: (error as Error)?.message };
    }
  });
}
