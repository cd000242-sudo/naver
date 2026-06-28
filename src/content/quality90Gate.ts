import type { EvaluationResult, Mode } from './qualityEvaluator';

export const QUALITY90_TARGET_SCORE = 90;

const QUALITY90_MODES = new Set<Mode>(['seo', 'homefeed', 'mate']);

export interface Quality90GateAssessment {
  readonly enabled: boolean;
  readonly passed: boolean;
  readonly miss: boolean;
  readonly reasons: readonly string[];
  readonly directive: string;
}

export function isQuality90Mode(mode: string): mode is Extract<Mode, 'seo' | 'homefeed' | 'mate'> {
  return QUALITY90_MODES.has(mode as Mode);
}

function buildScoreReason(label: string, score: number): string | null {
  return score < QUALITY90_TARGET_SCORE
    ? `${label} ${score}<${QUALITY90_TARGET_SCORE}`
    : null;
}

export function assessQuality90Gate(
  result: Pick<EvaluationResult, 'modeScore' | 'humanlikeScore' | 'safetyScore' | 'finalScore' | 'retryDirective'>,
  mode: string,
): Quality90GateAssessment {
  if (!isQuality90Mode(mode)) {
    return {
      enabled: false,
      passed: true,
      miss: false,
      reasons: [],
      directive: '',
    };
  }

  const reasons = [
    buildScoreReason('modeScore', result.modeScore.score),
    buildScoreReason('finalScore', result.finalScore),
    mode === 'homefeed' ? buildScoreReason('humanlikeScore', result.humanlikeScore.score) : null,
  ].filter((reason): reason is string => Boolean(reason));

  const passed = reasons.length === 0;
  const issueLines = [
    ...result.modeScore.issues.slice(0, 3),
    ...result.humanlikeScore.issues.slice(0, mode === 'homefeed' ? 3 : 1),
    ...result.safetyScore.issues.slice(0, 2),
  ];
  const suggestionLines = [
    ...result.modeScore.suggestions.slice(0, 3),
    ...result.humanlikeScore.suggestions.slice(0, mode === 'homefeed' ? 3 : 1),
    ...result.safetyScore.suggestions.slice(0, 2),
  ];

  const directive = passed
    ? ''
    : [
        `[QualityGate 90+ HARD TARGET — ${mode} 모드]`,
        `현재 점수: mode=${result.modeScore.score}, final=${result.finalScore}, humanlike=${result.humanlikeScore.score}, safety=${result.safetyScore.score}`,
        `미달 항목: ${reasons.join(', ')}`,
        '',
        '반드시 실제 최종 글이 아래 조건을 만족하도록 전체 톤과 구조를 다시 보정하세요.',
        `- ${mode} 모드 점수 ${QUALITY90_TARGET_SCORE}점 이상`,
        `- 종합 점수 ${QUALITY90_TARGET_SCORE}점 이상`,
        ...(mode === 'homefeed' ? [`- 홈판 사람다움 점수 ${QUALITY90_TARGET_SCORE}점 이상`] : []),
        '- 독자가 바로 저장하거나 인용할 수 있는 결론, 기준, 예외, 체크리스트, 표/FAQ를 자연스럽게 포함',
        '- AI 보고체, 일반론, 딱딱한 ~다 종결을 줄이고 실제 사람이 설명하는 문장 흐름으로 수정',
        issueLines.length > 0 ? `\n우선 해결할 문제:\n${issueLines.map((issue) => `- ${issue}`).join('\n')}` : '',
        suggestionLines.length > 0 ? `\n구체 개선 지시:\n${suggestionLines.map((suggestion) => `- ${suggestion}`).join('\n')}` : '',
        result.retryDirective ? `\n기존 QualityGate 지시:\n${result.retryDirective}` : '',
      ].filter(Boolean).join('\n');

  return {
    enabled: true,
    passed,
    miss: !passed,
    reasons,
    directive,
  };
}
