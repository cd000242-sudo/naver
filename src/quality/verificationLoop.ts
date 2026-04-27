// Phase 2 (5 Opus 합의): 제목 검증 루프 + "100점 모드" 토글.
//
// 정책:
//   - 100점 모드 OFF (기본): 기존 동작 그대로 (회귀 0)
//   - 100점 모드 ON: 5개 후보 중 hard filter 통과 0개 → 최대 N회 재생성
//
// 사용:
//   const result = await runVerificationLoop({
//     mode: 'homefeed',
//     keyword: '강남 필라테스',
//     generator: async (hint) => generateTitleOnlyPatch(...),
//     premium: true,
//   });

import { scoreTitles, judgeBestTitleByLLM, type TitleMode, type ParsedTitle } from '../titleSelector.js';

const MAX_REGENERATION_ATTEMPTS = 3;
const HARD_FILTER_MIN = 60;
const ACCEPT_THRESHOLD = 80;

export interface VerificationConfig {
  mode: TitleMode;
  keyword: string;
  premium?: boolean; // false면 기존 동작 (1회 생성)
  llmJudgeCall?: (prompt: string) => Promise<string>; // Judge 모델 호출
  generator: (hint?: string) => Promise<{ titles: ParsedTitle[]; raw?: string }>;
}

export interface VerificationResult {
  selected: ParsedTitle | null;
  attempts: number;
  allCandidates: ParsedTitle[];
  exhausted: boolean;
  premium: boolean;
}

export async function runVerificationLoop(cfg: VerificationConfig): Promise<VerificationResult> {
  // Standard 모드: 1회 생성 + scoreTitles + max 선택 (기존 동작)
  if (!cfg.premium) {
    const { titles } = await cfg.generator();
    const scored = scoreTitles(titles, cfg.mode);
    const sorted = [...scored].sort((a, b) => b.score - a.score);
    return {
      selected: sorted[0] || null,
      attempts: 1,
      allCandidates: scored,
      exhausted: false,
      premium: false,
    };
  }

  // Premium 모드: hard filter + judge + 재생성 루프
  let attempt = 0;
  let history: ParsedTitle[] = [];
  let hint: string | undefined;

  while (attempt < MAX_REGENERATION_ATTEMPTS) {
    attempt++;
    const { titles } = await cfg.generator(hint);
    const scored = scoreTitles(titles, cfg.mode);
    history.push(...scored);

    const passed = scored.filter((t) => t.score >= HARD_FILTER_MIN);
    console.log(`[VerificationLoop] 시도 ${attempt}/${MAX_REGENERATION_ATTEMPTS} — 통과 ${passed.length}/${scored.length}`);

    // 통과한 후보 중 ACCEPT_THRESHOLD 이상이 1개라도 있으면 즉시 채택
    const accepted = passed.filter((t) => t.score >= ACCEPT_THRESHOLD);
    if (accepted.length >= 1) {
      const selected = await judgeBestTitleByLLM(accepted, cfg.keyword, cfg.mode, cfg.llmJudgeCall);
      return { selected, attempts: attempt, allCandidates: history, exhausted: false, premium: true };
    }

    // 통과는 했지만 ACCEPT 미달 → 그 후보를 힌트 삼아 재생성
    if (passed.length > 0) {
      hint = `다음 패턴을 참고하되 더 강한 후킹/구체성으로 다시 5개 생성해라:\n${passed
        .slice(0, 3)
        .map((p) => `- ${p.text} (${p.score}점, ${p.reasons.slice(0, 2).join(', ')})`)
        .join('\n')}`;
      continue;
    }

    // 모두 hard filter 탈락 → 모드 가이드 강조해서 처음부터
    hint = `이전 5개 모두 ${HARD_FILTER_MIN}점 미달. 모드 ${cfg.mode}의 핵심 원칙(R0-11~R0-16)을 다시 적용해서 완전히 새로 5개 생성해라.`;
  }

  // 한도 도달 → history 중 best 폴백
  const sortedHistory = [...history].sort((a, b) => b.score - a.score);
  console.warn(`[VerificationLoop] 한도(${MAX_REGENERATION_ATTEMPTS}) 도달 — history best 폴백`);
  return {
    selected: sortedHistory[0] || null,
    attempts: attempt,
    allCandidates: history,
    exhausted: true,
    premium: true,
  };
}

// Phase 3 모니터링용 메트릭 수집기 (PostMetricsStore와 연동 가능)
export interface VerificationMetric {
  timestamp: string;
  mode: TitleMode;
  keyword: string;
  premium: boolean;
  attempts: number;
  exhausted: boolean;
  selectedScore: number;
  totalCandidates: number;
  avgScore: number;
  passedCount: number;
}

export function collectMetric(cfg: VerificationConfig, result: VerificationResult): VerificationMetric {
  const scores = result.allCandidates.map((c) => c.score);
  const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  return {
    timestamp: new Date().toISOString(),
    mode: cfg.mode,
    keyword: cfg.keyword,
    premium: result.premium,
    attempts: result.attempts,
    exhausted: result.exhausted,
    selectedScore: result.selected?.score || 0,
    totalCandidates: result.allCandidates.length,
    avgScore: Math.round(avg),
    passedCount: result.allCandidates.filter((c) => c.score >= HARD_FILTER_MIN).length,
  };
}
