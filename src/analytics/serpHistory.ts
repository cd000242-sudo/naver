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
    };
  }

  let finalSum = 0;
  let serpSum = 0;
  const rankCount: Record<string, number> = {};
  const missingCount: Record<string, number> = {};
  const strengthCount: Record<string, number> = {};

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
