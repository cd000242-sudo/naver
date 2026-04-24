/**
 * [v2.6.0] Neo-Hook Title Engine — "신박한 후킹" 제목 생성 + 재스코어링
 *
 * 기존 titleABTester는 8개 style × 4개 템플릿 = 32개 고정 틀.
 * 하루 30개 발행 시 반복 패턴 감지 위험 + 뻔한 AI 훅.
 *
 * 본 엔진은:
 *  1. 9개 신박 패턴 카테고리 (각 6~12개 템플릿) = 80+ 신박 틀
 *  2. 직전 N개 제목 유사도 검사 → 0.5 이상 유사 시 제외
 *  3. 역설·의외성·구어체 가산점 (기존 scoreTitleForHomefeed 보강)
 *  4. "AI가 쉽게 뽑을 만한 B급 훅" 블랙리스트 40개 확장
 */

import type { CTRCategory } from './ctrCombat.js';
import { resolveCTRCategory } from './ctrCombat.js';

// ═══════════════════════════════════════════════════════════════════
// 1. Neo-Hook 9 패턴 카테고리 — 80+ 신박 틀
// ═══════════════════════════════════════════════════════════════════

export type NeoHookPattern =
  | 'paradox'           // 역설 ("비싸서 못 산 게 아니라")
  | 'disclosure'        // 내부 고백 ("솔직히 저도 처음엔")
  | 'number_shock'      // 숫자 충격 ("3개월 만에 -8kg")
  | 'mini_scene'        // 미세 장면 ("퇴근길 버스에서 본 거")
  | 'question_raw'      // 날것 질문 ("이거 저만 그래요?")
  | 'reverse_expect'    // 기대 역전 ("좋다길래 샀더니")
  | 'insider_tip'       // 숨은 꿀팁 ("업계 사람만 아는")
  | 'conflict'          // 갈등·대립 ("남편 반대 무릅쓰고")
  | 'sensory';          // 감각 ("한입 베어 무는 순간");

