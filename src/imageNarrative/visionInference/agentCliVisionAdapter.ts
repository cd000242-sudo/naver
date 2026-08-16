/**
 * Agent-CLI vision adapter — photo inference through the user's subscription
 * CLIs instead of Vision API keys (feature request 2026-08-16: photo-mode for
 * every engine, zero API vision cost in agent mode).
 *
 * Verified live (2026-08-16):
 *   - claude 2.1.233: Read-only allowlist lets the model view staged images.
 *   - codex-cli 0.142.2: native `-i <file>` image input, prompt on stdin.
 *   - agy (Antigravity) 1.1.13: file-view tools are permission-gated in
 *     headless mode and the only bypass is --dangerously-skip-permissions —
 *     shipping that would grant shell access, so agent-gemini is explicitly
 *     UNSUPPORTED here (feedback_no_fallback: clear error, no silent reroute).
 *
 * One CLI call covers the whole photo set (a spawn costs 5–15s, so per-image
 * calls would multiply latency). Per-image failures inside the batch follow
 * the same majority rule as the API aggregator.
 */

import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { runClaude } from '../../agentCli/claudeRunner.js';
import { runCodex } from '../../agentCli/codexRunner.js';
import { stagedImageName } from '../../agentCli/imageStaging.js';
import { extractExifFromBuffer } from '../inferenceAggregator/exifEnricher.js';
import { buildPlanFromEnriched, type ImageInput } from '../inferenceAggregator/aggregator.js';
import { formatImageNarrativeContext } from '../context.js';
import type {
  EnrichedInferenceResponse,
  ImageInferenceResult,
  ImageNarrativeContext,
  InferenceMode,
  NarrativePlan,
  VisionProvider,
} from '../types.js';

const LOG = '[AgentCliVision]';
const DEFAULT_TIMEOUT_MS = 240_000;
const SCENE_TYPES: readonly InferenceMode[] = ['travel', 'food', 'lodging', 'daily', 'review', 'cafe', 'auto'];

export type AgentVisionProvider = 'agent-claude' | 'agent-codex';

export function isAgentCliVisionProvider(value: unknown): value is AgentVisionProvider {
  return value === 'agent-claude' || value === 'agent-codex';
}

/** Vendor label recorded on each inference (cost dashboards; subscription = 0 cost). */
const PROVIDER_LABEL: Record<AgentVisionProvider, VisionProvider> = {
  'agent-claude': 'claude',
  'agent-codex': 'openai',
};

const MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/bmp': '.bmp',
};

// ---------------------------------------------------------------------------
// Prompt (batch variant of inferencePrompts — one JSON object for N photos)
// ---------------------------------------------------------------------------

