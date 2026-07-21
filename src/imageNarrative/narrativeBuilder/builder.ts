/**
 * Narrative Builder — converts a NarrativePlan into StructuredContent
 * by loading the appropriate prompt template and calling the AI provider.
 *
 * Responsibilities:
 *   1. Load base.prompt + mode-specific prompt from src/prompts/imageNarrative/
 *   2. Build a user-facing prompt from NarrativePlan sections and beats
 *   3. Call the AI provider (Gemini / OpenAI / Claude)
 *   4. Parse the JSON response into StructuredContent shape
 *   5. Return a complete StructuredContent object
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { formatImageNarrativeContext } from '../context.js';
import { CLAUDE_MODELS, OPENAI_TEXT_MODELS } from '../../runtime/modelRegistry.js';
import type {
  ImageNarrativeContext,
  NarrativePlan,
  InferenceMode,
  VisionProvider,
} from '../types.js';
import type { StructuredContent } from '../../contentGenerator.js';
import type { AgentProductPolicyContext } from '../../agentCli/productPolicy.js';

// Resolved at runtime relative to this file: ../../prompts/imageNarrative/
const PROMPT_DIR = join(__dirname, '..', '..', '..', 'src', 'prompts', 'imageNarrative');

// Fallback for compiled output layout (dist/imageNarrative/narrativeBuilder/)
const PROMPT_DIR_DIST = join(__dirname, '..', '..', 'prompts', 'imageNarrative');

// ---------------------------------------------------------------------------
// Builder options
// ---------------------------------------------------------------------------

// Text-generation provider for the narrative writer. Extends VisionProvider with the agent
// CLIs (codex/claude/gemini subscription) — agent mode applies to the TEXT step only; image
// vision inference still uses a vision-capable vendor upstream.
export type NarrativeTextProvider = VisionProvider | 'agent-codex' | 'agent-claude' | 'agent-gemini';

export interface BuilderOptions {
  /** AI provider to use for content generation. Defaults to 'gemini'. */
  readonly provider?: NarrativeTextProvider;
  /** Target character count. Defaults to 1500. */
  readonly targetChars?: number;
  /** Speech style: formal / casual / friendly. Defaults to 'friendly'. */
  readonly toneStyle?: 'friendly' | 'formal' | 'casual';
  /** User-entered hints used to shape the final article. */
  readonly context?: ImageNarrativeContext;
  /** AbortSignal to cancel a long-running generation. */
  readonly signal?: AbortSignal;
  /** Opaque main-process context required by subscription-backed agent execution. */
  readonly agentProductPolicyContext?: AgentProductPolicyContext;
}

// ---------------------------------------------------------------------------
// Prompt loading
// ---------------------------------------------------------------------------

/**
 * Resolves the prompt directory, trying src layout first then dist layout.
 */
async function resolvePromptDir(): Promise<string> {
  const { access } = await import('fs/promises');
  try {
    await access(join(PROMPT_DIR, 'base.prompt'));
    return PROMPT_DIR;
  } catch {
    return PROMPT_DIR_DIST;
  }
}

async function loadPromptFile(promptDir: string, filename: string): Promise<string> {
  const fullPath = join(promptDir, filename);
  try {
    return await readFile(fullPath, 'utf-8');
  } catch {
    throw new Error(
      `[NarrativeBuilder] Prompt file not found: ${fullPath}. ` +
      'Ensure src/prompts/imageNarrative/ directory exists.',
    );
  }
}

/**
 * Returns the combined system prompt for a given mode.
 * Mode-specific prompt overrides / extends the base prompt.
 */
async function loadSystemPrompt(mode: InferenceMode): Promise<string> {
  const promptDir = await resolvePromptDir();
  const base = await loadPromptFile(promptDir, 'base.prompt');

  const modeFile = modeToPromptFile(mode);
  if (!modeFile) return base;

  try {
    const modeSpecific = await loadPromptFile(promptDir, modeFile);
    return `${base}\n\n${modeSpecific}`;
  } catch {
    // Mode-specific file absent — use base only
    return base;
  }
}

function modeToPromptFile(mode: InferenceMode): string | null {
  const map: Partial<Record<InferenceMode, string>> = {
    travel: 'travel.prompt',
    food: 'food.prompt',
    lodging: 'lodging.prompt',
    daily: 'daily.prompt',
    review: 'review.prompt',
    cafe: 'food.prompt', // cafe reuses food prompt
  };
  return map[mode] ?? null;
}

// ---------------------------------------------------------------------------
// User prompt construction
// ---------------------------------------------------------------------------

/**
 * Converts a NarrativePlan into a structured user prompt string.
 */
