import type { EvaluationResult, Mode } from './qualityEvaluator';

export const QUALITY90_TARGET_SCORE = 90;
export const QUALITY90_FALLBACK_MIN_SCORE = 80;
// Integer heuristic scores can move by one point without a material quality change.
// Keep that boundary jitter from triggering three rewrites and a failed publication.
export const QUALITY90_FALLBACK_MIN_MODE_SCORE = 74;
export const QUALITY90_FALLBACK_MIN_HUMANLIKE_SCORE = 70;
export const QUALITY90_FALLBACK_MIN_SAFETY_SCORE = 70;

const QUALITY90_MODES = new Set<Mode>(['seo', 'homefeed', 'mate', 'affiliate']);
const HUMANLIKE_90_MODES = new Set<Mode>(['homefeed', 'affiliate']);

function getCriticalSafetyReasons(
  safetyScore: Pick<EvaluationResult['safetyScore'], 'details'>,
): readonly string[] {
  const details = safetyScore.details;
  const reasons: string[] = [];
  const hasSourceFidelity = Number.isFinite(details.fidelity);
  const expectedHallucinationScore = hasSourceFidelity ? 25 : 50;

  if (Number.isFinite(details.hallucination)
      && details.hallucination < expectedHallucinationScore) {
    reasons.push('HALLUCINATION_SIGNAL');
  }
  if (hasSourceFidelity && details.fidelity < 60) {
    reasons.push('SOURCE_FIDELITY_SIGNAL');
  }
  if (Number.isFinite(details.evidenceIntegrity) && details.evidenceIntegrity < 100) {
    reasons.push('EVIDENCE_INTEGRITY_SIGNAL');
  }
  if (Number.isFinite(details.affiliateAuthenticity) && details.affiliateAuthenticity < 85) {
    reasons.push('AFFILIATE_AUTHENTICITY_SIGNAL');
  }

  return reasons;
}

export interface Quality90GateAssessment {
  readonly enabled: boolean;
  readonly passed: boolean;
  readonly targetReached: boolean;
  readonly nearTargetAccepted: boolean;
  readonly miss: boolean;
  readonly reasons: readonly string[];
  readonly blockingReasons: readonly string[];
  readonly directive: string;
}

const CRITICAL_SAFETY_PREFIX = 'publication criticalSafety ';

export function getCriticalQuality90SafetyReasons(
  assessment: Pick<Quality90GateAssessment, 'blockingReasons'>,
): readonly string[] {
  return assessment.blockingReasons
    .filter(reason => reason.startsWith(CRITICAL_SAFETY_PREFIX))
    .map(reason => reason.slice(CRITICAL_SAFETY_PREFIX.length));
}

export type FinalQuality90Disposition = 'PASS' | 'ADVISORY' | 'BLOCK_SAFETY';

export function resolveFinalQuality90Disposition(
  assessment: Pick<Quality90GateAssessment, 'miss' | 'blockingReasons'>,
): FinalQuality90Disposition {
  if (!assessment.miss) return 'PASS';
  return getCriticalQuality90SafetyReasons(assessment).length > 0
    ? 'BLOCK_SAFETY'
    : 'ADVISORY';
}

export function isQuality90Mode(mode: string): mode is Extract<Mode, 'seo' | 'homefeed' | 'mate' | 'affiliate'> {
  return QUALITY90_MODES.has(mode as Mode);
}

export function canAcceptQuality90Fallback(
  result: Pick<EvaluationResult, 'modeScore' | 'humanlikeScore' | 'safetyScore' | 'finalScore' | 'decision'>,
  mode: string,
): boolean {
  if (!isQuality90Mode(mode) || result.decision !== 'pass') return false;
  if (getCriticalSafetyReasons(result.safetyScore).length > 0) return false;

  const meetsCoreFloor = result.modeScore.score >= QUALITY90_FALLBACK_MIN_MODE_SCORE
    && result.finalScore >= QUALITY90_FALLBACK_MIN_SCORE
    && result.safetyScore.score >= QUALITY90_FALLBACK_MIN_SAFETY_SCORE;
  if (!meetsCoreFloor) return false;

  return !HUMANLIKE_90_MODES.has(mode as Mode)
    || result.humanlikeScore.score >= QUALITY90_FALLBACK_MIN_HUMANLIKE_SCORE;
}

function buildScoreReason(label: string, score: number): string | null {
  return score < QUALITY90_TARGET_SCORE
    ? `${label} ${score}<${QUALITY90_TARGET_SCORE}`
    : null;
}