export function buildAgentVisionPrompt(
  fileNames: readonly string[],
  mode: InferenceMode,
  context?: ImageNarrativeContext,
  provider: AgentVisionProvider = 'agent-claude',
): string {
  const fileList = fileNames.map((f, i) => `${i + 1}. ${f}`).join('\n');
  const readInstruction = provider === 'agent-claude'
    ? `현재 작업 폴더에 사진 파일 ${fileNames.length}개가 있습니다. Read 도구로 각 파일을 순서대로 모두 읽어 실제 이미지를 확인하세요.`
    : `첨부된 사진 ${fileNames.length}장이 파일 목록 순서와 동일하게 제공됩니다.`;
  const contextBlock = formatImageNarrativeContext(context);

  return `당신은 한국어 블로그 사진 분석 전문 AI입니다.

${readInstruction}

# 사진 파일 목록 (순서 고정 — 사용자가 올린 업로드 순서와 동일)
${fileList}

사용자 힌트에서 "N번" / "N~M번" 사진은 위 목록의 N번째 파일(photo-0N)을 뜻합니다. 번호 묶음의 상황 설명을 해당 사진들의 해석에 우선 적용하세요.

# 각 사진에 대해 판정할 항목
- scene_type: travel|food|lodging|daily|review|cafe|auto 중 하나
- location_hint: 한국어 장소 설명 (사진에서 확인 불가하면 빈 문자열, 배경만 보고 추측 금지)
- food_items: 정확히 식별되는 음식명 배열 (음식 사진이 아니면 [])
- mood_keywords: 분위기 키워드 한국어 배열
- description_ko: 블로그 본문에 쓸 1~2문장 한국어 캡션 (실제로 보이는 것만)
- confidence: 0.0~1.0 (확신 못하면 낮게)

⚠️ 규칙: 확실하지 않은 정보는 절대 추측하지 마세요. 인물 신원 추측 금지.
${contextBlock ? `\n# 사용자 힌트\n${contextBlock}\n` : ''}
# 출력 형식 — 아래 JSON 객체 하나만 출력 (다른 텍스트/마크다운 금지)
{
  "results": [
    {"index": 1, "scene_type": "...", "location_hint": "...", "food_items": [], "mood_keywords": [], "description_ko": "...", "confidence": 0.8}
  ]
}
results 배열은 사진 목록과 같은 순서로 ${fileNames.length}개 항목이어야 합니다.`;
}

/** codex --output-schema payload (strict batch JSON). */
export function buildAgentVisionSchema(count: number): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      results: {
        type: 'array',
        minItems: count,
        maxItems: count,
        items: {
          type: 'object',
          properties: {
            index: { type: 'integer' },
            scene_type: { type: 'string', enum: [...SCENE_TYPES] },
            location_hint: { type: 'string' },
            food_items: { type: 'array', items: { type: 'string' } },
            mood_keywords: { type: 'array', items: { type: 'string' } },
            description_ko: { type: 'string' },
            confidence: { type: 'number' },
          },
          required: ['index', 'scene_type', 'location_hint', 'food_items', 'mood_keywords', 'description_ko', 'confidence'],
          additionalProperties: false,
        },
      },
    },
    required: ['results'],
    additionalProperties: false,
  };
}

// ---------------------------------------------------------------------------
// Response parsing (fail-closed per image)
// ---------------------------------------------------------------------------

export function parseAgentVisionResults(text: string, count: number): Array<ImageInferenceResult | null> {
  const empty: Array<ImageInferenceResult | null> = Array.from({ length: count }, () => null);
  const cleaned = String(text || '').replace(/```(?:json)?/gi, '').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return empty;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as { results?: Array<Record<string, unknown>> };
    if (!Array.isArray(parsed.results)) return empty;
    return Array.from({ length: count }, (_, i) => {
      const raw = parsed.results!.find((r) => Number(r?.index) === i + 1) ?? parsed.results![i];
      if (!raw || typeof raw !== 'object') return null;
      const description = String((raw as any).description_ko || '').trim();
      if (!description) return null; // caption-less inference is unusable downstream
      const sceneRaw = String((raw as any).scene_type || 'auto');
      const confidenceRaw = Number((raw as any).confidence);
      return {
        scene_type: (SCENE_TYPES as readonly string[]).includes(sceneRaw) ? (sceneRaw as InferenceMode) : 'auto',
        location_hint: String((raw as any).location_hint || '').trim(),
        food_items: Array.isArray((raw as any).food_items) ? (raw as any).food_items.map(String) : [],
        mood_keywords: Array.isArray((raw as any).mood_keywords) ? (raw as any).mood_keywords.map(String) : [],
        description_ko: description,
        confidence: Number.isFinite(confidenceRaw) ? Math.min(1, Math.max(0, confidenceRaw)) : 0.5,
      };
    });
  } catch {
    return empty;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface AgentVisionOptions {
  provider: AgentVisionProvider;
  mode?: InferenceMode;
  context?: ImageNarrativeContext;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * Full photo-set inference via one subscription-CLI call, returning the same
 * NarrativePlan shape as aggregateInferences (drop-in for the builder step).
 */
export async function aggregateInferencesViaAgentCli(
  images: readonly ImageInput[],
  options: AgentVisionOptions,
): Promise<NarrativePlan> {
  const mode = options.mode ?? 'auto';
  if (images.length === 0) {
    return buildPlanFromEnriched([], mode);
  }

  const startMs = Date.now();
  const dir = await mkdtemp(join(tmpdir(), 'agent-vision-'));
  try {
    // Stage buffers to files the CLI can access.
    const fileNames: string[] = [];
    const filePaths: string[] = [];
    for (let i = 0; i < images.length; i++) {
      const ext = MIME_EXT[images[i].mimeType?.toLowerCase() ?? ''] ?? '.jpg';
      const name = stagedImageName(i, `x${ext}`);
      const filePath = join(dir, name);
      await writeFile(filePath, images[i].buffer);
      fileNames.push(name);
      filePaths.push(filePath);
    }

    const prompt = buildAgentVisionPrompt(fileNames, mode, options.context, options.provider);
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    console.log(`${LOG} 🖼️ ${options.provider}로 사진 ${images.length}장 일괄 추론 시작`);
    const text = options.provider === 'agent-claude'
      ? await runClaude(prompt, { imagePaths: filePaths, timeoutMs, signal: options.signal })
      : await runCodex(prompt, {
          imagePaths: filePaths,
          schema: buildAgentVisionSchema(images.length),
          timeoutMs,
          signal: options.signal,
        });

    const results = parseAgentVisionResults(text, images.length);

    // EXIF enrichment mirrors the API aggregator.
    const exifResults = await Promise.all(images.map((img) => extractExifFromBuffer(img.buffer)));
    const latencyMs = Date.now() - startMs;
    const enriched: EnrichedInferenceResponse[] = [];
    results.forEach((result, i) => {
      if (!result) {
        console.warn(`${LOG} ⚠️ 사진 추론 누락 — 건너뜀: "${images[i].imageId}"`);
        return;
      }
      enriched.push({
        imageId: images[i].imageId,
        result,
        provider: PROVIDER_LABEL[options.provider],
        latencyMs,
        exif: exifResults[i] ?? {},
      });
    });

    // Same majority rule as aggregateInferences.
    const requiredSuccesses = Math.max(2, Math.ceil(images.length * 0.5));
    if (enriched.length < requiredSuccesses) {
      throw new Error(
        `사진 추론이 ${images.length}장 중 ${images.length - enriched.length}장 실패해 글을 구성할 수 없습니다 `
        + `(최소 ${requiredSuccesses}장 필요). 에이전트 CLI 로그인/사용량 상태를 확인해주세요.`,
      );
    }
    console.log(`${LOG} ✅ ${enriched.length}/${images.length}장 추론 완료 (${Math.round(latencyMs / 1000)}초, 구독 CLI — API 비용 0)`);
    return buildPlanFromEnriched(enriched, mode);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => { /* best-effort cleanup */ });
  }
}
