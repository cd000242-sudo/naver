/**
 * [v2.3.0] Homefeed Precision Engine
 *
 * 단 하나의 목표: **홈판 노출 확률을 최대로 끌어올린다.**
 *
 * 설계 원칙:
 *   - 다른 지표(CPM, 비용, 카테고리 수익) 신경 쓰지 않음
 *   - 홈판 알고리즘의 3대 검증 축만 극한 튜닝:
 *     1. 썸네일·제목 CTR 집중 공식 (엄지 멈춤)
 *     2. 본문 체류시간 공식 (완독 유도)
 *     3. 발행 전 가드 (홈판 못 갈 글 원천 차단)
 *
 * 본 엔진은 1개 포스팅 → "홈판에 뜰 만한 글인가?" 단 하나의 판정.
 */

import type { CTRCategory } from './ctrCombat.js';
import { resolveCTRCategory, scoreTitleForHomefeed } from './ctrCombat.js';

// ═══════════════════════════════════════════════════════════════════
// 1. 홈판 적중 3대 축 (다른 축 전부 제거)
// ═══════════════════════════════════════════════════════════════════

export interface HomefeedScore {
  totalScore: number;           // 0-100 (홈판 노출 확률 직접 비례)
  thumbstopScore: number;        // 0-40 (썸네일·제목 CTR)
  stickinessScore: number;       // 0-35 (본문 체류·완독)
  safetyScore: number;           // 0-25 (저품질 회피)
  homefeedProbability: number;   // % (홈판 노출 확률 추정, 실측 보정 전)
  verdict: 'elite' | 'strong' | 'acceptable' | 'weak' | 'reject';
  criticalIssues: string[];      // 반드시 고칠 것
  quickWins: string[];           // 빠르게 올릴 수 있는 것
}

/**
 * [v2.3.0] 단일 포스팅의 홈판 적중 점수
 */
