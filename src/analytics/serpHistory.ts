/**
 * SERP History — 끝판왕 Phase 3.8 (v2.10.190)
 *
 * 글 생성마다 발생하는 SERP 벤치마크 결과를 *누적 저장*하여 시간 추이 분석 가능.
 *   - 추정 효과 금지: 모든 통계는 실측 데이터(SERP 비교) 기반
 *   - 사용자가 자기 글들의 finalScore 추이, 가장 자주 미달하는 신호, ranking 분포를 *수치로* 확인 가능
 *
 * 저장 위치: userData/serp-benchmark-history.json
 * 형식: 단순 append-only JSON array (최근 N개만 유지, 기본 200개)
 *
 * 통계 항목:
 *   - 평균 finalScore (최근 N개)
 *   - ranking 분포 (above_median / near_median / below_median / below_25th)
 *   - 가장 자주 등장한 우선순위 보완 항목 top 5
 *   - 미달 신호 빈도 (어떤 신호가 가장 자주 부족한지)
 */

import fs from 'fs';
import path from 'path';

export interface SerpHistoryEntry {
  readonly timestamp: string;      // ISO 8601
  readonly keyword: string;
  readonly mode: string;           // seo | homefeed | affiliate | ...
  readonly ourFinalScore: number;
  readonly serpAvgFinalScore: number;
  readonly serpMedianFinalScore: number;
  readonly ranking: string;        // above_median | near_median | below_median | below_25th
  readonly topPriorityFix: readonly string[];
  readonly strengths: readonly string[];
  // ✅ [v2.10.197 Phase 3.14] 키워드 진입 난이도 (v2.10.195+ unifiedSerpProbe)
  readonly difficultyTier?: 'easy' | 'medium' | 'hard' | 'expert';
  readonly hasSmartblock?: boolean;
  readonly influencerRatio?: number; // 0~1
}

export interface SerpHistoryStats {
  readonly totalEntries: number;
  readonly avgFinalScore: number;        // 평균
  readonly avgSerpScore: number;
  readonly avgGap: number;                // ours - serp avg
  readonly rankingDistribution: Readonly<Record<string, number>>;
  readonly topMissingSignals: ReadonlyArray<{ signal: string; count: number }>;
  readonly topStrengths: ReadonlyArray<{ signal: string; count: number }>;
  readonly oldestEntry: string | null;
  readonly newestEntry: string | null;
  // ✅ [v2.10.197 Phase 3.14] 누적 난이도 분포
  readonly difficultyDistribution: Readonly<Record<string, number>>; // easy/medium/hard/expert
  readonly smartblockCount: number;       // 스마트블록 노출 키워드 누적 카운트
  readonly difficultyDataPoints: number;  // 난이도 데이터 있는 항목 수
}

const DEFAULT_MAX_ENTRIES = 200;

function getHistoryFilePath(userDataPath: string): string {
  return path.join(userDataPath, 'serp-benchmark-history.json');
}

/**
 * 기존 history 로드 — 파일 없거나 파싱 실패 시 빈 배열 반환.
 */
export function loadHistory(userDataPath: string): SerpHistoryEntry[] {
  const filePath = getHistoryFilePath(userDataPath);
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEntry);
  } catch {
    return [];
  }
}

function isValidEntry(entry: any): entry is SerpHistoryEntry {
  return entry
    && typeof entry.timestamp === 'string'
    && typeof entry.keyword === 'string'
    && typeof entry.ourFinalScore === 'number'
    && typeof entry.serpAvgFinalScore === 'number';
}

/**
 * 새 항목 append + 최대 N개 유지 (오래된 것 자동 삭제).
 * 디스크 쓰기 실패 시 silent (정상 흐름 유지).
 */
