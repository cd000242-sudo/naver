/**
 * 완전자동 발행용 제목 선택기
 * 
 * AI 출력에서 [TITLE_1], [TITLE_2], [TITLE_3] 파싱
 * 점수화 로직 실행 → 최적 제목 선택
 * {{SELECTED_TITLE}} 토큰 치환
 */

export interface ParsedTitle {
  id: number;
  text: string;
  score: number;
  reasons: string[];
}

export interface TitleSelectionResult {
  success: boolean;
  titles: ParsedTitle[];
  selectedTitle: ParsedTitle | null;
  processedBody: string;
  error?: string;
}

/**
 * AI 출력에서 제목 파싱
 * 형식: [TITLE_1] 제목내용
 */
export function parseTitles(content: string): ParsedTitle[] {
  const titles: ParsedTitle[] = [];
  
  // [TITLE_1], [TITLE_2], [TITLE_3] 패턴 매칭
  const titlePattern = /\[TITLE_(\d+)\]\s*(.+?)(?=\[TITLE_|\n\n|$)/gs;
  let match;
  
  while ((match = titlePattern.exec(content)) !== null) {
    const id = parseInt(match[1], 10);
    const text = match[2].trim();
    
    if (text && id >= 1 && id <= 3) {
      titles.push({
        id,
        text,
        score: 0,
        reasons: []
      });
    }
  }
  
  // 대안 패턴: 줄바꿈으로 구분된 형태
  if (titles.length === 0) {
    const lines = content.split('\n');
    for (const line of lines) {
      const altMatch = line.match(/^\[TITLE_(\d+)\]\s*(.+)$/);
      if (altMatch) {
        const id = parseInt(altMatch[1], 10);
        const text = altMatch[2].trim();
        if (text && id >= 1 && id <= 3) {
          titles.push({
            id,
            text,
            score: 0,
            reasons: []
          });
        }
      }
    }
  }
  
  console.log(`[TitleSelector] 파싱된 제목: ${titles.length}개`);
  return titles;
}

// v2.7.17 (Phase 1 Day 1-2): 5 Opus 에이전트 합의 — 4개 모드 갱신(v3/v8/v9/v1)
// 과 코드 점수화 동기화. 이전엔 프롬프트는 v8/v9 외치는데 코드는 v7 시대 그대로
// (감정단어 +10이 v8 -50과 정반대) — 사용자가 느낀 "조촐"의 직접 원인이었음.
//
// 개선 5가지 (Reviewer Changes Required):
//   1. 모드별 LENGTH_RULES 상수로 자수 기준 통일 (SEO 25~40, 그 외 28~42)
//   2. 빈 수식어 블랙리스트 정규식 (-100)
//   3. 금지 어미 정규식 (-100)
//   4. 어미 패턴 다양성 검증 (-50)
//   5. 감정 단어 모드별 분기 (홈판 -50, 그 외 +0)
//
// 추가:
//   6. 인지 함정 6종 가점 (+15, 홈판/어필)
//   7. AI 못 대체 4영역 키워드 가점 (+20, 홈판/어필)
//   8. 광고법 위반 정규식 (-100, Business)

export type TitleMode = 'seo' | 'homefeed' | 'affiliate' | 'business';

const LENGTH_RULES: Record<TitleMode, { optimal: [number, number]; ok: [number, number] }> = {
  seo: { optimal: [25, 40], ok: [22, 45] },
  homefeed: { optimal: [28, 42], ok: [25, 45] },
  affiliate: { optimal: [28, 42], ok: [25, 45] },
  business: { optimal: [28, 42], ok: [25, 45] },
};

// v8/v9 빈 수식어 블랙리스트 (홈판 L122~129, 어필 L60~64) — 즉시 0점
const EMPTY_MODIFIER_RE = /(핵심\s*포인트|핵심\s*차이점?|핵심\s*정리|결정적\s*이유|결정적\s*차이|결정적\s*한\s*방|놀라운\s*변화|놀라운\s*결과|놀라운\s*효과|확실한\s*효과|확실한\s*방법|완벽\s*정리|대박\s*효과|궁극의\s*비밀|필수\s*정보)/;

// v8 금지 어미 (홈판 L130~135) — 즉시 0점
const BANNED_ENDING_RE = /(뜨거워요|커져요|예상돼요|화제예요|기대돼요|많아요|좋아요|있어요|난리예요|놀라워요|대단해요|아쉬워요|알아보겠습니다|살펴보겠습니다|정리해보겠습니다)$/;

// v8 폭발 감정 단어 (홈판 L186~191) — -50
const HOMPAN_FORBIDDEN_EMOTION = /(충격|경악|소름|눈물바다|미쳤어요|진실\s*공개|알고보니\s*충격|폭로|난리)/;

// 광고법 위반 (Business L77, R0-12) — 즉시 0점
const AD_LAW_VIOLATION_RE = /(100\s*%\s*(만족|보장|성공)|업계\s*1위|국내\s*최고|유일한|최저가|효과\s*보장|부작용\s*없음)/;

// v9 인지 함정 6종 키워드 (홈판/어필) — +15
const COGNITIVE_TRAP_KEYWORDS = [
  '따로 있었다', '이유가 있다', '비밀 하나', // 정보갭
  '버리는 셈', '손해 보고', '놓치면', // 손실
  '오히려 독', '완전 달랐다', '아니었다', '거꾸로', // 부조화
  '그랬는데', '그날 이후로', '포기하려던', // 서사
  '의사도 모르는', '10년 차', '전문가', // 권위
  '나만 몰랐던', '아직도 모르', '90%가 모르는', // FOMO
];

// v9 AI 못 대체 4영역 키워드 (홈판/어필) — +20
const IRREPLACEABLE_4_AREAS = [
  // (1) 체험·오감
  '써본', '먹어본', '직접 가서', '다녀온', '겪어본', '내돈내산', '실사용',
  // (2) 현장 정보
  '현장에서', '직접 본', '담당자에게 들은', '관계자', '추진위',
  // (3) 공감·서사
  '느꼈던', '솔직히', '진짜 후회', '평생 후회', '진짜 이유',
  // (4) 소비 깊은 후기
  '비싸기만', '광고와 다른', '의외의 단점', '사고 후회',
];

// 어미 패턴 분류기 (어미 다양성 검증용)
function classifyEnding(text: string): string {
  const last10 = text.slice(-10);
  if (/(따로 있었다|이유가 있다|비밀)/.test(last10)) return 'gap';
  if (/(버리는 셈|손해|놓치면)/.test(last10)) return 'loss';
  if (/(독이었다|달랐다|아니었다)/.test(last10)) return 'reversal';
  if (/(그랬는데|그날 이후|순간)/.test(last10)) return 'narrative';
  if (/(맞나|괜찮을까|가능한 걸까|어떨까)/.test(last10)) return 'doubt';
  if (/(차이|줄었다|만원|이 정도)/.test(last10)) return 'evidence';
  if (/(았|었|였|랐)다$/.test(text)) return 'past';
  if (/(다|요)$/.test(text)) return 'declarative';
  if (/[\?]$/.test(text)) return 'question';
  return 'other';
}

/**
 * 제목 점수화 (v2.7.17 — 4모드 동기화 + 새 검증 6종)
 *
 * @param titles - 채점할 제목 후보 (5개 권장)
 * @param mode - 발행 모드 (모드별 가중치/규칙 분기). 미지정 시 'homefeed'로 폴백
 */
export function scoreTitles(titles: ParsedTitle[], mode: TitleMode = 'homefeed'): ParsedTitle[] {
  // 어미 다양성 사전 계산 (5개 후보 비교)
  const endingCounts = new Map<string, number>();
  for (const t of titles) {
    const e = classifyEnding(t.text);
    endingCounts.set(e, (endingCounts.get(e) || 0) + 1);
  }

  return titles.map((title) => {
    let score = 50;
    const reasons: string[] = [];
    const text = title.text;
    const lengthRule = LENGTH_RULES[mode];

    // ── 1. 모드별 자수 (Reviewer C1: 4종 분산 → 통일) ──
    const length = text.length;
    if (length >= lengthRule.optimal[0] && length <= lengthRule.optimal[1]) {
      score += 15;
      reasons.push(`최적 자수(${mode}: ${lengthRule.optimal[0]}~${lengthRule.optimal[1]})`);
    } else if (length >= lengthRule.ok[0] && length <= lengthRule.ok[1]) {
      score += 5;
      reasons.push('적정 자수');
    } else {
      score -= 30;
      reasons.push(`자수 위반(${length}자, 권장 ${lengthRule.optimal[0]}~${lengthRule.optimal[1]})`);
    }

    // ── 2. 빈 수식어 블랙리스트 (v8 홈판 L122~129) ──
    if (EMPTY_MODIFIER_RE.test(text)) {
      score = 0;
      reasons.push('🚫 빈 수식어 블랙리스트(-100)');
      return { ...title, score, reasons };
    }

    // ── 3. 금지 어미 (v8 홈판 L130~135) ──
    if (BANNED_ENDING_RE.test(text)) {
      score = 0;
      reasons.push('🚫 금지 어미(-100)');
      return { ...title, score, reasons };
    }

    // ── 4. 광고법 위반 (Business 즉시 탈락) ──
    if (mode === 'business' && AD_LAW_VIOLATION_RE.test(text)) {
      score = 0;
      reasons.push('🚫 광고법 위반(-100, Business)');
      return { ...title, score, reasons };
    }

    // ── 5. 어미 다양성 (v8 홈판 L142: "5개 후보 모두 달라야") ──
    const myEnding = classifyEnding(text);
    const sameEndingCount = endingCounts.get(myEnding) || 0;
    if (sameEndingCount >= 2) {
      score -= 30 * (sameEndingCount - 1);
      reasons.push(`어미 충돌 -${30 * (sameEndingCount - 1)} (${myEnding} ${sameEndingCount}회)`);
    }

    // ── 6. 따옴표 인용 ──
    if (/"[^"]+"|'[^']+'|「[^」]+」/.test(text)) {
      score += 8;
      reasons.push('따옴표 인용');
    }

    // ── 7. 구체적 숫자 (R0-12 — 추상→구체 강제) ──
    const hasPeriod = /\d+[년월주일]\s*(차|째|만에|이용|사용|동안|후|전)?/.test(text);
    const hasNumber = /\d+[만억원%명개세살]|\d+,\d+|\d+\.\d+/.test(text);
    if (hasNumber) {
      score += 12;
      reasons.push('구체 숫자(R0-12)');
    } else if (hasPeriod) {
      score += 5;
      reasons.push('기간 표현');
    }

    // ── 8. 감정 단어: 모드별 분기 (Reviewer C4 핵심 fix) ──
    if (mode === 'homefeed' && HOMPAN_FORBIDDEN_EMOTION.test(text)) {
      score -= 50;
      reasons.push('🚫 홈판 금지 폭발 감정(v8 -50)');
    }

    // ── 9. 인지 함정 (홈판/어필 +15) ──
    if (mode === 'homefeed' || mode === 'affiliate') {
      const trapHits = COGNITIVE_TRAP_KEYWORDS.filter((k) => text.includes(k)).length;
      if (trapHits > 0) {
        score += Math.min(15, trapHits * 8);
        reasons.push(`인지 함정 ${trapHits}개`);
      } else {
        score -= 20;
        reasons.push('인지 함정 0개(-20)');
      }
    }

    // ── 10. AI 못 대체 4영역 (홈판/어필 +20) ──
    if (mode === 'homefeed' || mode === 'affiliate') {
      const irrHits = IRREPLACEABLE_4_AREAS.filter((k) => text.includes(k)).length;
      if (irrHits > 0) {
        score += Math.min(20, irrHits * 10);
        reasons.push(`AI 못대체 영역 ${irrHits}개(+${Math.min(20, irrHits * 10)})`);
      }
    }

    // ── 11. 설명형 제목 감점 (홈판은 강하게, SEO는 약하게) ──
    const explanatoryPatterns = ['총정리', '알아보겠', '꿀팁', '필독'];
    const isExplanatory = explanatoryPatterns.some((p) => text.includes(p));
    if (isExplanatory) {
      score -= mode === 'homefeed' ? 20 : 8;
      reasons.push('설명형(감점)');
    }

    // ── 12. 가운뎃점/세미콜론 (4모드 공통 즉시 0점) ──
    if (/[·;']/.test(text)) {
      score = 0;
      reasons.push('🚫 금지 기호(·;\') -100');
      return { ...title, score, reasons };
    }

    return {
      ...title,
      score: Math.max(0, Math.min(100, score)),
      reasons,
    };
  });
}

/**
 * 후보 세트 단위 기간 편중 감점
 * 전체 후보 중 기간 표현이 2개 이상이면 초과분에 감점 적용
 */
function penalizePeriodOveruse(titles: ParsedTitle[]): ParsedTitle[] {
  const periodPattern = /\d+\s*[년월주일]\s*(차|째|만에|이용|사용|동안|후|전)?/;
  const periodTitles = titles.filter(t => periodPattern.test(t.text));

  if (periodTitles.length <= 1) return titles;

  const sortedPeriod = [...periodTitles].sort((a, b) => b.score - a.score);
  const toPenalize = new Set(sortedPeriod.slice(1).map(t => t.id));

  console.log(`[TitleSelector] ⚠️ 기간 표현 ${periodTitles.length}개 감지 → ${toPenalize.size}개 감점`);

  return titles.map(t => {
    if (toPenalize.has(t.id)) {
      return {
        ...t,
        score: Math.max(0, t.score - 10),
        reasons: [...t.reasons, '기간 편중 감점(-10)']
      };
    }
    return t;
  });
}

// ✅ [v1.4.46] 연속 발행 시 기간 표현 반복 방지 — 최근 N개 글의 기간 사용 이력 추적
// 사용자 불만: "2주 3주 6개월 3개월" 같은 기간 반복이 심함
// 원인: 세션 메모리 없어 매 글마다 독립적으로 점수 계산 → 기간 제목이 매번 1위
// 해결: 최근 10개 글의 기간 사용 이력을 저장, 동일 기간 재사용 시 강한 감점
const RECENT_HISTORY_SIZE = 10;
let _recentPeriodUsage: { title: string; usedPeriod: boolean; timestamp: number }[] = [];

function extractPeriodFromTitle(text: string): boolean {
  return /\d+\s*[년월주일]\s*(차|째|만에|이용|사용|동안|후|전)?/.test(text);
}

function penalizeSessionRepetition(titles: ParsedTitle[]): ParsedTitle[] {
  // 최근 10개 중 기간 사용률 계산
  const recent = _recentPeriodUsage.slice(-RECENT_HISTORY_SIZE);
  if (recent.length === 0) return titles;

  const periodUsageCount = recent.filter(r => r.usedPeriod).length;
  const periodUsageRatio = periodUsageCount / recent.length;

  // 최근 3개 중 2개 이상이 기간 표현이면 "최근 과다 사용" 상태
  const last3 = recent.slice(-3);
  const last3PeriodCount = last3.filter(r => r.usedPeriod).length;
  const isOveruseRecent = last3.length >= 2 && last3PeriodCount >= 2;

  // 기간 사용률이 50% 이상이거나 최근 과다 사용이면 강한 감점
  const needsPenalty = periodUsageRatio >= 0.5 || isOveruseRecent;
  if (!needsPenalty) return titles;

  const penaltyAmount = isOveruseRecent ? -30 : -20;
  console.log(`[TitleSelector] 🚫 최근 ${recent.length}개 중 ${periodUsageCount}개가 기간 표현 (${Math.round(periodUsageRatio*100)}%) → 기간 후보 ${penaltyAmount}점 감점`);

  return titles.map(t => {
    if (extractPeriodFromTitle(t.text)) {
      return {
        ...t,
        score: Math.max(0, t.score + penaltyAmount),
        reasons: [...t.reasons, `최근 기간 남용 방지(${penaltyAmount})`]
      };
    }
    return t;
  });
}

/**
 * 제목 선택 후 기록 (다음 글 생성 시 반복 방지용)
 */
export function recordSelectedTitle(title: string): void {
  _recentPeriodUsage.push({
    title,
    usedPeriod: extractPeriodFromTitle(title),
    timestamp: Date.now(),
  });
  // 최근 N개만 유지
  if (_recentPeriodUsage.length > RECENT_HISTORY_SIZE * 2) {
    _recentPeriodUsage = _recentPeriodUsage.slice(-RECENT_HISTORY_SIZE);
  }
  console.log(`[TitleSelector] 📝 제목 기록: "${title}" (기간 포함: ${extractPeriodFromTitle(title)})`);
}

/**
 * 최근 기간 사용 이력 리셋 (새 세션 시작 시)
 */
export function resetTitleHistory(): void {
  _recentPeriodUsage = [];
  console.log('[TitleSelector] 🔄 제목 이력 초기화');
}

/**
 * 현재 기록된 최근 기간 표현들 반환 (프롬프트 주입용)
 */
export function getRecentPeriods(): string[] {
  return _recentPeriodUsage
    .slice(-RECENT_HISTORY_SIZE)
    .filter(r => r.usedPeriod)
    .map(r => {
      const match = r.title.match(/\d+\s*[년월주일]\s*(?:차|째|만에|이용|사용|동안|후|전)?/);
      return match ? match[0].trim() : '';
    })
    .filter(Boolean);
}

// v2.7.18 (Phase 1 Day 3): Hard filter 임계값. 정적 점수의 "순위 결정 권한" 박탈.
// 이전: 점수 max를 그대로 선택 → 점수 인플레이션 (모든 후보 90점+ 표시)
// 이후: HARD_FILTER_MIN 미달 후보는 탈락만 시키고, 통과한 후보 중 선택은 LLM judge가
//       또는 그 외 신호(과거 패턴 등)로. 정적 점수는 더 이상 정렬 결정자 X.
const HARD_FILTER_MIN = 60;

/**
 * 최적 제목 선택 (v2.7.18 Phase 1 Day 3)
 *
 * 새 정책:
 *   1. HARD_FILTER_MIN 미달은 즉시 탈락 (점수화는 hard filter 역할)
 *   2. 통과한 후보들 중 정적 점수 max — 단 모두 동점 가능성 ↑
 *   3. 모두 탈락이면 가장 덜 나쁜 1개 폴백 (실패 방지)
 *
 * Phase 1 Day 4에서 judgeBestTitleByLLM으로 별도 모델 호출 분리됨.
 */
export function selectBestTitle(titles: ParsedTitle[]): ParsedTitle | null {
  if (titles.length === 0) return null;

  let adjusted = penalizePeriodOveruse(titles);
  adjusted = penalizeSessionRepetition(adjusted);

  // v2.7.18: hard filter — HARD_FILTER_MIN 이상만 후보 유지
  const passed = adjusted.filter((t) => t.score >= HARD_FILTER_MIN);

  console.log(`[TitleSelector] hard filter: ${passed.length}/${adjusted.length} 통과 (>= ${HARD_FILTER_MIN}점)`);
  adjusted.forEach((t, i) => {
    const pass = t.score >= HARD_FILTER_MIN ? '✅' : '🚫';
    console.log(`  ${i + 1}. ${pass} [${t.score}점] ${t.text}`);
    console.log(`     이유: ${t.reasons.join(', ')}`);
  });

  // 통과한 게 있으면 그중 max, 없으면 전체 중 가장 덜 나쁜 것 (폴백)
  const pool = passed.length > 0 ? passed : adjusted;
  const sorted = [...pool].sort((a, b) => b.score - a.score);
  const selected = sorted[0];

  if (selected) {
    recordSelectedTitle(selected.text);
  }
  return selected;
}

/**
 * v2.7.18 (Phase 1 Day 4): LLM Judge로 5개 후보 중 1개 선택.
 *
 * Generator(Gemini)가 만든 후보를 다른 모델(Claude)이 평가 → self-confirmation bias 제거.
 *
 * 호출 측에서 사용:
 *   const passed = scoreTitles(titles, mode).filter(t => t.score >= 60);
 *   const judged = await judgeBestTitleByLLM(passed, inputKeyword, mode, anthropicCall);
 *
 * @param candidates - hard filter 통과한 후보 (1~5개)
 * @param inputKeyword - 사용자 입력 키워드
 * @param mode - 발행 모드
 * @param llmJudgeCall - LLM 호출 함수 (Anthropic SDK 등). 미주입 시 정적 점수 max 폴백
 */
export async function judgeBestTitleByLLM(
  candidates: ParsedTitle[],
  inputKeyword: string,
  mode: TitleMode,
  llmJudgeCall?: (prompt: string) => Promise<string>,
): Promise<ParsedTitle | null> {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  if (!llmJudgeCall) {
    // 폴백: 정적 점수 max
    return [...candidates].sort((a, b) => b.score - a.score)[0];
  }

  const modeGuide: Record<TitleMode, string> = {
    seo: '검색 의도에 명확한 답을 주는 제목 (AI 브리핑 인용 친화: 정의문/N가지/왜?)',
    homefeed: '키워드가 아닌 "소재 후킹" + AI 못 대체 4영역(체험/현장/공감서사/소비후기) 우선',
    affiliate: '구매 결정에 영향 줄 디테일 + 추상→구체 숫자',
    business: '광고법 0 위반 + 지역+업종+업체명 + 검증 가능 숫자',
  };

  const prompt = `너는 네이버 블로그 제목 평가 심사관이다. 사용자 입력 키워드와 모드 가이드에 가장 잘 맞는 1개를 골라라.

[사용자 입력]
키워드: ${inputKeyword}
모드: ${mode}
모드 가이드: ${modeGuide[mode]}

[후보 ${candidates.length}개]
${candidates.map((t, i) => `${i + 1}. ${t.text} (정적 점수: ${t.score})`).join('\n')}

[평가 기준 - 5축, 각 0~20점]
1. 검색 의도/맥락 답변도
2. 호기심/후킹 강도
3. 신뢰/근거 구체성 (숫자 1개 이상?)
4. 모드 적합도
5. 클릭 후 이탈 위험 (낮을수록 +)

JSON만 출력:
{"selectedIndex": <1~${candidates.length}>, "reasoning": "<한 줄 이유>", "scores": [<각 후보 0~100>]}`;

  try {
    const response = await llmJudgeCall(prompt);
    const jsonMatch = response.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) throw new Error('JSON 파싱 실패');
    const parsed = JSON.parse(jsonMatch[0]);
    const idx = (parsed.selectedIndex || 1) - 1;
    const selected = candidates[idx] || candidates[0];

    // judge 점수가 있으면 정적 점수와 가중 평균 (judge 0.6 + 정적 0.4)
    if (Array.isArray(parsed.scores)) {
      candidates.forEach((c, i) => {
        const j = parsed.scores[i] || c.score;
        c.score = Math.round(j * 0.6 + c.score * 0.4);
        c.reasons.push(`Judge: ${j}점, 가중평균 적용`);
      });
    }

    console.log(`[TitleJudge] LLM Judge 선택: "${selected.text}" — ${parsed.reasoning || ''}`);
    if (selected) recordSelectedTitle(selected.text);
    return selected;
  } catch (err) {
    console.warn(`[TitleJudge] LLM Judge 실패, 정적 점수 max 폴백: ${(err as Error).message}`);
    return [...candidates].sort((a, b) => b.score - a.score)[0];
  }
}

