/**
 * Benchmark Analyzer — 끝판왕 Phase 3.2 (v2.10.183)
 *
 * 우리 글의 qualityEvaluator 결과 vs SERP 상위 노출 글의 baseline을 직접 비교한다.
 *   - 어떤 신호가 부족한지 *구체적 수치* 차이로 명시
 *   - 어떤 신호가 우월한지도 함께 표시 (장단 양면)
 *   - 추정 효과 금지 — *실측 차이* 만 보고
 *
 * 출력:
 *   - 항목별 우리 점수/노출 글 평균/차이
 *   - 우선순위 개선 항목 (가장 큰 차이부터)
 *   - 글 단위 종합 등급
 */

import type { EvaluationResult } from '../content/qualityEvaluator';
import type { SerpProbeReport } from './serpProbe';

export interface GapSignal {
  signal: string;             // 신호 이름
  ourValue: number;
  serpAverage: number;
  gap: number;                // ours - serp (음수면 우리가 부족)
  recommendation: 'urgent' | 'improve' | 'maintain' | 'lead';
  message: string;
}

export interface BenchmarkReport {
  keyword: string;
  ourFinalScore: number;
  serpAvgFinalScore: number;
  serpMedianFinalScore: number;
  ranking: 'above_median' | 'near_median' | 'below_median' | 'below_25th';
  signalGaps: GapSignal[];
  topPriorityFix: string[];   // 가장 시급한 보완 항목 (≤3개)
  strengths: string[];        // 우리가 더 잘하는 부분
  summary: string;
}

function classifyRanking(ourScore: number, serpAvg: number, serpMedian: number): BenchmarkReport['ranking'] {
  if (ourScore >= serpMedian + 5) return 'above_median';
  if (ourScore >= serpMedian - 3) return 'near_median';
  if (ourScore >= serpAvg - 10) return 'below_median';
  return 'below_25th';
}

function classifyGap(gap: number, isHigherBetter: boolean = true): GapSignal['recommendation'] {
  // gap = ours - serp
  // higher better: gap > 5 = lead, -3~5 = maintain, -15~-3 = improve, <-15 = urgent
  // lower better:  반대
  const adjustedGap = isHigherBetter ? gap : -gap;
  if (adjustedGap >= 5) return 'lead';
  if (adjustedGap >= -3) return 'maintain';
  if (adjustedGap >= -15) return 'improve';
  return 'urgent';
}

function gapMessage(signal: string, ours: number, serp: number, rec: GapSignal['recommendation'], isHigherBetter: boolean = true): string {
  const ourStr = typeof ours === 'number' ? ours.toFixed(1) : String(ours);
  const serpStr = typeof serp === 'number' ? serp.toFixed(1) : String(serp);
  const dir = isHigherBetter ? (ours > serp ? '우월' : '부족') : (ours < serp ? '우월' : '부족');
  switch (rec) {
    case 'urgent':
      return `${signal} ${dir} 심각 — 우리 ${ourStr} vs 상위 노출 평균 ${serpStr} (즉시 보완)`;
    case 'improve':
      return `${signal} ${dir} — 우리 ${ourStr} vs 상위 ${serpStr} (개선 권장)`;
    case 'maintain':
      return `${signal} 비슷 — 우리 ${ourStr} vs 상위 ${serpStr}`;
    case 'lead':
      return `${signal} 우위 — 우리 ${ourStr} vs 상위 ${serpStr}`;
  }
}