function buildUserPrompt(plan: NarrativePlan, options: BuilderOptions): string {
  // 1,500 → 2,500: 사진 글이 다른 툴 대비 빈약하다는 피드백 대응. 환각 없이 경험·오감·
  // 맥락을 깊게 풀어쓰도록 분량 기준 상향(프롬프트의 풍부화 규칙과 병행).
  const targetChars = options.targetChars ?? 2500;
  const tone = options.toneStyle ?? 'friendly';
  const contextBlock = formatImageNarrativeContext(options.context);

  const sectionsText = plan.sections
    .map((section, i) => {
      const beatsText = section.beats.map((b) => `  - ${b}`).join('\n');
      return (
        `## 섹션 ${i + 1}: ${section.heading}\n` +
        `이미지: ${section.imageRefs.join(', ')}\n` +
        `스토리 비트:\n${beatsText}`
      );
    })
    .join('\n\n');

  const moodKeywords = plan.orderedResults
    .flatMap((r) => [...r.result.mood_keywords])
    .slice(0, 6)
    .join(', ');

  return (
    `다음 사진 분석 결과를 바탕으로 한국어 블로그 글을 작성하세요.\n\n` +
    `콘텐츠 모드: ${plan.mode}\n` +
    `목표 글자 수: ${targetChars}자 (±15%)\n` +
    `말투: ${tone === 'friendly' ? '~해요 체 (친근하고 자연스럽게)' : tone === 'formal' ? '~합니다 체 (정중하게)' : '반말 (편하게)'}\n` +
    `전체 분위기 키워드: ${moodKeywords || '없음'}\n\n` +
    (contextBlock ? `${contextBlock}\n\n` : '') +
    `=== 사진 분석 결과 ===\n\n` +
    `${sectionsText}\n\n` +
    `=== 요구사항 ===\n` +
    `- 위 섹션별 이미지와 비트를 자연스럽게 엮어 블로그 글 작성\n` +
    `- 각 사진을 1~2줄로 끝내지 말 것. 그 순간의 감정·기대·오감(색·질감·향·온도·소리)과 ` +
    `전후 맥락(위 입력 정보 활용)을 충분히 풀어 ${targetChars}자 분량을 자연스럽게 채울 것\n` +
    `- 단, 사진에 없는 사실(가격·메뉴명·영업시간·상호 등)은 절대 지어내지 말 것 (군더더기 반복도 금지)\n` +
    `- 반드시 JSON 형식으로만 응답 (마크다운 코드 블록 없이)`
  );
}

// ---------------------------------------------------------------------------
// AI provider dispatch
// ---------------------------------------------------------------------------

async function callProvider(
  systemPrompt: string,
  userPrompt: string,
  provider: NarrativeTextProvider,
  signal?: AbortSignal,
  agentProductPolicyContext?: AgentProductPolicyContext,
): Promise<string> {
  const fullPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;

  switch (provider) {
    case 'gemini':
      return callGeminiProvider(fullPrompt, signal);
    case 'openai':
      return callOpenAIProvider(fullPrompt, signal);
    case 'claude':
      return callClaudeProvider(fullPrompt, signal);
    case 'agent-codex':
    case 'agent-claude':
    case 'agent-gemini':
      // 에이전트 모드 — 사용자 본인 구독 CLI로 글 작성 (공유 agentCli 서비스, 중복 구현 금지).
      // silent 폴백 금지: 실패는 AgentCliError 그대로 throw.
      return callAgentProvider(provider, fullPrompt, signal, agentProductPolicyContext);
    default:
      // deepinfra — fall back to gemini
      return callGeminiProvider(fullPrompt, signal);
  }
}

async function callAgentProvider(
  provider: 'agent-codex' | 'agent-claude' | 'agent-gemini',
  prompt: string,
  signal?: AbortSignal,
  agentProductPolicyContext?: AgentProductPolicyContext,
): Promise<string> {
  const { generateWithAgent } = await import('../../agentCli/index.js');
  const { wrapAsAgenticTask, AGENTIC_TIMEOUT_MS } = await import('../../agentCli/agenticEnvelope.js');
  const { agentTextProviderToCli } = await import('../../runtime/modelRegistry.js');
  const cliProvider = agentTextProviderToCli(provider);
  // Same autonomous-iteration upgrade as the main content path: one-shot -> internal loop.
  // 'photo' tailors the self-critique to image-grounded writing.
  const result = await generateWithAgent(
    {
      provider: cliProvider,
      prompt: wrapAsAgenticTask(prompt, 'photo'),
      timeoutMs: AGENTIC_TIMEOUT_MS,
      signal,
    },
    agentProductPolicyContext,
  );
  return result.text;
}