export function assessQuality90Gate(
  result: Pick<EvaluationResult, 'modeScore' | 'humanlikeScore' | 'safetyScore' | 'finalScore' | 'decision' | 'retryDirective'>,
  mode: string,
): Quality90GateAssessment {
  if (!isQuality90Mode(mode)) {
    return {
      enabled: false,
      passed: true,
      targetReached: false,
      nearTargetAccepted: false,
      miss: false,
      reasons: [],
      blockingReasons: [],
      directive: '',
    };
  }

  const targetReasons = [
    buildScoreReason('modeScore', result.modeScore.score),
    buildScoreReason('finalScore', result.finalScore),
    HUMANLIKE_90_MODES.has(mode as Mode) ? buildScoreReason('humanlikeScore', result.humanlikeScore.score) : null,
  ].filter((reason): reason is string => Boolean(reason));

  const criticalSafetyReasons = getCriticalSafetyReasons(result.safetyScore);
  const blockingReasons = [
    result.modeScore.score < QUALITY90_FALLBACK_MIN_MODE_SCORE
      ? `publication modeScore ${result.modeScore.score}<${QUALITY90_FALLBACK_MIN_MODE_SCORE}`
      : null,
    result.finalScore < QUALITY90_FALLBACK_MIN_SCORE
      ? `publication finalScore ${result.finalScore}<${QUALITY90_FALLBACK_MIN_SCORE}`
      : null,
    result.safetyScore.score < QUALITY90_FALLBACK_MIN_SAFETY_SCORE
      ? `publication safetyScore ${result.safetyScore.score}<${QUALITY90_FALLBACK_MIN_SAFETY_SCORE}`
      : null,
    HUMANLIKE_90_MODES.has(mode as Mode)
      && result.humanlikeScore.score < QUALITY90_FALLBACK_MIN_HUMANLIKE_SCORE
      ? `publication humanlikeScore ${result.humanlikeScore.score}<${QUALITY90_FALLBACK_MIN_HUMANLIKE_SCORE}`
      : null,
    result.decision !== 'pass' ? `publication decision ${result.decision}!=pass` : null,
    ...criticalSafetyReasons.map((reason) => `publication criticalSafety ${reason}`),
  ].filter((reason): reason is string => Boolean(reason));
  const targetReached = targetReasons.length === 0;
  const passed = canAcceptQuality90Fallback(result, mode);
  const nearTargetAccepted = passed && !targetReached;
  const reasons = [...targetReasons, ...blockingReasons];
  const issueLines = [
    ...result.modeScore.issues.slice(0, 3),
    ...result.humanlikeScore.issues.slice(0, HUMANLIKE_90_MODES.has(mode as Mode) ? 3 : 1),
    ...result.safetyScore.issues.slice(0, 2),
  ];
  const suggestionLines = [
    ...result.modeScore.suggestions.slice(0, 3),
    ...result.humanlikeScore.suggestions.slice(0, HUMANLIKE_90_MODES.has(mode as Mode) ? 3 : 1),
    ...result.safetyScore.suggestions.slice(0, 2),
  ];

  const directive = passed
    ? ''
    : [
        `[QualityGate 90+ 목표 / 발행 하한 보정 — ${mode} 모드]`,
        `현재 점수: mode=${result.modeScore.score}, final=${result.finalScore}, humanlike=${result.humanlikeScore.score}, safety=${result.safetyScore.score}`,
        `미달 항목: ${reasons.join(', ')}`,
        '',
        '90점은 개선 목표이며, 아래 자동 발행 하한을 먼저 충족하도록 톤과 구조를 보정하세요.',
        `- ${mode} 모드 점수 ${QUALITY90_FALLBACK_MIN_MODE_SCORE}점 이상`,
        `- 종합 점수 ${QUALITY90_FALLBACK_MIN_SCORE}점 이상`,
        `- 안전성 점수 ${QUALITY90_FALLBACK_MIN_SAFETY_SCORE}점 이상`,
        ...(HUMANLIKE_90_MODES.has(mode as Mode) ? [`- 사람다움 점수 ${QUALITY90_FALLBACK_MIN_HUMANLIKE_SCORE}점 이상`] : []),
        ...(mode === 'affiliate' ? [
          '- 광고 문구처럼 밀어붙이지 말고 친한 사람에게 설명하듯 구체적인 판단 이유, 맞는 사람, 맞지 않는 사람을 함께 제시',
          '- 제공된 실제 사실과 후기 범위 밖의 직접 사용 경험, 성능 단정, 사회적 반응은 만들지 않기',
        ] : []),
        '- 독자가 바로 저장하거나 인용할 수 있는 결론, 기준, 예외, 체크리스트, 표/FAQ를 자연스럽게 포함',
        '- AI 보고체, 일반론, 딱딱한 ~다 종결을 줄이고 실제 사람이 설명하는 문장 흐름으로 수정',
        issueLines.length > 0 ? `\n우선 해결할 문제:\n${issueLines.map((issue) => `- ${issue}`).join('\n')}` : '',
        suggestionLines.length > 0 ? `\n구체 개선 지시:\n${suggestionLines.map((suggestion) => `- ${suggestion}`).join('\n')}` : '',
        result.retryDirective ? `\n기존 QualityGate 지시:\n${result.retryDirective}` : '',
      ].filter(Boolean).join('\n');

  return {
    enabled: true,
    passed,
    targetReached,
    nearTargetAccepted,
    miss: !passed,
    reasons,
    blockingReasons,
    directive,
  };
}
