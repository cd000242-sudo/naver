/**
 * 이미지-텍스트 일관성 검증 모듈
 *
 * 네이버 QUMA-VL 대응: 발행 전 이미지와 텍스트의 시각적 일관성을 검증하여
 * 불일치로 인한 랭킹 하락을 방지한다.
 *
 * - Gemini Vision API (gemini-2.5-flash) 사용
 * - fail-open 전략: API 실패 시 score 50 반환
 * - 로컬 파일 자동 base64 변환
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConsistencyResult {
  readonly score: number;
  readonly reason: string;
  readonly isRelevant: boolean;
  readonly imageUrl: string;
  readonly checkedAt: string;
}

export interface BatchConsistencyResult {
  readonly passed: boolean;
  readonly overallScore: number;
  readonly results: readonly ConsistencyResult[];
  readonly failedIndices: readonly number[];
}

interface GeminiResponseCandidate {
  readonly content?: {
    readonly parts?: ReadonlyArray<{ readonly text?: string }>;
  };
}

interface GeminiResponse {
  readonly candidates?: readonly GeminiResponseCandidate[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const RELEVANCE_THRESHOLD = 40;
const MAX_CONCURRENT = 5;
const ALT_TEXT_MIN_LENGTH = 20;
const ALT_TEXT_MAX_LENGTH = 60;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isLocalFile(urlOrPath: string): boolean {
  if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
    return false;
  }
  return fs.existsSync(urlOrPath);
}

function readLocalImageAsBase64(filePath: string): { base64: string; mimeType: string } {
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();

  const mimeMap: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
  };

  return {
    base64: buffer.toString('base64'),
    mimeType: mimeMap[ext] ?? 'image/jpeg',
  };
}

function buildImagePart(imageUrl: string): Record<string, unknown> {
  if (isLocalFile(imageUrl)) {
    const { base64, mimeType } = readLocalImageAsBase64(imageUrl);
    return {
      inlineData: { mimeType, data: base64 },
    };
  }

  return {
    inlineData: undefined,
    fileData: undefined,
    // Gemini accepts image URLs via inlineData with a fetch-then-encode approach
    // but for remote URLs we fetch first
  };
}

async function fetchRemoteImageAsBase64(url: string): Promise<{ base64: string; mimeType: string }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') ?? 'image/jpeg';
  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');

  return { base64, mimeType: contentType.split(';')[0].trim() };
}

async function resolveImagePart(imageUrl: string): Promise<Record<string, unknown>> {
  if (isLocalFile(imageUrl)) {
    const { base64, mimeType } = readLocalImageAsBase64(imageUrl);
    return { inlineData: { mimeType, data: base64 } };
  }

  const { base64, mimeType } = await fetchRemoteImageAsBase64(imageUrl);
  return { inlineData: { mimeType, data: base64 } };
}

async function callGeminiVision(
  parts: ReadonlyArray<Record<string, unknown>>,
  apiKey: string,
): Promise<string> {
  const url = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 256,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error('Gemini API returned empty response');
  }

  return text;
}

function parseScoreResponse(raw: string): { score: number; reason: string } {
  // JSON 블록 추출 시도
  const jsonMatch = raw.match(/\{[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { score?: number; reason?: string };
      const score = typeof parsed.score === 'number'
        ? Math.max(0, Math.min(100, parsed.score))
        : 50;
      const reason = typeof parsed.reason === 'string' ? parsed.reason : '분석 완료';
      return { score, reason };
    } catch {
      // JSON 파싱 실패 — 아래 폴백으로
    }
  }

  // 숫자만 추출 시도
  const numMatch = raw.match(/(\d{1,3})/);
  const score = numMatch ? Math.max(0, Math.min(100, parseInt(numMatch[1], 10))) : 50;

  return { score, reason: raw.slice(0, 200) };
}

function createFailOpenResult(imageUrl: string): ConsistencyResult {
  return {
    score: 50,
    reason: 'API 호출 실패 — fail-open 기본값 적용',
    isRelevant: true,
    imageUrl,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Promise를 최대 N개씩 병렬 실행하는 헬퍼
 */
