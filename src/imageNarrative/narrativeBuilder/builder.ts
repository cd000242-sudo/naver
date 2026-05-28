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
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { NarrativePlan, InferenceMode, VisionProvider } from '../types.js';
import type { StructuredContent } from '../../contentGenerator.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolved at runtime relative to this file: ../../prompts/imageNarrative/
const PROMPT_DIR = join(__dirname, '..', '..', '..', 'src', 'prompts', 'imageNarrative');

// Fallback for compiled output layout (dist/imageNarrative/narrativeBuilder/)
const PROMPT_DIR_DIST = join(__dirname, '..', '..', 'prompts', 'imageNarrative');

// ---------------------------------------------------------------------------
// Builder options
// ---------------------------------------------------------------------------

export interface BuilderOptions {
  /** AI provider to use for content generation. Defaults to 'gemini'. */
  readonly provider?: VisionProvider;
  /** Target character count. Defaults to 1500. */
  readonly targetChars?: number;
  /** Speech style: formal / casual / friendly. Defaults to 'friendly'. */
  readonly toneStyle?: 'friendly' | 'formal' | 'casual';
  /** AbortSignal to cancel a long-running generation. */
  readonly signal?: AbortSignal;
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
  const targetChars = options.targetChars ?? 1500;
  const tone = options.toneStyle ?? 'friendly';

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
    `=== 사진 분석 결과 ===\n\n` +
    `${sectionsText}\n\n` +
    `=== 요구사항 ===\n` +
    `- 위 섹션별 이미지와 비트를 자연스럽게 엮어 블로그 글 작성\n` +
    `- 사진에 없는 정보는 절대 추가하지 말 것\n` +
    `- 반드시 JSON 형식으로만 응답 (마크다운 코드 블록 없이)`
  );
}

// ---------------------------------------------------------------------------
// AI provider dispatch
// ---------------------------------------------------------------------------

async function callProvider(
  systemPrompt: string,
  userPrompt: string,
  provider: VisionProvider,
  signal?: AbortSignal,
): Promise<string> {
  const fullPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;

  switch (provider) {
    case 'gemini':
      return callGeminiProvider(fullPrompt, signal);
    case 'openai':
      return callOpenAIProvider(fullPrompt, signal);
    case 'claude':
      return callClaudeProvider(fullPrompt, signal);
    default:
      // deepinfra — fall back to gemini
      return callGeminiProvider(fullPrompt, signal);
  }
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
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.6, maxOutputTokens: 2048 },
    });
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
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6,
      max_tokens: 2048,
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
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
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
    throw new Error(
      `[NarrativeBuilder] Failed to parse AI response as JSON. ` +
      `Raw (first 200 chars): ${cleaned.substring(0, 200)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// StructuredContent builder
// ---------------------------------------------------------------------------

function toStructuredContent(
  parsed: NarrativeJsonResponse,
  plan: NarrativePlan,
): StructuredContent {
  const sections = parsed.sections ?? [];
  const bodyParts = sections.map((s) => {
    const heading = s.heading ? `<h3>${s.heading}</h3>` : '';
    const content = s.content
      ? s.content
          .split('\n\n')
          .map((p) => `<p>${p.trim()}</p>`)
          .join('\n')
      : '';
    return `${heading}\n${content}`;
  });

  const introHtml = parsed.introduction
    ? `<p>${parsed.introduction}</p>`
    : '';
  const conclusionHtml = parsed.conclusion
    ? `<p>${parsed.conclusion}</p>`
    : '';

  const bodyHtml = [introHtml, ...bodyParts, conclusionHtml]
    .filter(Boolean)
    .join('\n\n');

  const bodyPlain = bodyHtml.replace(/<[^>]+>/g, '');

  return {
    status: 'success',
    generationTime: new Date().toISOString(),
    selectedTitle: parsed.title ?? '블로그 글',
    titleAlternatives: [],
    titleCandidates: [],
    bodyHtml,
    bodyPlain,
    headings: sections.map((s, i) => ({
      title: s.heading ?? `섹션 ${i + 1}`,
      summary: '',
      keywords: parsed.tags ?? [],
      imagePrompt: plan.sections[i]?.imageRefs[0] ?? '',
    })),
    hashtags: parsed.tags ?? [],
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
      keywordStrategy: parsed.seoKeyword ?? '',
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
    introduction: parsed.introduction,
    conclusion: parsed.conclusion,
  };
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
  const provider: VisionProvider = options.provider ?? 'gemini';

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
