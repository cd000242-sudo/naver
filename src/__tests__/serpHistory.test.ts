/**
 * serpHistory 단위 테스트
 *
 * 누적 저장 + 통계 산출 — 실측 데이터 처리.
 * 네트워크 호출 0, 임시 디렉토리 사용.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  loadHistory,
  appendHistory,
  computeStats,
  getRecentEntries,
  clearHistory,
  buildAdaptiveLearningDirective,
  computeAdaptiveLearningImpact,
  type SerpHistoryEntry,
} from '../analytics/serpHistory';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'serp-history-test-'));
});

afterEach(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch { /* ignore */ }
});

function makeEntry(overrides: Partial<SerpHistoryEntry> = {}): SerpHistoryEntry {
  return {
    timestamp: '2026-05-15T10:00:00.000Z',
    keyword: '무선 충전기',
    mode: 'seo',
    ourFinalScore: 70,
    serpAvgFinalScore: 75,
    serpMedianFinalScore: 74,
    ranking: 'near_median',
    topPriorityFix: ['사람다움 부족 — 우리 50 vs 상위 70'],
    strengths: ['안전성 우위 — 우리 90 vs 상위 80'],
    ...overrides,
  };
}

describe('loadHistory', () => {
  it('파일 없으면 빈 배열', () => {
    expect(loadHistory(tmpDir)).toEqual([]);
  });

  it('잘못된 JSON이면 빈 배열', () => {
    fs.writeFileSync(path.join(tmpDir, 'serp-benchmark-history.json'), 'invalid json');
    expect(loadHistory(tmpDir)).toEqual([]);
  });

  it('JSON 배열이 아니면 빈 배열', () => {
    fs.writeFileSync(path.join(tmpDir, 'serp-benchmark-history.json'), '{}');
    expect(loadHistory(tmpDir)).toEqual([]);
  });

  it('유효한 항목만 필터', () => {
    const entries = [makeEntry(), { broken: true }];
    fs.writeFileSync(path.join(tmpDir, 'serp-benchmark-history.json'), JSON.stringify(entries));
    expect(loadHistory(tmpDir).length).toBe(1);
  });
});

describe('appendHistory', () => {
  it('새 항목 정상 저장', () => {
    appendHistory(tmpDir, makeEntry());
    expect(loadHistory(tmpDir).length).toBe(1);
  });

  it('여러 항목 누적', () => {
    appendHistory(tmpDir, makeEntry({ keyword: 'A' }));
    appendHistory(tmpDir, makeEntry({ keyword: 'B' }));
    appendHistory(tmpDir, makeEntry({ keyword: 'C' }));
    const entries = loadHistory(tmpDir);
    expect(entries.length).toBe(3);
    expect(entries.map(e => e.keyword)).toEqual(['A', 'B', 'C']);
  });

  it('maxEntries 초과 시 오래된 것 자동 삭제', () => {
    for (let i = 0; i < 5; i++) {
      appendHistory(tmpDir, makeEntry({ keyword: `K${i}` }), 3);
    }
    const entries = loadHistory(tmpDir);
    expect(entries.length).toBe(3);
    expect(entries.map(e => e.keyword)).toEqual(['K2', 'K3', 'K4']); // 최근 3개만
  });

  it('userDataPath 없으면 자동 생성', () => {
    const newDir = path.join(tmpDir, 'nested', 'dir');
    appendHistory(newDir, makeEntry());
    expect(loadHistory(newDir).length).toBe(1);
  });
});

describe('computeStats', () => {
  it('빈 history는 0 점수', () => {
    const stats = computeStats([]);
    expect(stats.totalEntries).toBe(0);
    expect(stats.avgFinalScore).toBe(0);
    expect(stats.topMissingSignals).toEqual([]);
  });

  it('평균 finalScore + serp 점수 정확', () => {
    const entries = [
      makeEntry({ ourFinalScore: 60, serpAvgFinalScore: 70 }),
      makeEntry({ ourFinalScore: 80, serpAvgFinalScore: 70 }),
      makeEntry({ ourFinalScore: 70, serpAvgFinalScore: 70 }),
    ];
    const stats = computeStats(entries);
    expect(stats.totalEntries).toBe(3);
    expect(stats.avgFinalScore).toBe(70);
    expect(stats.avgSerpScore).toBe(70);
    expect(stats.avgGap).toBe(0);
  });

  it('ranking 분포 계산', () => {
    const entries = [
      makeEntry({ ranking: 'above_median' }),
      makeEntry({ ranking: 'below_median' }),
      makeEntry({ ranking: 'below_median' }),
      makeEntry({ ranking: 'below_25th' }),
    ];
    const stats = computeStats(entries);
    expect(stats.rankingDistribution.above_median).toBe(1);
    expect(stats.rankingDistribution.below_median).toBe(2);
    expect(stats.rankingDistribution.below_25th).toBe(1);
  });

  it('topMissingSignals — 가장 자주 미달하는 신호 추출', () => {
    const entries = [
      makeEntry({ topPriorityFix: ['사람다움 부족 — A', '구체 수치 부족 — B'] }),
      makeEntry({ topPriorityFix: ['사람다움 부족 — C', '안전성 부족 — D'] }),
      makeEntry({ topPriorityFix: ['사람다움 부족 — E'] }),
    ];
    const stats = computeStats(entries);
    expect(stats.topMissingSignals[0].signal).toBe('사람다움');
    expect(stats.topMissingSignals[0].count).toBe(3);
  });

  it('topStrengths — 가장 자주 강점인 신호 추출', () => {
    const entries = [
      makeEntry({ strengths: ['안전성 우위 — A'] }),
      makeEntry({ strengths: ['안전성 우위 — B', '구체 수치 우위 — C'] }),
    ];
    const stats = computeStats(entries);
    expect(stats.topStrengths[0].signal).toBe('안전성');
    expect(stats.topStrengths[0].count).toBe(2);
  });
});

