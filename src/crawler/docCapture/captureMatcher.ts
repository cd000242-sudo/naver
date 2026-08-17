// src/crawler/docCapture/captureMatcher.ts
// Stage 3: Vision matching — which captured segment belongs under which
// heading. Fail-closed like the issue-harness vision gate: an unjudged
// segment is never placed. JSON mode + generous output budget (Gemini 3.x
// thinking-token trap, verified 2026-08-16).

import sharp from 'sharp';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI_TEXT_MODELS } from '../../runtime/modelRegistry.js';
import { trackGeminiUsage } from '../../gemini.js';
import type { CapturedSegment, SegmentVerdict } from './types.js';

const LOG = '[DocCaptureMatcher]';
const BATCH_SIZE = 6;
/** Documents need legible text — larger than the issue-gate's 512px. */
const VISION_WIDTH = 768;

export function buildMatcherPrompt(
  headings: readonly string[],
  headingGoals: readonly string[],
  count: number,
): string {
  const headingList = headings
    .map((h, i) => `${i + 1}. ${h} — 원하는 내용: ${headingGoals[i] || '관련 공식 안내'}`)
    .join('\n');
  return `당신은 블로그 편집자입니다. 아래는 정부 공식 페이지에서 캡처한 화면 ${count}장입니다.

# 글의 소제목 목록 (번호 고정)
${headingList}

# 각 캡처에 대해 판정
- headingIndex: 이 캡처가 들어가면 좋은 소제목 번호 (1~${headings.length}). 어떤 소제목과도 안 맞으면 0
- isOfficial: 공고문·안내문·표·기준 등 실제 문서 내용이 화면의 주요 부분인가 (메뉴/배너/푸터/검색결과 목록 위주면 false)
- legible: 블로그에 넣었을 때 글자를 읽을 수 있는 수준인가
- summary: 화면 내용 한 줄 요약 (한국어)

⚠️ 같은 소제목에 여러 캡처가 맞으면 각각 그 번호를 주세요 (최종 선택은 시스템이 합니다). 확신 없으면 headingIndex 0.

# 출력 (JSON 하나만, 설명 금지)
{"results":[{"index":1,"headingIndex":2,"isOfficial":true,"legible":true,"summary":"..."}]}`;
}

/** Exported for unit tests — fail-closed verdict parsing. */
export function parseMatcherVerdicts(text: string, count: number, headingCount: number): Array<SegmentVerdict | null> {
  const empty: Array<SegmentVerdict | null> = Array.from({ length: count }, () => null);
  const cleaned = String(text || '').replace(/```(?:json)?/gi, '').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return empty;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as { results?: Array<Record<string, unknown>> };
    if (!Array.isArray(parsed.results)) return empty;
    return Array.from({ length: count }, (_, i) => {
      const raw = parsed.results!.find((r) => Number(r?.index) === i + 1);
      if (!raw) return null;
      const headingIndexRaw = Number((raw as any).headingIndex);
      const headingIndex = Number.isInteger(headingIndexRaw) && headingIndexRaw >= 0 && headingIndexRaw <= headingCount
        ? headingIndexRaw
        : 0;
      return {
        headingIndex,
        isOfficial: (raw as any).isOfficial === true,
        legible: (raw as any).legible === true,
        summary: String((raw as any).summary || '').trim(),
      };
    });
  } catch {
    return empty;
  }
}

/** Vision-match all segments to headings. Returns verdicts aligned to input order. */
export async function matchSegmentsToHeadings(
  segments: readonly CapturedSegment[],
  headings: readonly string[],
  headingGoals: readonly string[],
  geminiApiKey: string,
): Promise<Array<SegmentVerdict | null>> {
  const verdicts: Array<SegmentVerdict | null> = Array.from({ length: segments.length }, () => null);
  if (segments.length === 0) return verdicts;

  const client = new GoogleGenerativeAI(geminiApiKey);
  const model = client.getGenerativeModel({
    model: GEMINI_TEXT_MODELS.FLASH,
    generationConfig: { temperature: 0.1, maxOutputTokens: 4096, responseMimeType: 'application/json' },
  });

  for (let start = 0; start < segments.length; start += BATCH_SIZE) {
    const batch = segments.slice(start, start + BATCH_SIZE);
    try {
      const parts: any[] = [];
      for (const seg of batch) {
        const jpeg = await sharp(seg.buffer)
          .resize({ width: VISION_WIDTH, withoutEnlargement: true })
          .jpeg({ quality: 78 })
          .toBuffer();
        parts.push({ inlineData: { mimeType: 'image/jpeg', data: jpeg.toString('base64') } });
      }
      parts.push({ text: buildMatcherPrompt(headings, headingGoals, batch.length) });

      const result = await model.generateContent(parts);
      const usage = (result.response as any).usageMetadata;
      if (usage) {
        const p = usage.promptTokenCount || 0;
        const t = usage.totalTokenCount || 0;
        trackGeminiUsage(GEMINI_TEXT_MODELS.FLASH, p, t > p ? t - p : (usage.candidatesTokenCount || 0));
      }
      const batchVerdicts = parseMatcherVerdicts(result.response.text().trim(), batch.length, headings.length);
      batchVerdicts.forEach((v, bi) => { verdicts[start + bi] = v; });
    } catch (error) {
      console.warn(`${LOG} ⚠️ 배치 매칭 실패 (fail-closed, ${batch.length}컷 미배치): ${(error as Error).message}`);
    }
  }

  const matched = verdicts.filter((v) => v && v.headingIndex > 0 && v.isOfficial && v.legible).length;
  console.log(`${LOG} ✅ ${segments.length}컷 중 ${matched}컷이 소제목과 매칭됨`);
  return verdicts;
}