export const NEO_HOOK_TEMPLATES: Record<NeoHookPattern, string[]> = {
  paradox: [
    '{kw} 비싸서 못 산 게 아니라 {reason}',
    '싸서 샀다가 후회한 {kw} vs 비싸서 망설였는데 만족한 것',
    '{kw}, 싼 거 사는 게 손해인 순간',
    '{kw} 고를 때 가격 보지 마세요',
    '{kw}, 오히려 비싼 게 낫더라구요',
    '비싼 {kw}가 더 싸게 먹히는 이유',
    '{kw}, 싼 맛에 샀는데 결국',
    '{kw}, 안 써도 될 돈을 쓰게 되는 구간',
  ],

  disclosure: [
    '솔직히 저도 {kw} 처음엔 {confession}',
    '{kw}, 제가 한 실수 딱 하나 공유',
    '{kw} 쓰면서 들키기 싫은 습관',
    '지금까지 {kw} 잘못하고 있었어요',
    '{kw}, 말 안 하려다 공개하는 후기',
    '{kw} 제가 진짜 두 번 속았어요',
    '{kw} 시작하고 후회한 것부터',
    '{kw} 산 거 중에 진짜 안 쓰는 것',
  ],

  number_shock: [
    '{kw} {N}일 만에 생긴 변화',
    '{kw}, {N}분 투자로 {result}',
    '{kw} 쓰고 {N}% 달라진 것',
    '{N}번 써봤는데 {kw}, 이거 하나는 확실',
    '{kw}, 딱 {N}개만 기억해도 OK',
    '{N}만원 쓰고 {kw}에서 얻은 것',
    '{kw} {N}가지 중에 {M}개는 버리세요',
    '{kw}, {N}년 동안 이거 몰랐네요',
  ],

  mini_scene: [
    '{place}에서 {kw} 마주치고 바로',
    '{time} {kw} 보다가 멈춘 이유',
    '{kw} 앞에서 {N}분 고민한 것',
    '{kw} 사러 갔다가 다른 거 들고 왔어요',
    '{kw}, 우연히 들른 곳에서 발견',
    '지하철에서 {kw} 하는 사람 봤는데',
    '마트 가서 {kw} 집어든 이유',
    '{kw}, 친구가 추천해서 속는 셈 치고',
  ],

  question_raw: [
    '{kw} 이거 저만 {feeling}?',
    '{kw} 하시는 분들 이거 어떠세요?',
    '{kw} 쓰다가 이런 경험 있나요?',
    '{kw}, 혹시 이러신 적 있으세요?',
    '{kw}, 왜 이렇게 된 거죠?',
    '{kw} 할 때 이게 맞는 건가?',
    '{kw}, 다들 어디서 사세요?',
    '{kw}, 저만 불편한 거 아니죠?',
  ],

  reverse_expect: [
    '{kw} 좋다길래 샀더니 {result}',
    '{kw}, 유명해서 써봤는데 의외로',
    '{kw} 추천받고 갔다가 {ending}',
    '{kw} 광고 보고 기대했는데 현실은',
    '블로그마다 칭찬하길래 {kw}, 실제는',
    '{kw}, 인스타 본 거랑 완전 다르네요',
    '{kw} 베스트셀러라길래 열어봤는데',
    '{kw}, 검색 1위여서 기대했던 게 무색',
  ],

  insider_tip: [
    '{kw} 업계 사람만 아는 것',
    '{kw} 할인 제일 크게 받는 시기',
    '매장 직원도 안 알려주는 {kw} 고르는 법',
    '{kw}, 홈페이지 안 들어가면 놓치는 것',
    '{kw} 구매 전에 이거 하나 확인',
    '{kw}, 영업직이 몰래 알려준 팁',
    '{kw}, 공식 답변에 숨어있는 정보',
    '{kw} 사기 전에 검색해야 할 것',
  ],

  conflict: [
    '{kw}, 남편 반대 무릅쓰고 산 것',
    '{kw} 둘러싼 가족 의견 갈렸어요',
    '{kw}, 지인은 말렸지만 저는',
    '{kw}, 논란의 그 제품 써봤어요',
    '{kw}, 호불호 갈린 후기 모음',
    '{kw}, 찬반 의견 많길래 직접',
    '{kw}, 주위에서 다 반대한 선택',
    '{kw} 안 사는 게 정답일까',
  ],

  sensory: [
    '{kw} 한 입 베어 무는 순간',
    '{kw} 열었을 때 이 냄새',
    '{kw} 첫 터치에서 느낀 것',
    '{kw}, 눈 감고 만져봤더니',
    '{kw} 가까이 가야 보이는 것',
    '{kw}, 귀 기울여야 들리는 소리',
    '{kw} 향이 이렇게 달라질 줄',
    '{kw}, 직접 들고 나서야 알게 됨',
  ],
};

// ═══════════════════════════════════════════════════════════════════
// 2. 카테고리별 추천 패턴 조합
// ═══════════════════════════════════════════════════════════════════

export const CATEGORY_PATTERN_MIX: Record<CTRCategory, NeoHookPattern[]> = {
  food: ['sensory', 'mini_scene', 'reverse_expect', 'disclosure', 'insider_tip'],
  parenting: ['disclosure', 'conflict', 'question_raw', 'number_shock', 'reverse_expect'],
  beauty: ['reverse_expect', 'disclosure', 'paradox', 'number_shock', 'insider_tip'],
  health: ['number_shock', 'disclosure', 'paradox', 'conflict', 'insider_tip'],
  travel: ['mini_scene', 'sensory', 'reverse_expect', 'disclosure', 'insider_tip'],
  tech: ['paradox', 'number_shock', 'insider_tip', 'reverse_expect', 'disclosure'],
  lifestyle: ['mini_scene', 'disclosure', 'question_raw', 'sensory', 'paradox'],
  entertainment: ['reverse_expect', 'question_raw', 'disclosure', 'conflict', 'sensory'],
  finance: ['number_shock', 'insider_tip', 'paradox', 'disclosure', 'conflict'],
  general: ['disclosure', 'question_raw', 'reverse_expect', 'number_shock', 'mini_scene'],
};

// ═══════════════════════════════════════════════════════════════════
// 3. 확장 블랙리스트 — "뻔한 AI 훅" 40개
// ═══════════════════════════════════════════════════════════════════

