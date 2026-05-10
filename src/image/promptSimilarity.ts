/**
 * 헤딩간 prompt 유사도 측정 — Jaccard similarity (단어 set 교집합/합집합).
 *
 * Flow가 같은 prompt → 같은 이미지 반환하는 회귀의 *상류 진단*에 사용.
 * 4개 헤딩의 base prompt가 80% 이상 유사하면 헤딩 variation hint를 적용해도
 * Flow 모델이 같은 이미지 반환할 위험이 큼 → 콘텐츠 생성 단계 점검 필요.
 *
 * 별도 export 이유: flowGenerator.ts가 큰 파일이라 단위 테스트 가능하게 분리.
 */

/** 한글·영문·숫자 토큰화. 3자 이상만 수집. 길이 1~2짜리는 noise (a, the, is 등). */
export function tokenizePromptForSimilarity(text: string): Set<string> {
  if (!text || typeof text !== 'string') return new Set();
  const tokens = (text.toLowerCase().match(/[a-z가-힣0-9]+/g) ?? []).filter((t) => t.length >= 3);
  return new Set(tokens);
}

/** Jaccard similarity (0~1). 두 집합 모두 비어있으면 0. */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union > 0 ? inter / union : 0;
}

export interface SimilarityDiagnosis {
  readonly maxSimilarity: number;
  readonly maxPair: readonly [number, number];
  readonly highSimilarPairs: number;   // similarity ≥ 0.6 페어 수
  readonly totalPairs: number;
  readonly verdict: 'ok' | 'warning' | 'danger';
}

/**
 * 헤딩 prompt 배열의 유사도 진단.
 *
 * 임계:
 *   maxSim >= 0.8 → 'danger' (거의 동일)
 *   highRatio >= 0.5 → 'warning' (절반 이상 비슷)
 *   else → 'ok'
 */
export function diagnosePromptSimilarity(prompts: readonly string[]): SimilarityDiagnosis {
  if (prompts.length < 2) {
    return {
      maxSimilarity: 0,
      maxPair: [-1, -1],
      highSimilarPairs: 0,
      totalPairs: 0,
      verdict: 'ok',
    };
  }
  const tokenSets = prompts.map((p) => tokenizePromptForSimilarity(p));
  let maxSim = 0;
  let maxPair: [number, number] = [-1, -1];
  let highCount = 0;
  let totalPairs = 0;
  for (let i = 0; i < tokenSets.length; i++) {
    for (let j = i + 1; j < tokenSets.length; j++) {
      const a = tokenSets[i];
      const b = tokenSets[j];
      if (a.size === 0 || b.size === 0) continue;
      const sim = jaccardSimilarity(a, b);
      totalPairs++;
      if (sim >= 0.6) highCount++;
      if (sim > maxSim) {
        maxSim = sim;
        maxPair = [i, j];
      }
    }
  }
  const ratio = totalPairs > 0 ? highCount / totalPairs : 0;
  let verdict: 'ok' | 'warning' | 'danger' = 'ok';
  if (maxSim >= 0.8) verdict = 'danger';
  else if (ratio >= 0.5) verdict = 'warning';
  return {
    maxSimilarity: maxSim,
    maxPair,
    highSimilarPairs: highCount,
    totalPairs,
    verdict,
  };
}