describe('getRecentEntries', () => {
  it('시간 역순 정렬 + N개 제한', () => {
    const entries = [
      makeEntry({ timestamp: '2026-05-15T10:00:00.000Z', keyword: 'A' }),
      makeEntry({ timestamp: '2026-05-15T12:00:00.000Z', keyword: 'B' }),
      makeEntry({ timestamp: '2026-05-15T11:00:00.000Z', keyword: 'C' }),
    ];
    const recent = getRecentEntries(entries, 2);
    expect(recent.length).toBe(2);
    expect(recent[0].keyword).toBe('B'); // 최신
    expect(recent[1].keyword).toBe('C');
  });
});

describe('clearHistory', () => {
  it('파일 삭제', () => {
    appendHistory(tmpDir, makeEntry());
    expect(loadHistory(tmpDir).length).toBe(1);
    clearHistory(tmpDir);
    expect(loadHistory(tmpDir).length).toBe(0);
  });

  it('파일 없어도 OK (true 반환)', () => {
    expect(clearHistory(tmpDir)).toBe(true);
  });
});

describe('computeAdaptiveLearningImpact (Phase 3.10)', () => {
  function makeEntryAt(timestamp: string, score: number, serp: number = 70, ranking: string = 'near_median'): SerpHistoryEntry {
    return makeEntry({ timestamp, ourFinalScore: score, serpAvgFinalScore: serp, ranking });
  }

  it('6건 미만이면 canMeasure=false', () => {
    const entries = [
      makeEntryAt('2026-05-15T01:00:00.000Z', 60),
      makeEntryAt('2026-05-15T02:00:00.000Z', 65),
      makeEntryAt('2026-05-15T03:00:00.000Z', 70),
      makeEntryAt('2026-05-15T04:00:00.000Z', 72),
      makeEntryAt('2026-05-15T05:00:00.000Z', 75),
    ];
    const impact = computeAdaptiveLearningImpact(entries);
    expect(impact.canMeasure).toBe(false);
    expect(impact.reason).toContain('최소 6건');
  });

  it('학습 전 평균 < 학습 후 평균 — scoreDelta 양수', () => {
    const entries = [
      // 학습 OFF (처음 4건): 평균 60
      makeEntryAt('2026-05-15T01:00:00.000Z', 55, 70),
      makeEntryAt('2026-05-15T02:00:00.000Z', 60, 70),
      makeEntryAt('2026-05-15T03:00:00.000Z', 60, 70),
      makeEntryAt('2026-05-15T04:00:00.000Z', 65, 70),
      // 학습 ON (5번째~): 평균 75
      makeEntryAt('2026-05-15T05:00:00.000Z', 75, 70),
      makeEntryAt('2026-05-15T06:00:00.000Z', 80, 70),
      makeEntryAt('2026-05-15T07:00:00.000Z', 70, 70),
    ];
    const impact = computeAdaptiveLearningImpact(entries);
    expect(impact.canMeasure).toBe(true);
    expect(impact.beforeCount).toBe(4);
    expect(impact.afterCount).toBe(3);
    expect(impact.beforeAvgScore).toBe(60);
    expect(impact.afterAvgScore).toBe(75);
    expect(impact.scoreDelta).toBe(15);
  });

  it('gap 개선 측정 — afterGap > beforeGap이면 양수', () => {
    const entries = [
      // 학습 전: 우리 60 vs SERP 70 = gap -10
      makeEntryAt('2026-05-15T01:00:00.000Z', 60, 70),
      makeEntryAt('2026-05-15T02:00:00.000Z', 60, 70),
      makeEntryAt('2026-05-15T03:00:00.000Z', 60, 70),
      makeEntryAt('2026-05-15T04:00:00.000Z', 60, 70),
      // 학습 후: 우리 75 vs SERP 70 = gap +5
      makeEntryAt('2026-05-15T05:00:00.000Z', 75, 70),
      makeEntryAt('2026-05-15T06:00:00.000Z', 75, 70),
      makeEntryAt('2026-05-15T07:00:00.000Z', 75, 70),
    ];
    const impact = computeAdaptiveLearningImpact(entries);
    expect(impact.beforeAvgGap).toBe(-10);
    expect(impact.afterAvgGap).toBe(5);
    expect(impact.gapImprovement).toBe(15);
  });

  it('시간 역순 입력도 정렬 후 처리', () => {
    const entries = [
      makeEntryAt('2026-05-15T07:00:00.000Z', 80, 70),
      makeEntryAt('2026-05-15T05:00:00.000Z', 70, 70),
      makeEntryAt('2026-05-15T03:00:00.000Z', 60, 70),
      makeEntryAt('2026-05-15T06:00:00.000Z', 75, 70),
      makeEntryAt('2026-05-15T01:00:00.000Z', 50, 70),
      makeEntryAt('2026-05-15T04:00:00.000Z', 65, 70),
      makeEntryAt('2026-05-15T02:00:00.000Z', 55, 70),
    ];
    const impact = computeAdaptiveLearningImpact(entries);
    expect(impact.canMeasure).toBe(true);
    // 첫 4건 정렬: 50, 55, 60, 65 → 평균 57.5 → 58
    expect(impact.beforeAvgScore).toBe(58);
    // 5번째~: 70, 75, 80 → 평균 75
    expect(impact.afterAvgScore).toBe(75);
  });

  it('학습 전후 ranking 분포 추적', () => {
    const entries = [
      makeEntryAt('2026-05-15T01:00:00.000Z', 50, 70, 'below_25th'),
      makeEntryAt('2026-05-15T02:00:00.000Z', 55, 70, 'below_25th'),
      makeEntryAt('2026-05-15T03:00:00.000Z', 60, 70, 'below_median'),
      makeEntryAt('2026-05-15T04:00:00.000Z', 65, 70, 'below_median'),
      makeEntryAt('2026-05-15T05:00:00.000Z', 75, 70, 'near_median'),
      makeEntryAt('2026-05-15T06:00:00.000Z', 80, 70, 'above_median'),
      makeEntryAt('2026-05-15T07:00:00.000Z', 82, 70, 'above_median'),
    ];
    const impact = computeAdaptiveLearningImpact(entries);
    expect(impact.beforeRankingDist['below_25th']).toBe(2);
    expect(impact.beforeRankingDist['below_median']).toBe(2);
    expect(impact.afterRankingDist['near_median']).toBe(1);
    expect(impact.afterRankingDist['above_median']).toBe(2);
  });
});