export function analyzeBenchmark(
  ourEvaluation: EvaluationResult,
  ourBodyLength: number,
  ourConcreteNumbers: number,
  ourDirectExperience: number,
  serpReport: SerpProbeReport,
): BenchmarkReport {
  const baseline = serpReport.baseline;
  if (!baseline) {
    return {
      keyword: serpReport.keyword,
      ourFinalScore: ourEvaluation.finalScore,
      serpAvgFinalScore: 0,
      serpMedianFinalScore: 0,
      ranking: 'below_25th',
      signalGaps: [],
      topPriorityFix: [],
      strengths: [],
      summary: '상위 노출 글 데이터 부족 — 비교 불가',
    };
  }

  const gaps: GapSignal[] = [];

  // 1. finalScore
  const finalGap: GapSignal = {
    signal: '통합 점수',
    ourValue: ourEvaluation.finalScore,
    serpAverage: baseline.avgFinalScore,
    gap: ourEvaluation.finalScore - baseline.avgFinalScore,
    recommendation: classifyGap(ourEvaluation.finalScore - baseline.avgFinalScore, true),
    message: '',
  };
  finalGap.message = gapMessage('통합 점수', ourEvaluation.finalScore, baseline.avgFinalScore, finalGap.recommendation, true);
  gaps.push(finalGap);

  // 2. modeScore (SEO/홈피드/affiliate)
  const modeGap = ourEvaluation.modeScore.score - baseline.avgModeScore;
  gaps.push({
    signal: '모드 적합도',
    ourValue: ourEvaluation.modeScore.score,
    serpAverage: baseline.avgModeScore,
    gap: modeGap,
    recommendation: classifyGap(modeGap, true),
    message: gapMessage('모드 적합도', ourEvaluation.modeScore.score, baseline.avgModeScore, classifyGap(modeGap, true), true),
  });

  // 3. humanlikeScore
  const humanGap = ourEvaluation.humanlikeScore.score - baseline.avgHumanlikeScore;
  gaps.push({
    signal: '사람다움',
    ourValue: ourEvaluation.humanlikeScore.score,
    serpAverage: baseline.avgHumanlikeScore,
    gap: humanGap,
    recommendation: classifyGap(humanGap, true),
    message: gapMessage('사람다움', ourEvaluation.humanlikeScore.score, baseline.avgHumanlikeScore, classifyGap(humanGap, true), true),
  });

  // 4. safetyScore
  const safetyGap = ourEvaluation.safetyScore.score - baseline.avgSafetyScore;
  gaps.push({
    signal: '안전성',
    ourValue: ourEvaluation.safetyScore.score,
    serpAverage: baseline.avgSafetyScore,
    gap: safetyGap,
    recommendation: classifyGap(safetyGap, true),
    message: gapMessage('안전성', ourEvaluation.safetyScore.score, baseline.avgSafetyScore, classifyGap(safetyGap, true), true),
  });

  // 5. 본문 길이
  const lenGap = ourBodyLength - baseline.avgBodyLength;
  gaps.push({
    signal: '본문 길이',
    ourValue: ourBodyLength,
    serpAverage: baseline.avgBodyLength,
    gap: lenGap,
    recommendation: classifyGap(lenGap / 50, true),  // 50자 단위로 환산
    message: gapMessage('본문 길이', ourBodyLength, baseline.avgBodyLength, classifyGap(lenGap / 50, true), true),
  });

  // 6. 구체 수치 (단위 포함)
  const concreteGap = ourConcreteNumbers - baseline.avgConcreteNumbers;
  gaps.push({
    signal: '구체 수치(단위)',
    ourValue: ourConcreteNumbers,
    serpAverage: baseline.avgConcreteNumbers,
    gap: concreteGap,
    recommendation: classifyGap(concreteGap * 5, true),  // 1개당 가중치 5
    message: gapMessage('구체 수치(단위)', ourConcreteNumbers, baseline.avgConcreteNumbers, classifyGap(concreteGap * 5, true), true),
  });

  // 7. 직접 경험 표현
  const expGap = ourDirectExperience - baseline.avgDirectExperience;
  gaps.push({
    signal: '직접 경험 표현',
    ourValue: ourDirectExperience,
    serpAverage: baseline.avgDirectExperience,
    gap: expGap,
    recommendation: classifyGap(expGap, true),  // 점수 단위
    message: gapMessage('직접 경험 표현', ourDirectExperience, baseline.avgDirectExperience, classifyGap(expGap, true), true),
  });

  // 우선순위: urgent > improve, 음수 gap 큰 것부터
  const urgentFix = gaps
    .filter(g => g.recommendation === 'urgent' || g.recommendation === 'improve')
    .sort((a, b) => a.gap - b.gap)  // gap 작은(음수 큰) 것부터
    .slice(0, 3)
    .map(g => g.message);

  // 강점: lead
  const strengths = gaps
    .filter(g => g.recommendation === 'lead')
    .map(g => g.message);

  const ranking = classifyRanking(ourEvaluation.finalScore, baseline.avgFinalScore, baseline.medianFinalScore);

  const rankingLabel = {
    above_median: '✅ 상위권 (중앙값+5 이상)',
    near_median: '🟢 중상위권 (중앙값 근처)',
    below_median: '🟡 중하위권 (평균-10 ~ 중앙값-3)',
    below_25th: '🔴 하위권 (평균-10 미만)',
  }[ranking];

  const summary = `[${serpReport.keyword}] 우리 ${ourEvaluation.finalScore}점 vs 상위 ${serpReport.successCount}개 평균 ${baseline.avgFinalScore}점 (중앙값 ${baseline.medianFinalScore}) — ${rankingLabel}`;

  return {
    keyword: serpReport.keyword,
    ourFinalScore: ourEvaluation.finalScore,
    serpAvgFinalScore: baseline.avgFinalScore,
    serpMedianFinalScore: baseline.medianFinalScore,
    ranking,
    signalGaps: gaps,
    topPriorityFix: urgentFix,
    strengths,
    summary,
  };
}

export function formatBenchmarkReport(report: BenchmarkReport): string {
  const lines: string[] = [];
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`📊 ${report.summary}`);
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  for (const gap of report.signalGaps) {
    const icon = gap.recommendation === 'urgent' ? '🚨'
      : gap.recommendation === 'improve' ? '⚠️'
      : gap.recommendation === 'lead' ? '⭐'
      : '✓';
    lines.push(`${icon} ${gap.message}`);
  }
  if (report.topPriorityFix.length > 0) {
    lines.push('');
    lines.push('🎯 우선순위 보완 항목:');
    for (let i = 0; i < report.topPriorityFix.length; i++) {
      lines.push(`  ${i + 1}. ${report.topPriorityFix[i]}`);
    }
  }
  if (report.strengths.length > 0) {
    lines.push('');
    lines.push('💪 강점 (상위 노출 평균 대비 우위):');
    for (const s of report.strengths) lines.push(`  • ${s}`);
  }
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  return lines.join('\n');
}