/**
 * {{SELECTED_TITLE}} 토큰 치환
 */
export function replaceSelectedTitleToken(body: string, selectedTitle: string): string {
  // {{SELECTED_TITLE}} 토큰 치환
  let result = body.replace(/\{\{SELECTED_TITLE\}\}/g, selectedTitle);
  
  // 혹시 다른 형태의 토큰이 있을 경우 대비
  result = result.replace(/\{\{ *SELECTED_TITLE *\}\}/g, selectedTitle);
  
  return result;
}

/**
 * 전체 프로세스 실행
 * 
 * 1. AI 출력에서 제목 파싱
 * 2. 점수화
 * 3. 최적 제목 선택
 * 4. {{SELECTED_TITLE}} 치환
 */
export function processAutoPublishContent(aiOutput: string, mode: TitleMode = 'homefeed'): TitleSelectionResult {
  try {
    // 1. 제목 파싱
    const titles = parseTitles(aiOutput);

    if (titles.length === 0) {
      return {
        success: false,
        titles: [],
        selectedTitle: null,
        processedBody: aiOutput,
        error: '제목을 파싱할 수 없습니다. [TITLE_1], [TITLE_2], [TITLE_3] 형식을 확인하세요.'
      };
    }

    // 2. 점수화 (v2.7.17 — 모드별 분기)
    const scoredTitles = scoreTitles(titles, mode);
    
    // 3. 최적 제목 선택
    const selectedTitle = selectBestTitle(scoredTitles);
    
    if (!selectedTitle) {
      return {
        success: false,
        titles: scoredTitles,
        selectedTitle: null,
        processedBody: aiOutput,
        error: '최적 제목을 선택할 수 없습니다.'
      };
    }
    
    // 4. 본문에서 제목 부분 제거 (제목은 별도로 처리)
    let body = aiOutput;
    
    // 제목 블록 제거 (제목 3개가 연속으로 나오는 부분)
    const titleBlockPattern = /\[TITLE_1\][^\[]*\[TITLE_2\][^\[]*\[TITLE_3\][^\n]*/gs;
    body = body.replace(titleBlockPattern, '');
    
    // 개별 제목 라인 제거
    body = body.replace(/\[TITLE_\d+\]\s*[^\n]+\n?/g, '');
    
    // 5. {{SELECTED_TITLE}} 치환
    const processedBody = replaceSelectedTitleToken(body, selectedTitle.text);
    
    console.log(`[TitleSelector] 선택된 제목: "${selectedTitle.text}" (${selectedTitle.score}점)`);
    
    return {
      success: true,
      titles: scoredTitles,
      selectedTitle,
      processedBody: processedBody.trim()
    };
    
  } catch (error) {
    const err = error as Error;
    console.error('[TitleSelector] 처리 오류:', err);
    return {
      success: false,
      titles: [],
      selectedTitle: null,
      processedBody: aiOutput,
      error: err.message
    };
  }
}

/**
 * 특정 제목 ID로 강제 선택 (테스트/수동 선택용)
 */
export function selectTitleById(aiOutput: string, titleId: number, mode: TitleMode = 'homefeed'): TitleSelectionResult {
  const titles = parseTitles(aiOutput);
  const scoredTitles = scoreTitles(titles, mode);
  
  const selected = scoredTitles.find(t => t.id === titleId);
  
  if (!selected) {
    return {
      success: false,
      titles: scoredTitles,
      selectedTitle: null,
      processedBody: aiOutput,
      error: `제목 ID ${titleId}를 찾을 수 없습니다.`
    };
  }
  
  let body = aiOutput;
  body = body.replace(/\[TITLE_\d+\]\s*[^\n]+\n?/g, '');
  const processedBody = replaceSelectedTitleToken(body, selected.text);
  
  return {
    success: true,
    titles: scoredTitles,
    selectedTitle: selected,
    processedBody: processedBody.trim()
  };
}