describe('buildAdaptiveLearningDirective (Phase 3.9)', () => {
  it('history 5건 미만이면 빈 문자열', () => {
    for (let i = 0; i < 4; i++) {
      appendHistory(tmpDir, makeEntry({ keyword: `K${i}` }));
    }
    expect(buildAdaptiveLearningDirective(tmpDir)).toBe('');
  });

  it('count >= 3인 신호만 추출', () => {
    // 사람다움 미달 5회, 구체 수치 미달 2회 — 사람다움만 추출됨
    for (let i = 0; i < 5; i++) {
      appendHistory(tmpDir, makeEntry({
        keyword: `K${i}`,
        topPriorityFix: ['사람다움 부족 — A'],
      }));
    }
    for (let i = 0; i < 2; i++) {
      appendHistory(tmpDir, makeEntry({
        keyword: `M${i}`,
        topPriorityFix: ['구체 수치 부족 — B'],
      }));
    }
    const directive = buildAdaptiveLearningDirective(tmpDir);
    expect(directive).toContain('사람다움');
    expect(directive).not.toContain('구체 수치');
  });

  it('topK개 신호 추출 + 보강 가이드 포함', () => {
    for (let i = 0; i < 10; i++) {
      appendHistory(tmpDir, makeEntry({
        keyword: `K${i}`,
        topPriorityFix: ['사람다움 부족 — A', '직접 경험 부족 — B'],
      }));
    }
    const directive = buildAdaptiveLearningDirective(tmpDir, 30, 2);
    expect(directive).toContain('사람다움');
    expect(directive).toContain('직접 경험');
    expect(directive).toContain('보강 가이드');
    expect(directive).toContain('어미 변주'); // 사람다움 가이드
    expect(directive).toContain('직접 가봤'); // 직접 경험 가이드
  });

  it('자주 미달 신호 없으면 빈 문자열 (모든 글이 통과)', () => {
    for (let i = 0; i < 10; i++) {
      appendHistory(tmpDir, makeEntry({
        keyword: `K${i}`,
        topPriorityFix: [], // 모든 항목 통과
      }));
    }
    expect(buildAdaptiveLearningDirective(tmpDir)).toBe('');
  });
});
