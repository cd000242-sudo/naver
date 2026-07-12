/**
 * Quality Evaluator — 끝판왕 시스템 Phase 1 entry point (architect 권장 아키텍처)
 *
 * 단일 evaluate() 호출로 모든 검증·평가를 통합한다.
 *   - 기존: analyzeNaverScore / calculateSEOScore / scoreHomefeedPrecision 3개 따로 → 통합 결정 불가
 *   - 신규: evaluate() 1회 → modeScore + humanlikeScore + safetyScore + finalScore + decision
 *
 * 모드별 가중치 (architect 권장):
 *   - SEO:       mode 60 / safety 25 / humanlike 15  (노출 우선)
 *   - homefeed:  mode 40 / safety 20 / humanlike 40  (사람다움 우선)
 *   - affiliate: mode 50 / safety 20 / humanlike 30  (전환 우선)
 *
 * Decision:
 *   - 'pass'       finalScore ≥ 80 AND safetyScore ≥ 50
 *   - 'patch'      finalScore 60~79 AND safetyScore ≥ 50
 *   - 'regenerate' finalScore < 60 OR safetyScore < 50
 *
 * 첫 릴리즈는 *shadow mode*: 기존 점수와 동시 계산, 결정은 로그만. 1주 비교 후 컷오버.
 *
 * @since v2.10.177
 */

import { evaluateSeo } from './evaluators/seoEval';
import { evaluateHomefeed } from './evaluators/homefeedEval';
import { evaluateAffiliate } from './evaluators/affiliateEval';
import { evaluateHumanlike } from './evaluators/humanlikeEval';
import { evaluateSafety } from './evaluators/safetyEval';
import { evaluateOfficialExposure } from './officialExposureRubric';
import type { AffiliateEvidenceMode } from './affiliateAuthenticity';

export type Mode = 'seo' | 'homefeed' | 'affiliate' | 'business' | 'custom' | 'mate';
export type Decision = 'pass' | 'patch' | 'regenerate';

export interface SubScore {
  readonly score: number;
  readonly details: Readonly<Record<string, number>>;
  readonly issues: readonly string[];
  readonly suggestions: readonly string[];
}

export interface Weights {
  readonly mode: number;
  readonly safety: number;
  readonly humanlike: number;
}

export interface EvaluationResult {
  readonly mode: Mode;
  readonly modeScore: SubScore;
  readonly humanlikeScore: SubScore;
  readonly safetyScore: SubScore;
  readonly finalScore: number;
  readonly decision: Decision;
  readonly retryDirective: string | null;
  readonly weights: Weights;
}

export interface EvaluationInput {
  readonly body: string;
  readonly title?: string;
  readonly headings?: ReadonlyArray<{ title?: string; content?: string }>;
  readonly rawText?: string;
  readonly primaryKeyword?: string;
  readonly secondaryKeywords?: readonly string[];
  readonly mode: Mode;
  readonly contentMode?: string;
  readonly toneStyle?: string;
  readonly categoryHint?: string;
  /** 쇼핑 글의 작성자 경험 근거. 구매자 리뷰는 first_party가 아니다. */
  readonly affiliateEvidenceMode?: AffiliateEvidenceMode;
}

const WEIGHTS: Readonly<Record<Mode, Weights>> = {
  seo:       { mode: 0.60, safety: 0.25, humanlike: 0.15 },
  homefeed:  { mode: 0.40, safety: 0.20, humanlike: 0.40 },
  affiliate: { mode: 0.50, safety: 0.20, humanlike: 0.30 },
  business:  { mode: 0.50, safety: 0.30, humanlike: 0.20 },
  custom:    { mode: 0.50, safety: 0.30, humanlike: 0.20 },
  mate:      { mode: 0.55, safety: 0.35, humanlike: 0.10 },
};

function decide(final: number, safety: number): Decision {
  if (safety < 50) return 'regenerate';
  if (final < 60) return 'regenerate';
  if (final < 80) return 'patch';
  return 'pass';
}

function buildRetryDirective(
  decision: Decision,
  mode: Mode,
  modeScore: SubScore,
  humanlikeScore: SubScore,
  safetyScore: SubScore,
): string | null {
  if (decision === 'pass') return null;

  const lines: string[] = [];
  lines.push(`[Quality Gate — ${decision === 'regenerate' ? '재생성' : '부분 수정'} 지시 (${mode} 모드)]`);

  if (safetyScore.score < 70 && safetyScore.issues.length > 0) {
    lines.push(`\n안전성 (${safetyScore.score}점) — 우선 수정:`);
    for (const issue of safetyScore.issues.slice(0, 3)) lines.push(`  • ${issue}`);
  }
  if (modeScore.score < 75 && modeScore.issues.length > 0) {
    lines.push(`\n${mode.toUpperCase()} 평가 (${modeScore.score}점) — 미달 항목:`);
    for (const issue of modeScore.issues.slice(0, 4)) lines.push(`  • ${issue}`);
  }
  if (humanlikeScore.score < 70 && humanlikeScore.issues.length > 0) {
    lines.push(`\n사람다움 (${humanlikeScore.score}점) — 개선 필요:`);
    for (const issue of humanlikeScore.issues.slice(0, 3)) lines.push(`  • ${issue}`);
  }

  // 가장 효과적인 suggestion 3개
  const allSuggestions = [
    ...safetyScore.suggestions.slice(0, 2),
    ...modeScore.suggestions.slice(0, 2),
    ...humanlikeScore.suggestions.slice(0, 2),
  ];
  if (allSuggestions.length > 0) {
    lines.push('\n구체 개선 지시:');
    for (const s of allSuggestions.slice(0, 5)) lines.push(`  → ${s}`);
  }

  return lines.join('\n');
}

export function evaluate(input: EvaluationInput): EvaluationResult {
  const mode = input.mode;
  const weights = WEIGHTS[mode] ?? WEIGHTS.seo;

  let modeScore: SubScore;
  if (mode === 'homefeed') {
    modeScore = evaluateHomefeed(input);
  } else if (mode === 'affiliate') {
    modeScore = evaluateAffiliate(input);
  } else if (mode === 'mate') {
    modeScore = evaluateOfficialExposure(input);
  } else {
    // seo, business, custom 모두 SEO evaluator 사용 (가중치만 다름)
    modeScore = evaluateSeo(input);
  }

  const humanlikeScore = evaluateHumanlike(input);
  const safetyScore = evaluateSafety(input);

  const finalRaw =
    modeScore.score * weights.mode +
    safetyScore.score * weights.safety +
    humanlikeScore.score * weights.humanlike;
  const finalScore = Math.round(Math.max(0, Math.min(100, finalRaw)));

  const decision = decide(finalScore, safetyScore.score);
  const retryDirective = buildRetryDirective(decision, mode, modeScore, humanlikeScore, safetyScore);

  return {
    mode,
    modeScore,
    humanlikeScore,
    safetyScore,
    finalScore,
    decision,
    retryDirective,
    weights,
  };
}