export function scoreHomefeedPrecision(post: {
  title: string;
  content: string;
  thumbnailText?: string;
  thumbnailHasface?: boolean;
  thumbnailHasNumber?: boolean;
  category?: string;
}): HomefeedScore {
  const cat = resolveCTRCategory(post.category);
  const criticalIssues: string[] = [];
  const quickWins: string[] = [];

  // ───────────────────────────────────────────────
  // AXIS 1: Thumbstop (엄지 멈춤, 40점)
  //   네이버 홈피드에서 1순위 — 스크롤 내리는 엄지를 멈추게 하는 것
  // ───────────────────────────────────────────────
  let thumbstop = 0;

  // 제목 점수 (25점)
  const titleAnalysis = scoreTitleForHomefeed(post.title, post.category);
  const titlePoints = Math.round((titleAnalysis.score / 100) * 25);
  thumbstop += titlePoints;
  if (titleAnalysis.score < 60) {
    criticalIssues.push(`제목 CTR 점수 ${titleAnalysis.score}/100 (권장 70+)`);
    if (titleAnalysis.suggestions[0]) quickWins.push(`제목: ${titleAnalysis.suggestions[0]}`);
  }

  // 썸네일 요소 점수 (15점)
  if (post.thumbnailHasface) { thumbstop += 6; } else {
    quickWins.push('썸네일에 사람 얼굴 또는 클로즈업 요소 추가 (+6점)');
  }
  if (post.thumbnailHasNumber) { thumbstop += 4; } else {
    quickWins.push('썸네일에 큰 숫자 텍스트 추가 (+4점)');
  }
  if (post.thumbnailText && post.thumbnailText.length >= 8 && post.thumbnailText.length <= 20) {
    thumbstop += 5;
  } else if (post.thumbnailText) {
    quickWins.push('썸네일 텍스트 8~20자 (현재 ' + post.thumbnailText.length + '자)');
  }

  // ───────────────────────────────────────────────
  // AXIS 2: Stickiness (체류·완독, 35점)
  //   홈판 알고리즘은 클릭 후 체류시간·스크롤 깊이를 강력 반영
  // ───────────────────────────────────────────────
  let stickiness = 0;
  const content = post.content;
  const len = content.length;

  // 본문 길이 (10점) — 홈판은 1800~2400자 스위트 스팟
  if (len >= 1800 && len <= 2400) {
    stickiness += 10;
  } else if (len >= 1500 && len <= 2800) {
    stickiness += 6;
  } else if (len < 1200) {
    criticalIssues.push(`본문 ${len}자 (홈판 체류 부족, 최소 1500자)`);
  } else if (len > 3500) {
    stickiness += 3;
    quickWins.push('본문 지나치게 김 — 체류시간 하락, 2400자 이하 권장');
  }

  // 소제목 다양성 (8점) — 단조롭지 않은 구조
  const h2Count = (content.match(/##\s/g) || content.match(/<h2/g) || []).length;
  if (h2Count >= 4 && h2Count <= 7) stickiness += 8;
  else if (h2Count >= 3) stickiness += 5;
  else {
    criticalIssues.push(`소제목 ${h2Count}개 (권장 4~6개)`);
    quickWins.push('H2 소제목 4~6개로 구조화');
  }

  // 훅 있는 도입부 (7점) — 첫 3문장이 체류 결정
  const intro = content.substring(0, 300);
  const hasHook = /[?!]|저만|혹시|여러분|이거|이게|솔직히|처음/.test(intro);
  if (hasHook) stickiness += 7;
  else {
    criticalIssues.push('도입부 3문장에 공감·질문 훅 없음');
    quickWins.push('도입부를 "저만 그런가요?" 류 질문형으로');
  }

  // 이미지 수 (5점) — 체류시간 상관도 높음
  const imgCount = (content.match(/!\[.*?\]\(.*?\)|<img/g) || []).length;
  if (imgCount >= 3) stickiness += 5;
  else if (imgCount >= 2) stickiness += 3;
  else {
    criticalIssues.push(`이미지 ${imgCount}장 (체류 떨어짐)`);
    quickWins.push('이미지 최소 3장 삽입');
  }

  // 문장 리듬 (5점) — 단문/중문 섞임
  const sentences = content.match(/[^.!?]+[.!?]/g) || [];
  if (sentences.length >= 10) {
    const avgLen = sentences.reduce((s, x) => s + x.length, 0) / sentences.length;
    const variance = sentences.reduce((s, x) => s + Math.pow(x.length - avgLen, 2), 0) / sentences.length;
    const stdDev = Math.sqrt(variance);
    if (stdDev > 15 && stdDev < 40) stickiness += 5;    // 적당한 편차 = 리듬
    else if (stdDev <= 15) quickWins.push('문장 길이 획일적 — 단문 섞어 리듬 만들기');
  }

  // ───────────────────────────────────────────────
  // AXIS 3: Safety (저품질 회피, 25점)
  //   홈판 알고리즘은 저품질 신호 하나로도 전체 블록
  // ───────────────────────────────────────────────
  let safety = 25;
  const text = post.title + '\n' + content;

  // AI 클리셰 (즉시 감점)
  const aiClicheHits = (text.match(/충격|경악|소름|폭로|미쳤어요|실화|대박 공개|알고보니|진실 공개|이럴 수가/g) || []).length;
  if (aiClicheHits > 0) {
    safety -= aiClicheHits * 5;
    criticalIssues.push(`AI 클리셰 ${aiClicheHits}건 (즉시 저품질 트리거)`);
  }

  // 광고 과다
  const adHits = (content.match(/구매링크|할인코드|최저가|지금 구매|이벤트/g) || []).length;
  if (adHits >= 3) {
    safety -= 5;
    criticalIssues.push(`판매 키워드 ${adHits}회 (광고 블로그 분류 위험)`);
  }

  // 키워드 스팸 (같은 단어 4회 이상)
  const words = text.match(/[가-힣]{2,}/g) || [];
  const wordCount = new Map<string, number>();
  for (const w of words) {
    if (w.length >= 3) wordCount.set(w, (wordCount.get(w) || 0) + 1);
  }
  const spamWords = Array.from(wordCount.entries()).filter(([_, c]) => c >= 5);
  if (spamWords.length > 0) {
    safety -= 5;
    criticalIssues.push(`키워드 스팸: ${spamWords.slice(0, 2).map(([w]) => w).join(', ')} 5회+ 반복`);
  }

  // 너무 짧은 본문
  if (len < 800) {
    safety -= 10;
    criticalIssues.push(`본문 ${len}자 (홈판 최소 800자 미달)`);
  }

  // 정치·민감 주제
  if (/대선|여당|야당|대통령|정치|북한/.test(text)) {
    safety -= 10;
    criticalIssues.push('정치·시사 주제 감지 (광고주 기피 + 저CPM)');
  }

  safety = Math.max(0, safety);

  // ───────────────────────────────────────────────
  // 종합
  // ───────────────────────────────────────────────
  const total = thumbstop + stickiness + safety;

  let verdict: HomefeedScore['verdict'];
  if (total >= 85) verdict = 'elite';
  else if (total >= 70) verdict = 'strong';
  else if (total >= 55) verdict = 'acceptable';
  else if (total >= 35) verdict = 'weak';
  else verdict = 'reject';

  // 확률 매핑 (엄격하게 — 과장 금지)
  // 이 확률은 "LDF·Starter Kit 전체 환경 가정"이며 실제는 이웃·계정 나이 등 외부 요인 추가 반영
  const probabilityMap: Record<HomefeedScore['verdict'], number> = {
    elite: 55,       // 최고 품질 글도 환경 없이는 55% 상한
    strong: 35,
    acceptable: 18,
    weak: 7,
    reject: 1,
  };
  const homefeedProbability = probabilityMap[verdict];

  return {
    totalScore: total,
    thumbstopScore: thumbstop,
    stickinessScore: stickiness,
    safetyScore: safety,
    homefeedProbability,
    verdict,
    criticalIssues: Array.from(new Set(criticalIssues)).slice(0, 5),
    quickWins: Array.from(new Set(quickWins)).slice(0, 5),
  };
}

/**
 * [v2.3.0] 발행 허가 판정 (Strict gate)
 *   - elite/strong: 발행 허가
 *   - acceptable: 경고와 함께 허가
 *   - weak/reject: 재생성 요구
 */
export function approveForPublish(score: HomefeedScore, strictness: 'lenient' | 'strict' = 'strict'): {
  approved: boolean;
  level: 'green' | 'yellow' | 'red';
  reason: string;
} {
  if (score.verdict === 'elite' || score.verdict === 'strong') {
    return { approved: true, level: 'green', reason: `${score.verdict} 등급 (${score.totalScore}/100) — 홈판 가능성 ${score.homefeedProbability}%` };
  }
  if (score.verdict === 'acceptable') {
    if (strictness === 'strict') {
      return { approved: false, level: 'yellow', reason: `acceptable (${score.totalScore}/100) — 엄격 모드에선 재생성 권장` };
    }
    return { approved: true, level: 'yellow', reason: `acceptable (${score.totalScore}/100) — 발행 가능하나 홈판 가능성 ${score.homefeedProbability}%` };
  }
  return { approved: false, level: 'red', reason: `${score.verdict} (${score.totalScore}/100) — 발행 금지, 재생성 필수` };
}

/**
 * [v2.3.0] 생성 프롬프트에 주입할 "홈판 집중" 가이드
 *   - 버튼 3개(Thumbstop / Stickiness / Safety) 각각 극한 지시
 *   - 기존 MODE_VOICE_GUIDES.homefeed와 중복 없이 보강
 */
export function buildHomefeedPrecisionPromptBlock(): string {
  return `
═══════════════════════════════════════════════════════════
[HOMEFEED PRECISION MODE] — 홈판 노출 단 하나의 목표
═══════════════════════════════════════════════════════════

이 글의 성공 기준은 **홈판 노출 여부**. 그 외 지표(SEO·판매·공감)는 후순위.

■ AXIS 1 — THUMBSTOP (엄지 멈춤, 최우선)
  제목: 28~35자 / 숫자 1개 / 감정어 1~2개 / AI클리셰 ZERO
  도입부 3문장: 공감·질문·발견 중 1개 훅 필수
  금지어: 충격, 경악, 소름, 폭로, 미쳤어요, 실화, 대박 공개, 알고보니, 진실 공개

■ AXIS 2 — STICKINESS (체류·완독)
  본문 길이: 1800~2400자 (스위트 스팟 엄수, ±200 이내)
  H2 소제목: 4~6개 (7 초과 시 체류 하락)
  이미지: 3장 이상 (소제목 사이 배치)
  문장 리듬: 단문(15자) + 중문(30자) + 장문(45자) 섞기 — 획일 금지
  도입부: 개인 경험 1문장 → 감정 노출 1문장 → 본격 진입

■ AXIS 3 — SAFETY (저품질 회피)
  AI 클리셰 ZERO (한 번이라도 감지 시 홈판 영원 제외)
  광고 키워드: 최대 2회 (구매링크, 할인코드, 최저가, 지금 구매, 이벤트)
  같은 단어: 최대 4회 (5회+ 감지 시 스팸)
  정치·시사·민감주제: 완전 배제
  본문 최소 1500자 (800자 미만은 홈판 구조적 제외)

■ 최종 자가 검토 (본문 완성 후 스스로 점검):
  □ 제목에 AI클리셰 없나?
  □ 도입부 3문장에 훅 있나?
  □ 본문 1800~2400자인가?
  □ H2 4~6개인가?
  □ 이미지 삽입 지시 3장 이상인가?
  □ 정치·시사 주제 없나?

하나라도 "아니오"면 처음부터 재작성.
═══════════════════════════════════════════════════════════
`;
}