export const NEO_CLICHE_BLACKLIST = [
  // 기존 10개 (ctrCombat 유지)
  '충격', '경악', '소름', '폭로', '반전 주의', '실화', '대박', '난리', '공개', '이럴 수가',
  // 추가 30개 (v2.6.0)
  '꿀팁', '필수템', '인생템', '갓생', '필수', '필독', '핵심정리', '총정리', '대방출', '전격 공개',
  '알고보면', '알고보니', '알고 보니', '뒤늦게 알았', '지금이라도', '지금 당장', '바로 지금',
  '당장 확인', '놓치면 후회', '후회할 뻔', '이것만 알면', '이것만 있으면', '절대 놓치지',
  '클릭 필수', '반드시', '100%', '완벽', '완벽 가이드', '완벽 정리', '이래서', '그래서',
];

// ═══════════════════════════════════════════════════════════════════
// 4. 신박 가산 기준 — 역설·의외성·구어체 보너스
// ═══════════════════════════════════════════════════════════════════

export const NOVELTY_BONUS_PATTERNS = [
  // 역설 어미
  { pattern: /오히려|의외로|비싸.*더|싸.*오히려|안\s*사|안\s*할/, name: '역설', points: 12 },
  // 구체 장면
  { pattern: /지하철|버스|퇴근길|출근길|마트|편의점|약국|학교앞/, name: '미세장면', points: 10 },
  // 구어체 날것
  { pattern: /저만\s*그|저도\s*|이거\s*[가-힣]|그쵸|그죠|맞죠/, name: '구어체날것', points: 8 },
  // 갈등·반대
  { pattern: /반대|말렸|논란|호불호|갈렸/, name: '갈등', points: 10 },
  // 감각 (오감)
  { pattern: /냄새|한입|베어|터치|향|소리|감촉|씹는|들어보/, name: '감각', points: 10 },
  // 고백·실수
  { pattern: /실수|잘못|후회|속았|두\s*번|처음엔/, name: '고백', points: 10 },
  // 구체 인물·장소 (지명, 시간대)
  { pattern: /\d+시|새벽|한밤|주말|평일|\d+분(?:\s|$)|\d+층|\d+번/, name: '구체시공', points: 6 },
  // 상호·고유명사 느낌
  { pattern: /[가-힣]{2,4}(동|점|역|마트|카페|병원|센터)/, name: '고유지명', points: 5 },
];

// ═══════════════════════════════════════════════════════════════════
// 5. 제목 유사도 체크 (직전 N개와 비교)
// ═══════════════════════════════════════════════════════════════════

/**
 * [v2.6.0] 간단 Jaccard 유사도 (한국어 음절/어절 기준)
 * 0~1 사이, 0.5 이상이면 유사 제목으로 간주
 */
export function titleSimilarity(a: string, b: string): number {
  const tokensA = new Set(a.replace(/[^\가-힣a-zA-Z0-9]/g, ' ').split(/\s+/).filter(w => w.length >= 2));
  const tokensB = new Set(b.replace(/[^\가-힣a-zA-Z0-9]/g, ' ').split(/\s+/).filter(w => w.length >= 2));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersect = 0;
  for (const t of tokensA) if (tokensB.has(t)) intersect++;
  const union = tokensA.size + tokensB.size - intersect;
  return intersect / union;
}

/**
 * [v2.6.0] 직전 N개 제목과 유사도 체크
 * 0.5 이상이면 "반복 패턴" → 재생성 권장
 */
export function checkRecentTitleSimilarity(
  candidate: string,
  recentTitles: string[],
  threshold: number = 0.5,
): { isDuplicate: boolean; maxSimilarity: number; mostSimilarTitle?: string } {
  if (recentTitles.length === 0) return { isDuplicate: false, maxSimilarity: 0 };
  let max = 0;
  let maxTitle = '';
  for (const r of recentTitles) {
    const s = titleSimilarity(candidate, r);
    if (s > max) {
      max = s;
      maxTitle = r;
    }
  }
  return {
    isDuplicate: max >= threshold,
    maxSimilarity: Math.round(max * 100) / 100,
    mostSimilarTitle: max >= threshold ? maxTitle : undefined,
  };
}

// ═══════════════════════════════════════════════════════════════════
// 6. Neo-Hook 제목 채점 (novelty 축 추가)
// ═══════════════════════════════════════════════════════════════════

