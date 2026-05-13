/**
 * [Phase 3-13/v2.10.159] contentGenerator god file decomposition — title formula selector.
 *
 * 제목 공식 패턴(contentTitleFormulas)에서 *현재 시도*에 가장 적합한 공식 선택.
 * 카테고리 우선순위 + 기간 반복 차단 + 사용된 공식 제외 등 로직 포함.
 *
 * 의존:
 *   - PromptMode (promptLoader)
 *   - TitleFormula + FORMULAS + CATEGORY_FORMULA_PRIORITY (contentTitleFormulas)
 *   - getRecentPeriods (titleSelector)
 */

import type { PromptMode } from './promptLoader.js';
import { getRecentPeriods } from './titleSelector.js';
import {
  type TitleFormula,
  SEO_TITLE_FORMULAS,
  HOMEFEED_TITLE_FORMULAS,
  AFFILIATE_TITLE_FORMULAS,
  SHOPPING_EXPERT_TITLE_FORMULAS,
  CATEGORY_FORMULA_PRIORITY,
} from './contentTitleFormulas';

/**
 * 현재 시도에 가장 적합한 제목 공식 선택.
 *
 * 우선순위:
 *   1. mode/articleType에 따라 공식 풀 결정 (homefeed/shopping_expert/affiliate/seo)
 *   2. 최근 기간 표현 2회+ 반복 시 기간 계열 공식 스킵 (hf_duration_exp 등)
 *   3. 카테고리 우선 공식(CATEGORY_FORMULA_PRIORITY) 미사용 항목 우선
 *   4. 풀 내 미사용 공식 → attempt 인덱스로 rotate
 *   5. 전부 사용 시 랜덤
 *
 * @param mode - 'seo' | 'homefeed' | 'affiliate'
 * @param attempt - 재시도 횟수 (0부터 시작)
 * @param usedIds - 직전 시도에서 사용한 공식 ID 목록
 * @param categoryHint - 글 카테고리 (건강/재테크/여행 등)
 * @param articleType - shopping_expert_review 등 세부 타입
 */
export function selectTitleFormula(
  mode: PromptMode,
  attempt: number,
  usedIds: string[],
  categoryHint?: string,
  articleType?: string,
): TitleFormula {
  // affiliate 전용 공식 풀 — shopping_expert_review는 별도 풀 (후기형 표현 금지)
  const isShoppingExpert = mode === 'affiliate' && articleType === 'shopping_expert_review';
  const pool = mode === 'homefeed' ? HOMEFEED_TITLE_FORMULAS
    : isShoppingExpert ? SHOPPING_EXPERT_TITLE_FORMULAS
    : mode === 'affiliate' ? AFFILIATE_TITLE_FORMULAS
    : SEO_TITLE_FORMULAS;
  if (isShoppingExpert) {
    console.log('[TitleGen] 🎯 전문리뷰 전용 공식 풀 사용 (shopping_expert_review) — 후기/체험형 표현 금지');
  }

  // [v1.4.48 Stage A.1] 모드별 풀에서만 검색 — 홈피드 글에 SEO/affiliate 공식 섞임 방지
  const allFormulas = pool;

  // [v1.4.46] 최근 기간 표현 2개 이상 사용 시 기간 계열 공식 스킵
  const DURATION_FORMULA_IDS = ['hf_duration_exp', 'af_duration', 'hf_accumulated'];
  let skipDurationFormulas = false;
  const recent = getRecentPeriods() || [];
  if (recent.length >= 2) {
    skipDurationFormulas = true;
    console.log(`[TitleGen] 🚫 최근 ${recent.length}개 기간 반복 감지 → 기간 계열 공식 스킵`);
  }

  // 카테고리 우선 공식이 있으면 먼저 시도
  if (categoryHint && CATEGORY_FORMULA_PRIORITY[categoryHint]) {
    const priorityIds = CATEGORY_FORMULA_PRIORITY[categoryHint]
      .filter(id => !skipDurationFormulas || !DURATION_FORMULA_IDS.includes(id));
    const priorityUnused = priorityIds
      .filter(id => !usedIds.includes(id))
      .map(id => allFormulas.find(f => f.id === id))
      .filter((f): f is TitleFormula => !!f);
    if (priorityUnused.length > 0) {
      console.log(`[TitleGen] 🎯 카테고리 우선 공식 (${categoryHint}): ${priorityUnused[0].name}`);
      return priorityUnused[0];
    }
  }

  // 아직 사용하지 않은 공식 우선 (해당 모드 풀에서, 필요 시 기간 공식 제외)
  const filteredPool = skipDurationFormulas
    ? pool.filter(p => !DURATION_FORMULA_IDS.includes(p.id))
    : pool;
  const unused = filteredPool.filter(p => !usedIds.includes(p.id));
  if (unused.length > 0) {
    return unused[attempt % unused.length];
  }
  // 전부 사용했으면 랜덤
  return filteredPool[Math.floor(Math.random() * filteredPool.length)] || pool[0];
}
