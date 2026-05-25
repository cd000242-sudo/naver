/**
 * perplexityFactCheck.ts — Perplexity sonar 기반 사실 검증 + 자동 재작성
 *
 * 사용자 요청: "글 생성/풀오토/모든 모드에서 Perplexity로 fact 검증 (체크박스).
 *               의심 문장은 자동 재생성. 비용 차감 주의 띄움."
 *
 * 흐름:
 * 1. 글 본문을 Perplexity sonar에 보내고 환각/거짓 사실 찾으라고 query
 * 2. JSON 응답 파싱: { suspicious: [{ original, replacement, reason }] }
 * 3. 본문에서 suspicious.original → replacement로 치환 후 반환
 *
 * 비용: Perplexity sonar query 1회 ≈ ₩50~150 (글 길이/모델 의존)
 * 정책: 사용자가 체크박스로 명시 ON 시에만 호출 (기본 OFF)
 */

import { generatePerplexityContent } from './perplexity.js';

export interface SuspiciousItem {
  original: string;
  replacement: string;
  reason: string;
}

export interface FactCheckResult {
  suspicious: SuspiciousItem[];
  rawResponse: string;
  durationMs: number;
}

/**
 * 글 본문을 Perplexity로 fact-check + 의심 문장 자동 재작성.
 *
 * @param bodyPlain 원본 본문
 * @param topic 글 주제 (optional, 검증 정확도 향상)
 * @returns 수정된 본문 + 검증 결과
 */
export async function factCheckAndRewrite(
  bodyPlain: string,
  topic?: string
): Promise<{ corrected: string; result: FactCheckResult }> {
  const startMs = Date.now();
  if (!bodyPlain || bodyPlain.trim().length < 100) {
    return {
      corrected: bodyPlain,
      result: { suspicious: [], rawResponse: '(글 너무 짧음 — skip)', durationMs: 0 },
    };
  }

  const topicHint = topic ? `주제: "${topic}"\n\n` : '';
  const prompt = `${topicHint}다음 블로그 글에서 **사실 확인이 필요한 문장**(통계·연도·인물·제품명·법령·수치 등)을 찾아주세요.
실제 사실과 다르거나 환각으로 의심되는 문장만 골라서, 각 문장에 대해:
1. original: 원문 인용
2. replacement: 사실 기반으로 수정한 새 문장 (원문과 톤·길이 비슷하게)
3. reason: 왜 의심되는지 짧게

응답은 반드시 다음 JSON 형식 (마크다운 X, JSON만):
{
  "suspicious": [
    {"original": "...", "replacement": "...", "reason": "..."}
  ]
}

의심 문장 없으면 빈 배열 반환: {"suspicious": []}

=== 글 본문 ===
${bodyPlain}
=== 끝 ===`;

  let rawResponse = '';
  try {
    const response = await generatePerplexityContent(prompt, {
      // 사실 검증용 — 빠른 응답 우선
    });
    rawResponse = response.content || '';
  } catch (err: any) {
    console.warn('[PerplexityFactCheck] API 호출 실패:', err?.message || err);
    return {
      corrected: bodyPlain,
      result: { suspicious: [], rawResponse: `(API 실패: ${err?.message})`, durationMs: Date.now() - startMs },
    };
  }

  // JSON 파싱
  let suspicious: SuspiciousItem[] = [];
  try {
    // 마크다운 fence 제거 (LLM이 ``` 감쌀 수 있음)
    const cleaned = rawResponse
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed?.suspicious)) {
      suspicious = parsed.suspicious.filter(
        (s: any) => s && typeof s.original === 'string' && typeof s.replacement === 'string' && s.original.length > 5
      );
    }
  } catch (parseErr: any) {
    console.warn('[PerplexityFactCheck] JSON 파싱 실패 — 원본 응답:', rawResponse.slice(0, 200));
    // 파싱 실패 시 원본 그대로 반환 (안전 fallback)
    return {
      corrected: bodyPlain,
      result: { suspicious: [], rawResponse, durationMs: Date.now() - startMs },
    };
  }

  // 본문에서 의심 문장 치환
  let corrected = bodyPlain;
  for (const item of suspicious) {
    if (corrected.includes(item.original)) {
      corrected = corrected.replace(item.original, item.replacement);
      console.log(`[PerplexityFactCheck] ✏️ 교체: "${item.original.slice(0, 40)}..." → "${item.replacement.slice(0, 40)}..." (이유: ${item.reason})`);
    } else {
      // exact match 실패 시 — LLM이 약간 변형했을 수 있음. fuzzy match는 v2에.
      console.warn(`[PerplexityFactCheck] ⚠️ 원문 매칭 실패 (변형 가능성): "${item.original.slice(0, 40)}..."`);
    }
  }

  const durationMs = Date.now() - startMs;
  if (suspicious.length > 0) {
    console.log(`[PerplexityFactCheck] ✅ ${suspicious.length}개 의심 문장 자동 재작성 완료 (${(durationMs / 1000).toFixed(1)}s)`);
  } else {
    console.log(`[PerplexityFactCheck] ✓ 의심 문장 없음 (${(durationMs / 1000).toFixed(1)}s)`);
  }

  return {
    corrected,
    result: { suspicious, rawResponse, durationMs },
  };
}