export interface NeoHookScore {
  baseCTR: number;             // ctrCombat의 scoreTitleForHomefeed 결과
  noveltyBonus: number;         // 신박 패턴 가산점
  clicheHits: string[];         // 블랙리스트 매칭
  noveltyMatches: string[];     // 신박 패턴 매칭
  recentSimilarity?: number;    // 직전 제목 유사도
  totalScore: number;           // 최종 (0-100)
  verdict: 'neo_elite' | 'neo_strong' | 'neo_acceptable' | 'neo_bland' | 'neo_reject';
  recommendations: string[];
}

/**
 * [v2.6.0] 신박 후킹 채점 — 기존 scoreTitleForHomefeed 위에 novelty 보강
 */
export function scoreNeoHookTitle(
  title: string,
  options: {
    category?: string;
    baseCTRScore?: number;       // ctrCombat 사전 채점 결과 (있으면 사용)
    recentTitles?: string[];     // 직전 발행 제목들
  } = {},
): NeoHookScore {
  const base = options.baseCTRScore ?? 50;
  const recommendations: string[] = [];

  // 1. 신박 패턴 매칭 → 가산점
  const noveltyMatches: string[] = [];
  let noveltyBonus = 0;
  for (const p of NOVELTY_BONUS_PATTERNS) {
    if (p.pattern.test(title)) {
      noveltyMatches.push(p.name);
      noveltyBonus += p.points;
    }
  }
  if (noveltyMatches.length === 0) {
    recommendations.push('신박 패턴 0개 매칭 — 역설·장면·감각 중 1개 이상 추가');
  }

  // 2. 확장 블랙리스트 감점
  const clicheHits: string[] = [];
  let clicheDeduction = 0;
  for (const word of NEO_CLICHE_BLACKLIST) {
    if (title.includes(word)) {
      clicheHits.push(word);
      clicheDeduction += 8;
    }
  }
  if (clicheHits.length > 0) {
    recommendations.push(`B급 훅 감지: ${clicheHits.join(', ')} — 제거 필요`);
  }

  // 3. 직전 제목 유사도 체크
  let recentSimilarity: number | undefined;
  let similarityDeduction = 0;
  if (options.recentTitles && options.recentTitles.length > 0) {
    const sim = checkRecentTitleSimilarity(title, options.recentTitles, 0.5);
    recentSimilarity = sim.maxSimilarity;
    if (sim.isDuplicate) {
      similarityDeduction = 20;
      recommendations.push(`직전 제목과 유사도 ${sim.maxSimilarity} — "${sim.mostSimilarTitle?.substring(0, 20)}..."와 반복 패턴`);
    } else if (sim.maxSimilarity > 0.3) {
      similarityDeduction = 5;
      recommendations.push(`직전 제목과 유사도 ${sim.maxSimilarity} — 표현 변주 권장`);
    }
  }

  // 4. 종합 스코어
  const total = Math.max(0, Math.min(100, base + noveltyBonus - clicheDeduction - similarityDeduction));

  let verdict: NeoHookScore['verdict'];
  if (total >= 85 && noveltyBonus >= 18) verdict = 'neo_elite';
  else if (total >= 70 && noveltyBonus >= 10) verdict = 'neo_strong';
  else if (total >= 55) verdict = 'neo_acceptable';
  else if (total >= 40) verdict = 'neo_bland';
  else verdict = 'neo_reject';

  if (noveltyBonus < 10 && clicheHits.length === 0) {
    recommendations.push('신박 요소 부족 — 구체 장면, 역설, 감각 묘사 중 1개 필수');
  }

  return {
    baseCTR: base,
    noveltyBonus,
    clicheHits,
    noveltyMatches,
    recentSimilarity,
    totalScore: total,
    verdict,
    recommendations,
  };
}

// ═══════════════════════════════════════════════════════════════════
// 7. 프롬프트 블록 — buildFullPrompt의 홈판 모드에 주입
// ═══════════════════════════════════════════════════════════════════

/**
 * [v2.6.0] 신박 제목 생성 가이드 — 프롬프트 주입용
 * base.prompt Section 5 "첫 줄 5대 공식"을 보강하는 제목 전용 레이어
 */