async function parallelLimit<T>(
  tasks: ReadonlyArray<() => Promise<T>>,
  limit: number,
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;

  async function runNext(): Promise<void> {
    while (index < tasks.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await tasks[currentIndex]();
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, tasks.length) },
    () => runNext(),
  );

  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * 단일 이미지-텍스트 일관성 검증
 *
 * Gemini Vision API로 이미지와 텍스트의 관련성 점수(0-100)를 산출한다.
 * API 실패 시 score 50 / isRelevant true를 반환한다 (fail-open).
 */
export async function checkImageTextConsistency(
  imageUrl: string,
  textContext: string,
  apiKey: string,
): Promise<ConsistencyResult> {
  try {
    const imagePart = await resolveImagePart(imageUrl);

    const prompt =
      '이 이미지가 다음 텍스트와 얼마나 관련이 있는지 0-100 점수로 평가해주세요. ' +
      '점수와 간단한 이유를 JSON으로 답변해주세요. ' +
      '형식: {"score": 숫자, "reason": "이유"}\n\n' +
      `텍스트: ${textContext}`;

    const responseText = await callGeminiVision(
      [imagePart, { text: prompt }],
      apiKey,
    );

    const { score, reason } = parseScoreResponse(responseText);

    return {
      score,
      reason,
      isRelevant: score >= RELEVANCE_THRESHOLD,
      imageUrl,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[ConsistencyChecker] 검증 실패:', error instanceof Error ? error.message : error);
    return createFailOpenResult(imageUrl);
  }
}

/**
 * 배치 이미지-텍스트 일관성 검증
 *
 * 여러 이미지를 최대 5개씩 병렬로 검증한다.
 * 전체 통과 여부, 평균 점수, 개별 결과, 불합격 인덱스를 반환한다.
 */
export async function batchCheckConsistency(
  items: ReadonlyArray<{ readonly imageUrl: string; readonly heading: string; readonly bodySnippet: string }>,
  apiKey: string,
): Promise<BatchConsistencyResult> {
  if (items.length === 0) {
    return {
      passed: true,
      overallScore: 100,
      results: [],
      failedIndices: [],
    };
  }

  const tasks = items.map((item) => () => {
    const textContext = `${item.heading}\n${item.bodySnippet}`;
    return checkImageTextConsistency(item.imageUrl, textContext, apiKey);
  });

  const results = await parallelLimit(tasks, MAX_CONCURRENT);

  const failedIndices = results.reduce<readonly number[]>(
    (acc, result, idx) => (result.isRelevant ? acc : [...acc, idx]),
    [],
  );

  const totalScore = results.reduce((sum, r) => sum + r.score, 0);
  const overallScore = Math.round(totalScore / results.length);

  return {
    passed: failedIndices.length === 0,
    overallScore,
    results,
    failedIndices,
  };
}

/**
 * 이미지 ALT 텍스트 자동 생성
 *
 * Gemini Vision으로 네이버 SEO에 최적화된 한국어 ALT 텍스트(20~60자)를 생성한다.
 * API 실패 시 빈 문자열을 반환한다.
 */
export async function generateImageAltText(
  imageUrl: string,
  apiKey: string,
): Promise<string> {
  try {
    const imagePart = await resolveImagePart(imageUrl);

    const prompt =
      '이 이미지를 설명하는 한국어 ALT 텍스트를 생성해주세요. ' +
      '네이버 블로그 SEO에 적합하도록 핵심 키워드를 포함하세요. ' +
      `${ALT_TEXT_MIN_LENGTH}자 이상 ${ALT_TEXT_MAX_LENGTH}자 이하로 작성하세요. ` +
      'ALT 텍스트만 답변해주세요. 따옴표나 설명 없이 텍스트만 출력하세요.';

    const responseText = await callGeminiVision(
      [imagePart, { text: prompt }],
      apiKey,
    );

    const cleaned = responseText
      .replace(/^["']|["']$/g, '')
      .replace(/^alt\s*[:=]\s*/i, '')
      .trim();

    // 길이 제한 적용
    if (cleaned.length < ALT_TEXT_MIN_LENGTH) {
      return cleaned.padEnd(ALT_TEXT_MIN_LENGTH, ' ').trim();
    }

    if (cleaned.length > ALT_TEXT_MAX_LENGTH) {
      return cleaned.slice(0, ALT_TEXT_MAX_LENGTH);
    }

    return cleaned;
  } catch (error) {
    console.error('[ConsistencyChecker] ALT 텍스트 생성 실패:', error instanceof Error ? error.message : error);
    return '';
  }
}

// ═══════════════════════════════════════════════════════
// Phase 3-3: QUMA-VL 고도화
// ═══════════════════════════════════════════════════════

/**
 * 이미지 캡션과 본문 키워드 교차 검증
 *
 * 이미지의 ALT 텍스트/캡션이 본문의 주요 키워드와 일치하는지 확인.
 * QUMA-VL은 텍스트-이미지 뿐 아니라 캡션-본문 일관성도 평가.
 */
export interface CaptionCrossCheckResult {
  readonly captionText: string;
  readonly matchedKeywords: readonly string[];
  readonly matchScore: number;      // 0-100
  readonly isConsistent: boolean;   // score >= 30
}

export function crossCheckCaptionWithContent(
  caption: string,
  bodyText: string,
  headingText: string,
): CaptionCrossCheckResult {
  if (!caption || (!bodyText && !headingText)) {
    return { captionText: caption, matchedKeywords: [], matchScore: 0, isConsistent: true };
  }

  // 본문 + 소제목에서 2글자 이상 키워드 추출 (상위 15개)
  const combined = `${headingText} ${bodyText}`;
  const words = combined
    .replace(/[^\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F\sA-Za-z0-9]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2);

  const freq: Record<string, number> = {};
  for (const w of words) {
    freq[w] = (freq[w] ?? 0) + 1;
  }

  const topKeywords = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([word]) => word);

  // 캡션에 포함된 키워드 찾기
  const matchedKeywords = topKeywords.filter(kw => caption.includes(kw));

  // 점수 계산 (매칭 키워드 수 기반)
  const matchScore = Math.min(100, Math.round((matchedKeywords.length / Math.max(1, topKeywords.length)) * 200));

  return {
    captionText: caption,
    matchedKeywords,
    matchScore,
    isConsistent: matchScore >= 30 || caption.length < 5,
  };
}

/**
 * 발행 전 전체 이미지 일괄 검증 파이프라인
 *
 * 1. 이미지-텍스트 관련성 검증 (기존 batchCheckConsistency)
 * 2. 캡션-본문 교차 검증
 * 3. 종합 결과 반환
 */
export interface FullImageVerificationResult {
  readonly overallPassed: boolean;
  readonly consistencyResult: BatchConsistencyResult | null;
  readonly captionResults: readonly CaptionCrossCheckResult[];
  readonly failedImageIndices: readonly number[];
  readonly summary: string;
}

export async function verifyAllImagesBeforePublish(
  items: ReadonlyArray<{
    readonly imageUrl: string;
    readonly heading: string;
    readonly bodySnippet: string;
    readonly caption?: string;
  }>,
  apiKey: string,
  skipApiCheck: boolean = false,
): Promise<FullImageVerificationResult> {
  const failedIndices: number[] = [];

  // 1. API 기반 이미지-텍스트 관련성 (비용이 있으므로 선택적)
  let consistencyResult: BatchConsistencyResult | null = null;
  if (!skipApiCheck && apiKey) {
    try {
      consistencyResult = await batchCheckConsistency(
        items.map(i => ({
          imageUrl: i.imageUrl,
          heading: i.heading,
          bodySnippet: i.bodySnippet,
        })),
        apiKey,
      );
      failedIndices.push(...consistencyResult.failedIndices);
    } catch (error) {
      console.warn('[QUMA-VL] API 검증 실패, 캡션 검증만 진행:', error);
    }
  }

  // 2. 캡션-본문 교차 검증
  const captionResults: CaptionCrossCheckResult[] = items.map((item, idx) => {
    const result = crossCheckCaptionWithContent(
      item.caption ?? '',
      item.bodySnippet,
      item.heading,
    );
    if (!result.isConsistent && !failedIndices.includes(idx)) {
      failedIndices.push(idx);
    }
    return result;
  });

  // 3. 종합 판단
  const uniqueFailed = [...new Set(failedIndices)].sort((a, b) => a - b);
  const overallPassed = uniqueFailed.length === 0;

  const summary = overallPassed
    ? `${items.length}개 이미지 전부 통과`
    : `${uniqueFailed.length}/${items.length}개 이미지 불합격 (인덱스: ${uniqueFailed.join(', ')})`;

  console.log(`[QUMA-VL] 검증 완료: ${summary}`);

  return {
    overallPassed,
    consistencyResult,
    captionResults,
    failedImageIndices: uniqueFailed,
    summary,
  };
}
