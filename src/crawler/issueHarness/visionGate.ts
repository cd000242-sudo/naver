// src/crawler/issueHarness/visionGate.ts
// Vision gate: the only stage that actually LOOKS at each image.
// Rejects visible watermarks, text overlays (captions/subtitles), and
// press/broadcast logos — URL heuristics cannot see any of these.
// Batched Gemini Flash calls (up to 8 images per call) keep cost at
// roughly 100~200 KRW per post; a hard per-run budget caps the worst case.

import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI_TEXT_MODELS } from '../../runtime/modelRegistry.js';
import { trackGeminiUsage } from '../../gemini.js';
import { toVisionJpegBase64, type FetchedCandidate } from './candidateFetcher.js';

const LOG = '[IssueVisionGate]';
const BATCH_SIZE = 8;

export interface VisionVerdict {
  clean: boolean;
  reason?: string;
}

export interface VisionGateBudget {
  /** Max images inspected per collection run (cost ceiling). */
  maxImages: number;
  inspected: number;
}

export function createVisionBudget(maxImages = 120): VisionGateBudget {
  return { maxImages, inspected: 0 };
}

/** 주제 컨텍스트 — 관련성 판정의 기준. 없으면 관련성 검사를 못 하므로 게이트가 막는다. */
export interface VisionSubjectContext {
  /** 글의 핵심 주체 (인물/팀). 예: "한다감" */
  mainSubject: string;
  /** 이 후보들이 들어갈 소제목 */
  heading: string;
}

/**
 * [2026-08-17] 관련성 판정 추가 — 라이브 실측: "깨끗한 고양이 사진"과
 * "깨끗한 패션 화보"가 워터마크/자막/로고/품질 4항목을 전부 통과해 연예 이슈
 * 글에 배치됐다. 게이트가 "깨끗한가"만 보고 "주제와 맞는가"를 안 봤기 때문.
 * 같은 배치 호출에 relevant 판정을 얹어 비용 증가 없이 막는다 (fail-closed).
 */
function buildVisionPrompt(ctx: VisionSubjectContext): string {
  return `당신은 블로그용 이미지 검수자입니다. 아래 이미지들을 순서대로 검사하세요.

# 글의 주제
- 핵심 주체: ${ctx.mainSubject}
- 이 이미지가 들어갈 소제목: ${ctx.heading}

각 이미지에 대해 판정:
- relevant: 이 사진이 위 "핵심 주체"(인물이면 그 인물 본인) 또는 소제목 주제와 실제로 관련 있는가.
  ⚠️ 주체가 인물인데 다른 사람·동물·상품·풍경·패션화보만 있으면 false.
  주체 인물이 사진에 없으면 false. 확신 없으면 false.
- watermark: 반투명/각인 워터마크, 스톡사진 마크, 언론사 저작권 표기가 보이는가
- textOverlay: 자막·캡션·제목 텍스트·말풍선 등 글자가 이미지 위에 얹혀 있는가 (옷의 로고 프린트, 배경 간판의 자연스러운 글자는 제외)
- logo: 방송사/언론사/채널 로고 마크가 박혀 있는가
- lowQuality: 심하게 흐리거나 깨졌거나 스크린샷 UI가 섞여 있는가

clean = relevant가 true이고, 나머지 4가지가 모두 아니오일 때만 true.
reason에는 false인 이유를 짧게 쓰세요 (예: "무관-고양이", "자막", "워터마크").

응답은 JSON 배열만 출력 (이미지 순서대로, 설명 금지):
[{"index":1,"relevant":true,"clean":true,"reason":""},{"index":2,"relevant":false,"clean":false,"reason":"무관-패션화보"}]`;
}