export function appendHistory(
  userDataPath: string,
  entry: SerpHistoryEntry,
  maxEntries: number = DEFAULT_MAX_ENTRIES,
): boolean {
  try {
    const filePath = getHistoryFilePath(userDataPath);
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    const existing = loadHistory(userDataPath);
    const updated = [...existing, entry];
    const trimmed = updated.length > maxEntries
      ? updated.slice(updated.length - maxEntries)
      : updated;
    fs.writeFileSync(filePath, JSON.stringify(trimmed, null, 2), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/**
 * 우선순위 보완 항목의 *핵심 신호 이름* 추출.
 *   예: "사람다움 부족 심각 — 우리 50 vs 상위 평균 70 (즉시 보완)" → "사람다움"
 */
function extractSignalName(message: string): string {
  // 첫 단어 — 신호 이름 (사람다움 / 모드 적합도 / 안전성 / 구체 수치 / 직접 경험 / 본문 길이 / 통합 점수)
  const m = message.match(/^([가-힣\s]+?)(?:\s+(?:부족|우월|비슷|우위|적합|미달))/);
  if (m) return m[1].trim();
  // fallback: 처음 8자
  return message.slice(0, 10).trim();
}

/**
 * 통계 산출 — 추정 없이 *실측 데이터* 기반.
 */
export function computeStats(entries: SerpHistoryEntry[]): SerpHistoryStats {
  if (entries.length === 0) {
    return {
      totalEntries: 0,
      avgFinalScore: 0,
      avgSerpScore: 0,
      avgGap: 0,
      rankingDistribution: {},
      topMissingSignals: [],
      topStrengths: [],
      oldestEntry: null,
      newestEntry: null,
      difficultyDistribution: {},
      smartblockCount: 0,
      difficultyDataPoints: 0,
    };
  }

  let finalSum = 0;
  let serpSum = 0;
  const rankCount: Record<string, number> = {};
  const missingCount: Record<string, number> = {};
  const strengthCount: Record<string, number> = {};
  // ✅ [v2.10.197] 난이도 누적
  const difficultyCount: Record<string, number> = {};
  let smartblockCount = 0;
  let difficultyDataPoints = 0;

  for (const e of entries) {
    finalSum += e.ourFinalScore;
    serpSum += e.serpAvgFinalScore;
    rankCount[e.ranking] = (rankCount[e.ranking] ?? 0) + 1;
    for (const fix of e.topPriorityFix) {
      const sig = extractSignalName(fix);
      missingCount[sig] = (missingCount[sig] ?? 0) + 1;
    }
    for (const str of e.strengths) {
      const sig = extractSignalName(str);
      strengthCount[sig] = (strengthCount[sig] ?? 0) + 1;
    }
    if (e.difficultyTier) {
      difficultyCount[e.difficultyTier] = (difficultyCount[e.difficultyTier] ?? 0) + 1;
      difficultyDataPoints++;
    }
    if (e.hasSmartblock) smartblockCount++;
  }

  const sortedTimestamps = entries
    .map(e => e.timestamp)
    .sort();

  const topMissingSignals = Object.entries(missingCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([signal, count]) => ({ signal, count }));

  const topStrengths = Object.entries(strengthCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([signal, count]) => ({ signal, count }));

  return {
    totalEntries: entries.length,
    avgFinalScore: Math.round(finalSum / entries.length),
    avgSerpScore: Math.round(serpSum / entries.length),
    avgGap: Math.round((finalSum - serpSum) / entries.length),
    rankingDistribution: rankCount,
    topMissingSignals,
    topStrengths,
    oldestEntry: sortedTimestamps[0] ?? null,
    newestEntry: sortedTimestamps[sortedTimestamps.length - 1] ?? null,
    difficultyDistribution: difficultyCount,
    smartblockCount,
    difficultyDataPoints,
  };
}

/**
 * 최근 N개 항목만 추출 (시간 역순).
 */
export function getRecentEntries(entries: SerpHistoryEntry[], n: number = 30): SerpHistoryEntry[] {
  return [...entries]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, n);
}

/**
 * 자동 학습 효과 측정 결과 — Phase 3.10
 *
 * buildAdaptiveLearningDirective는 history 5건+ 시점부터 활성화된다.
 * 처음 4건 (학습 OFF) vs 5번째~이후 (학습 ON)의 평균 점수를 비교 →
 * *실측 학습 효과*를 사용자에게 보고.
 */
export interface AdaptiveLearningImpact {
  readonly canMeasure: boolean;       // 데이터 충분 여부 (각 그룹 ≥ 3건 필요)
  readonly beforeCount: number;
  readonly afterCount: number;
  readonly beforeAvgScore: number;
  readonly afterAvgScore: number;
  readonly scoreDelta: number;         // afterAvg - beforeAvg
  readonly beforeAvgGap: number;       // 우리 - SERP 평균 (학습 전)
  readonly afterAvgGap: number;        // 우리 - SERP 평균 (학습 후)
  readonly gapImprovement: number;     // afterGap - beforeGap (양수면 개선)
  readonly beforeRankingDist: Readonly<Record<string, number>>;
  readonly afterRankingDist: Readonly<Record<string, number>>;
  readonly reason: string;             // canMeasure=false 시 사유
}

/**
 * 자동 학습 전후 점수 비교 — 실측 효과 측정.
 *   - 처음 4건 (학습 미적용) vs 5번째~ (학습 적용)
 *   - 각 그룹 최소 3건 필요 (false-positive 방지)
 *   - 추정 없음 — 실제 누적 history 평균 비교
 */
export function computeAdaptiveLearningImpact(entries: SerpHistoryEntry[]): AdaptiveLearningImpact {
  const empty = {
    canMeasure: false,
    beforeCount: 0,
    afterCount: 0,
    beforeAvgScore: 0,
    afterAvgScore: 0,
    scoreDelta: 0,
    beforeAvgGap: 0,
    afterAvgGap: 0,
    gapImprovement: 0,
    beforeRankingDist: {},
    afterRankingDist: {},
    reason: '',
  };

  if (entries.length < 6) {
    return { ...empty, reason: `누적 글 ${entries.length}건 (학습 전후 비교 위해 최소 6건 필요)` };
  }

  // 시간 순 정렬 (오래된 것 먼저)
  const sorted = [...entries].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // 처음 4건 = 학습 OFF, 나머지 = 학습 ON
  const before = sorted.slice(0, 4);
  const after = sorted.slice(4);

  if (before.length < 3 || after.length < 3) {
    return { ...empty, reason: `각 그룹 최소 3건 필요 (전 ${before.length}건, 후 ${after.length}건)` };
  }

  const avgScore = (arr: SerpHistoryEntry[]) => Math.round(
    arr.reduce((sum, e) => sum + e.ourFinalScore, 0) / arr.length,
  );
  const avgGap = (arr: SerpHistoryEntry[]) => Math.round(
    arr.reduce((sum, e) => sum + (e.ourFinalScore - e.serpAvgFinalScore), 0) / arr.length,
  );
  const rankDist = (arr: SerpHistoryEntry[]): Record<string, number> => {
    const dist: Record<string, number> = {};
    for (const e of arr) dist[e.ranking] = (dist[e.ranking] ?? 0) + 1;
    return dist;
  };

  const beforeAvgScore = avgScore(before);
  const afterAvgScore = avgScore(after);
  const beforeAvgGap = avgGap(before);
  const afterAvgGap = avgGap(after);

  return {
    canMeasure: true,
    beforeCount: before.length,
    afterCount: after.length,
    beforeAvgScore,
    afterAvgScore,
    scoreDelta: afterAvgScore - beforeAvgScore,
    beforeAvgGap,
    afterAvgGap,
    gapImprovement: afterAvgGap - beforeAvgGap,
    beforeRankingDist: rankDist(before),
    afterRankingDist: rankDist(after),
    reason: '',
  };
}

/**
 * 누적 history에서 자주 미달하는 신호 top N → LLM 시스템 프롬프트 prefix 생성.
 * ✅ [v2.10.192 Phase 3.9] 지속적 학습 — 자기 글들의 실측 약점을 다음 글에 자동 반영
 *
 * 안전 조건:
 *   - history 5건 미만이면 빈 문자열 (데이터 부족)
 *   - count >= 3인 신호만 (충분히 자주 미달)
 *   - 추정 없음 — 실측 history 기반
 *
 * @param userDataPath - userData 경로
 * @param recentN - 분석 대상 최근 항목 수 (기본 30)
 * @param topK - 추출할 미달 신호 개수 (기본 2)
 * @returns LLM에 주입할 보완 지시문 (없으면 빈 문자열)
 */
export function buildAdaptiveLearningDirective(
  userDataPath: string,
  recentN: number = 30,
  topK: number = 2,
): string {
  try {
    const all = loadHistory(userDataPath);
    if (all.length < 5) return ''; // 데이터 부족 시 skip
    const recent = getRecentEntries(all, recentN);
    const stats = computeStats(recent);

    // count >= 3인 미달 신호만 (자주 미달)
    const significant = stats.topMissingSignals
      .filter(s => s.count >= 3)
      .slice(0, topK);

    if (significant.length === 0) return '';

    const totalRecent = recent.length;
    const lines: string[] = [
      '',
      `[자동 학습 보완 지시 — 최근 ${totalRecent}건 글의 실측 미달 신호 기반]`,
      '본 사용자는 누적 SERP 비교에서 다음 항목이 자주 부족함. 이번 글에서 강화하라:',
    ];

    for (const sig of significant) {
      const pct = Math.round((sig.count / Math.max(1, totalRecent)) * 100);
      lines.push(`  - "${sig.signal}" 부족 (${sig.count}/${totalRecent}건 = ${pct}%) → 본문에 구체적으로 반영`);
    }

    // 신호별 구체적 가이드
    const guideLines: string[] = [];
    for (const sig of significant) {
      const guide = getSignalGuide(sig.signal);
      if (guide) guideLines.push(`  • ${sig.signal}: ${guide}`);
    }
    if (guideLines.length > 0) {
      lines.push('');
      lines.push('[보강 가이드]');
      lines.push(...guideLines);
    }
    lines.push('');
    return lines.join('\n');
  } catch {
    return '';
  }
}

/**
 * 신호별 구체적 보강 가이드 — evaluator 항목과 매칭.
 */
function getSignalGuide(signal: string): string {
  const guides: Record<string, string> = {
    '사람다움': '문장 길이 분산↑ (짧은 5~15자 + 긴 30~60자 혼합), 어미 변주 (~요/~네요/~답니다), 자기 정정 마커 ("아 근데", "막상", "사실은") 2~3회',
    '구체 수치': '"10~15분", "300g", "3만원", "12.5%" 같은 *단위 포함 수치* 본문에 3개 이상 배치',
    '직접 경험': '"직접 가봤어요", "제가 써본 결과", "찍은 사진 보면" 같은 경험 증거 표현 2~3회 자연스럽게 분산',
    '안전성': 'AI 보고체("알아보겠습니다", "살펴보겠습니다") 제거 + 환각 차단 (원본 fact 100% 보존)',
    '모드 적합도': '키워드 밀도 1.5~3% 유지, 첫 문단에 메인 키워드 배치, 소제목에 키워드 변형 포함',
    '본문 길이': '1500자 이상 작성 (충분한 SEO 신호 + 체류시간 확보)',
    '통합 점수': '본문 길이 / 키워드 밀도 / 직접 경험 / 구체 수치를 동시에 보강',
  };
  return guides[signal] || '';
}

/**
 * History clear — 사용자가 명시적으로 호출 시 (UI 버튼 등).
 */
export function clearHistory(userDataPath: string): boolean {
  try {
    const filePath = getHistoryFilePath(userDataPath);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}