async function callGeminiProvider(
  prompt: string,
  signal?: AbortSignal,
): Promise<string> {
  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) throw new Error('[NarrativeBuilder] GEMINI_API_KEY not set');

  const { getGeminiModel } = await import('../../gemini.js');
  const { model } = getGeminiModel();

  const controller = signal ? undefined : new AbortController();
  const effectiveSignal = signal ?? controller?.signal;

  const timeoutId = controller
    ? setTimeout(() => controller.abort(), 60_000)
    : null;

  try {
    const request = model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      // 2048 → 8192: 한국어 풀 포스트(제목+도입+소제목 5개+결론) JSON이 2048 토큰에서 잘려
      // "Failed to parse AI response as JSON" 발생. 8192로 상향해 truncation 방지.
      generationConfig: { temperature: 0.6, maxOutputTokens: 8192 },
    });
    const result = await Promise.race([
      request,
      new Promise<never>((_, reject) => {
        effectiveSignal?.addEventListener('abort', () => {
          reject(effectiveSignal.reason ?? new Error('Gemini content generation timeout (60s)'));
        }, { once: true });
      }),
    ]);
    if (effectiveSignal?.aborted) throw new Error('Aborted');
    return result.response.text();
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function callOpenAIProvider(
  prompt: string,
  signal?: AbortSignal,
): Promise<string> {
  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey) throw new Error('[NarrativeBuilder] OPENAI_API_KEY not set');

  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({ apiKey });

  const response = await client.chat.completions.create(
    {
      model: OPENAI_TEXT_MODELS.TERRA,
      messages: [{ role: 'user', content: prompt }],
      reasoning_effort: 'high',
      max_completion_tokens: 16384,
      response_format: { type: 'json_object' },
    },
    { signal },
  );
  return response.choices[0]?.message?.content ?? '';
}

async function callClaudeProvider(
  prompt: string,
  signal?: AbortSignal,
): Promise<string> {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) throw new Error('[NarrativeBuilder] ANTHROPIC_API_KEY not set');

  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey });

  const message = await client.messages.create(
    {
      model: CLAUDE_MODELS.SONNET,
      max_tokens: 16384,
      messages: [{ role: 'user', content: prompt }],
    },
    { signal },
  );

  const block = message.content[0];
  if (block?.type === 'text') return block.text;
  throw new Error('[NarrativeBuilder] Unexpected Claude response format');
}

// ---------------------------------------------------------------------------
// JSON response parser
// ---------------------------------------------------------------------------

interface NarrativeJsonResponse {
  title?: string;
  introduction?: string;
  sections?: Array<{
    heading?: string;
    content?: string;
    imageRef?: string;
  }>;
  conclusion?: string;
  tags?: string[];
  seoKeyword?: string;
}

function parseNarrativeJson(raw: string): NarrativeJsonResponse {
  // Strip markdown code fences if present
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned) as NarrativeJsonResponse;
  } catch (err) {
    const embeddedJson = extractFirstJsonObject(cleaned);
    if (embeddedJson) {
      try {
        return JSON.parse(embeddedJson) as NarrativeJsonResponse;
      } catch {
        // Fall through to the diagnostic error below.
      }
    }
    throw new Error(
      `[NarrativeBuilder] Failed to parse AI response as JSON. ` +
      `Raw (first 200 chars): ${cleaned.substring(0, 200)}`,
    );
  }
}