/** Exported for unit tests — fail-closed verdict parsing. */
export function parseVerdicts(text: string, count: number): VisionVerdict[] {
  const fallback: VisionVerdict[] = Array.from({ length: count }, () => ({
    clean: false,
    reason: 'parse-failed',
  }));
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return fallback;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as Array<{ index?: number; clean?: boolean; relevant?: boolean; reason?: string }>;
    return Array.from({ length: count }, (_, i) => {
      const match = parsed.find((p) => p.index === i + 1);
      // Fail-closed: an image the model did not judge is NOT clean.
      if (!match) return { clean: false, reason: 'no-verdict' };
      // 관련성은 별도 AND 조건 — 모델이 clean=true를 주면서 relevant를 빼먹거나
      // false로 주는 경우가 있어(라이브 실측: 무관 사진 통과) 코드에서 강제한다.
      const relevant = match.relevant === true;
      const cleanFlags = match.clean === true;
      return {
        clean: relevant && cleanFlags,
        reason: String(match.reason || (relevant ? '' : 'irrelevant')),
      };
    });
  } catch {
    return fallback;
  }
}

async function judgeBatch(
  batch: FetchedCandidate[],
  apiKey: string,
  ctx: VisionSubjectContext,
): Promise<VisionVerdict[]> {
  const client = new GoogleGenerativeAI(apiKey);
  // Thinking-capable Gemini 3.x consumes output budget on reasoning tokens —
  // JSON mode + a generous cap keep the verdict array from truncating
  // (truncation previously fail-closed entire batches: live E2E 2026-08-16).
  const model = client.getGenerativeModel({
    model: GEMINI_TEXT_MODELS.FLASH,
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
    },
  });

  const parts: any[] = [];
  for (const item of batch) {
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: await toVisionJpegBase64(item.buffer) } });
  }
  parts.push({ text: buildVisionPrompt(ctx) });

  const result = await model.generateContent(parts);
  const usage = (result.response as any).usageMetadata;
  if (usage) {
    const p = usage.promptTokenCount || 0;
    const t = usage.totalTokenCount || 0;
    trackGeminiUsage(GEMINI_TEXT_MODELS.FLASH, p, t > p ? t - p : (usage.candidatesTokenCount || 0));
  }
  return parseVerdicts(result.response.text().trim(), batch.length);
}

/**
 * Run the Vision gate over fetched candidates.
 * Returns only clean survivors, in input order.
 * - No API key → gate is skipped entirely (caller decides the policy).
 * - Budget exhausted → remaining images are not inspected (not passed).
 * - A failed batch call rejects that batch (fail-closed, never fail-open).
 */
export async function runVisionGate(
  items: FetchedCandidate[],
  apiKey: string,
  budget: VisionGateBudget,
  ctx: VisionSubjectContext,
  earlyExitAt?: number,
): Promise<FetchedCandidate[]> {
  if (items.length === 0) return [];
  // 주체가 없으면 관련성을 판정할 기준이 없다 → 전량 탈락(빈 슬롯).
  // 엉뚱한 이미지를 배치하는 것보다 비우는 게 낫다는 정책과 동일.
  if (!ctx.mainSubject?.trim()) {
    console.warn(`${LOG} ⛔ 핵심 주체 미상 — 관련성 판정 불가로 ${items.length}장 전량 미배치`);
    return [];
  }
  const survivors: FetchedCandidate[] = [];

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    if (earlyExitAt !== undefined && survivors.length >= earlyExitAt) break;
    const remainingBudget = budget.maxImages - budget.inspected;
    if (remainingBudget <= 0) {
      console.log(`${LOG} 💸 비전 예산 소진 (${budget.maxImages}장) — 잔여 후보 미검사`);
      break;
    }
    const batch = items.slice(i, i + Math.min(BATCH_SIZE, remainingBudget));
    budget.inspected += batch.length;
    try {
      const verdicts = await judgeBatch(batch, apiKey, ctx);
      batch.forEach((item, idx) => {
        if (verdicts[idx]?.clean) {
          survivors.push(item);
        } else {
          console.log(
            `${LOG} 🚫 탈락 (${verdicts[idx]?.reason || '?'}): ${item.candidate.url.slice(0, 70)}`,
          );
        }
      });
    } catch (error) {
      console.warn(`${LOG} ⚠️ 배치 검사 실패 (fail-closed, ${batch.length}장 탈락): ${(error as Error).message}`);
    }
  }

  console.log(`${LOG} ✅ ${items.length}장 중 ${survivors.length}장 통과 (검사 누적 ${budget.inspected}장)`);
  return survivors;
}