export function buildNeoHookPromptBlock(categoryHint?: string, primaryKeyword?: string): string {
  const cat = resolveCTRCategory(categoryHint);
  const recommendedPatterns = CATEGORY_PATTERN_MIX[cat];
  const kw = primaryKeyword || '{주제}';

  // 카테고리별 추천 패턴 3개 샘플 예시 생성
  const sampleExamples: string[] = [];
  for (const patternName of recommendedPatterns.slice(0, 3)) {
    const templates = NEO_HOOK_TEMPLATES[patternName];
    const sample = templates[Math.floor(Math.random() * templates.length)];
    const rendered = sample
      .replace(/\{kw\}/g, kw)
      .replace(/\{N\}/g, '3')
      .replace(/\{M\}/g, '2')
      .replace(/\{reason\}/g, '다른 이유가 있더라구요')
      .replace(/\{confession\}/g, '진짜 반신반의였거든요')
      .replace(/\{result\}/g, '생각보다 훨씬 달라졌어요')
      .replace(/\{feeling\}/g, '불편해요')
      .replace(/\{place\}/g, '마트')
      .replace(/\{time\}/g, '저녁 퇴근길에')
      .replace(/\{ending\}/g, '예상 밖 결과');
    sampleExamples.push(`  [${patternName}] "${rendered}"`);
  }

  return `
════════════════════════════════════════════════════════════
[NEO-HOOK TITLE ENGINE] — 신박 후킹 제목 생성 의무 규칙
════════════════════════════════════════════════════════════

★ base.prompt Section 5 "첫 줄 5대 공식"보다 **한 단계 위 독창성** 요구.
★ 하루 30개 발행 기준 "AI 티 안 나고 중복 패턴 없는" 제목 생산.

■ 이 카테고리(${cat}) 추천 패턴 3종 예시:
${sampleExamples.join('\n')}

■ 9개 신박 패턴 중 **최소 1개 필수 포함**:
  1. paradox (역설): "오히려/의외로/비싸서 아니라/싸서 오히려"
  2. disclosure (내부 고백): "솔직히 저도/제가 실수한/두 번 속았"
  3. number_shock (숫자 충격): "N일 만에/N분 투자로/N% 달라진"
  4. mini_scene (미세 장면): "퇴근길 버스에서/마트에서 우연히"
  5. question_raw (날것 질문): "이거 저만 그래요?/다들 어떠세요?"
  6. reverse_expect (기대 역전): "좋다길래 샀더니/유명해서 써봤는데"
  7. insider_tip (숨은 꿀팁): "업계 사람만 아는/직원도 안 알려주는"
  8. conflict (갈등·대립): "남편 반대 무릅쓰고/논란의 그 제품"
  9. sensory (감각): "한입 베어 무는 순간/열었을 때 이 냄새"

■ 신박 가산 요소 (최소 1개 의무, 2개 이상 권장):
  - 역설 어미 ("오히려", "의외로", "비싸서 못 산 게 아니라")
  - 구체 장면 (지하철, 퇴근길, 마트, 편의점, 약국, 학교앞)
  - 구어체 날것 ("저만 그래요?", "이거 뭐죠?", "맞죠?")
  - 갈등·반대 ("반대", "말렸", "논란", "호불호")
  - 감각 (한입, 냄새, 터치, 향, 소리, 감촉)
  - 고백·실수 ("실수", "잘못", "후회", "속았", "처음엔")
  - 구체 시공 (새벽, 한밤, 주말, N시, N분)

⛔ B급 훅 블랙리스트 (사용 시 감점 -8/건):
  충격, 경악, 소름, 폭로, 반전 주의, 실화, 대박, 난리, 공개, 이럴 수가,
  꿀팁, 필수템, 인생템, 갓생, 필수, 필독, 핵심정리, 총정리, 대방출,
  알고보면, 알고보니, 뒤늦게 알았, 지금이라도, 지금 당장, 바로 지금,
  놓치면 후회, 이것만 알면, 이것만 있으면, 절대 놓치지, 클릭 필수,
  반드시, 100%, 완벽, 완벽 가이드, 완벽 정리

■ 반복 방지:
  같은 블로거의 직전 5개 글 제목과 절반 이상 같은 단어 공유 금지.
  "저도 X 했는데 이렇게 됐어요" 패턴도 5번에 1번 이하로만.

■ 최종 자가검토:
  □ 신박 패턴 9개 중 1개 이상 매칭?
  □ 신박 가산 요소 최소 1개 포함?
  □ B급 블랙리스트 단어 0개?
  □ 직전 제목들과 다른 패턴?
  □ 28~42자 유지 + 숫자 또는 구체 고유명사 1개?

하나라도 "아니오"면 재생성.
════════════════════════════════════════════════════════════
`;
}