function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i]!;
    if (escaping) {
      escaping = false;
      continue;
    }
    if (char === '\\') {
      escaping = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{') depth++;
    if (char === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// StructuredContent builder
// ---------------------------------------------------------------------------

function toStructuredContent(
  parsed: NarrativeJsonResponse,
  plan: NarrativePlan,
): StructuredContent {
  const sections = normalizeSections(parsed, plan);
  const tags = sanitizeStringArray(parsed.tags);
  const bodyParts = sections.map((s) => {
    const heading = s.heading ? `<h3>${escapeHtml(s.heading)}</h3>` : '';
    const content = paragraphsToHtml(s.content);
    return `${heading}\n${content}`.trim();
  });

  const introHtml = parsed.introduction
    ? paragraphsToHtml(parsed.introduction)
    : '';
  const conclusionHtml = parsed.conclusion
    ? paragraphsToHtml(parsed.conclusion)
    : '';

  const bodyHtml = [introHtml, ...bodyParts, conclusionHtml]
    .filter(Boolean)
    .join('\n\n');

  const bodyPlain = bodyHtml.replace(/<[^>]+>/g, '');
  const selectedTitle = sanitizePlainText(parsed.title) || '블로그 글';

  return {
    status: 'success',
    generationTime: new Date().toISOString(),
    selectedTitle,
    titleAlternatives: [],
    titleCandidates: [],
    bodyHtml,
    bodyPlain,
    headings: sections.map((s, i) => ({
      title: s.heading || `Section ${i + 1}`,
      // 섹션 본문을 summary에 실어 반자동 편집기(fillSemiAutoFields)가 소제목별 본문을
      // 재구성할 수 있게 한다. 비워두면 편집탭 본문이 제목만 남는다(2026-06 제보).
      summary: s.content,
      keywords: tags,
      imagePrompt: plan.sections[i]?.imageRefs[0] ?? '',
    })),
    hashtags: tags,
    images: plan.orderedResults.map((r) => ({
      heading: r.result.location_hint || r.result.scene_type,
      prompt: r.result.description_ko,
      placement: 'inline',
      alt: r.result.description_ko,
      caption: r.result.description_ko,
    })),
    metadata: {
      category: plan.mode,
      targetAge: 'all' as const,
      urgency: 'evergreen' as const,
      estimatedReadTime: `${Math.ceil(bodyPlain.length / 600)}분`,
      wordCount: bodyPlain.length,
      aiDetectionRisk: 'low' as const,
      legalRisk: 'safe' as const,
      seoScore: 0,
      keywordStrategy: sanitizePlainText(parsed.seoKeyword),
      publishTimeRecommend: '',
    },
    quality: {
      aiDetectionRisk: 'low' as const,
      legalRisk: 'safe' as const,
      seoScore: 0,
      originalityScore: 0,
      readabilityScore: 0,
      warnings: [...plan.warnings],
    },
    introduction: sanitizePlainText(parsed.introduction),
    conclusion: sanitizePlainText(parsed.conclusion),
  };
}

function normalizeSections(
  parsed: NarrativeJsonResponse,
  plan: NarrativePlan,
): Array<{ heading: string; content: string; imageRef?: string }> {
  const parsedSections = (parsed.sections ?? [])
    .map((section) => ({
      heading: sanitizePlainText(section.heading),
      content: sanitizePlainText(section.content),
      imageRef: sanitizePlainText(section.imageRef),
    }))
    .filter((section) => section.heading || section.content);

  if (parsedSections.length > 0) return parsedSections;

  return plan.sections.map((section, index) => ({
    heading: sanitizePlainText(section.heading) || `Section ${index + 1}`,
    content: buildFallbackSectionContent(section.imageRefs, section.beats, plan),
    imageRef: section.imageRefs[0],
  }));
}

function buildFallbackSectionContent(
  imageRefs: readonly string[],
  beats: readonly string[],
  plan: NarrativePlan,
): string {
  const fromBeats = beats.map(sanitizePlainText).filter(Boolean);
  if (fromBeats.length > 0) return fromBeats.join('\n\n');

  const refSet = new Set(imageRefs);
  const fromResults = plan.orderedResults
    .filter((result) => refSet.has(result.imageId))
    .map((result) => sanitizePlainText(result.result.description_ko))
    .filter(Boolean);

  return fromResults.join('\n\n') || '사진 순서에 맞춰 장면을 정리했습니다.';
}

function paragraphsToHtml(text: string | undefined): string {
  const cleaned = sanitizePlainText(text);
  if (!cleaned) return '';

  return cleaned
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

function sanitizePlainText(value: unknown): string {
  return String(value ?? '')
    .replace(/\u0000/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, '')
    .trim();
}

function sanitizeStringArray(values: unknown): string[] {
  return Array.isArray(values)
    ? values.map(sanitizePlainText).filter(Boolean).slice(0, 20)
    : [];
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#039;';
      default: return ch;
    }
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Converts a NarrativePlan into a StructuredContent object.
 *
 * @param plan    - Aggregated narrative plan from the Aggregator.
 * @param options - Provider, tone, target character count, etc.
 * @returns StructuredContent ready for publishing or preview.
 * @throws Error if prompt loading or AI call fails.
 */
export async function buildNarrativeContent(
  plan: NarrativePlan,
  options: BuilderOptions = {},
): Promise<StructuredContent> {
  const provider: NarrativeTextProvider = options.provider ?? 'gemini';

  // Step 1: Load system prompt
  const systemPrompt = await loadSystemPrompt(plan.mode);

  // Step 2: Build user prompt from NarrativePlan
  const userPrompt = buildUserPrompt(plan, options);

  // Step 3: Call AI provider
  const rawResponse = await callProvider(
    systemPrompt,
    userPrompt,
    provider,
    options.signal,
    options.agentProductPolicyContext,
  );

  if (!rawResponse || !rawResponse.trim()) {
    throw new Error(
      '[NarrativeBuilder] AI provider returned empty response.',
    );
  }

  // Step 4: Parse JSON response
  const parsed = parseNarrativeJson(rawResponse);

  // Step 5: Convert to StructuredContent
  return toStructuredContent(parsed, plan);
}
