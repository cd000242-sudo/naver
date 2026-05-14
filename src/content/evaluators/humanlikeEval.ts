/**
 * 사람다움 평가기 — 끝판왕 Phase 1 (v2.10.177) + Phase 2.5 (v2.10.182)
 *
 * reviewer 진단 HIGH #10: 기존 사람다움 검증은 negative-only (forbidden 차단만).
 *   본 모듈이 positive signal로 측정 — burstiness, 어미 변주, 자기 정정, 감정 진폭.
 *
 * v2.10.182 — 2026 네이버 알고리즘 대응:
 *   - AI 도입부 클리셰 차단 강화 ("안녕하세요/오늘은/소개해드리겠습니다")
 *   - 직접 경험 신호 가산점 ("직접 가봤/실제로 써본/제가 찍은")
 *
 * 평가 항목 (가중치 합 100):
 *   1. Burstiness (20점)
 *   2. 어미 변주 (18점)
 *   3. 자기 정정 마커 (12점)
 *   4. 의도적 imperfection (8점)
 *   5. AI 보고체 부재 (15점)
 *   6. 어휘 다양성 (12점)
 *   7. 직접 경험 신호 (15점) — v2.10.182 신규
 */

import type { SubScore, EvaluationInput } from '../qualityEvaluator';

const SELF_CORRECTION = ['아 근데', '사실은', '근데 다시', '솔직히', '막상', '의외로', '처음엔', '그런데 보니', '알고보니', '생각해보니'];
const INFORMAL = ['좀', '막', '되게', '엄청', '정말', '진짜', '완전', '대박', '제일', '꽤'];
// ✅ [v2.10.182 Phase 2.5.2] 2026 네이버 통합탭 누락 회피 — AI 도입부 클리셰 차단 강화
//   네이버 2026: "AI가 쓴 듯한 무색무취한 글"이 통합탭에서 누락됨
//   AI 도입부 클리셰 + AI 진행 안내 + AI 결론 클리셰를 모두 차단
// ✅ [v2.10.182] 직접 경험 표현 — 2026 네이버 E-E-A-T 핵심 신호
//   "직접 가봤다 / 실제로 써본 / 제가 찍은 사진" 같은 *경험 증거*
const DIRECT_EXPERIENCE = [
  '직접', '실제로', '제가 가', '제가 써', '제가 해', '제가 먹', '제가 본',
  '찍은 사진', '찍어 본', '찍어본', '직접 찍', '제가 찍',
  '가봤', '먹어봤', '써봤', '해봤', '시도해', '체험',
  '실측', '실사용', '실제 사용', '실제 경험', '경험상',
  '눈으로 확인', '손으로 만져', '몸소', '온몸으로',
];

const AI_CLICHE = [
  // 기존: 진행 안내 + 결론
  '알아보겠습니다', '살펴보겠습니다', '시작하겠습니다', '마치겠습니다', '도움이 되셨',
  '아래와 같이', '다음과 같이', '결론적으로 말하자면', '많은 분들이',
  // 신규: 도입부 클리셰 (2026 네이버 통합탭 누락 주범)
  '안녕하세요', '오늘은', '이번 글에서는', '이 글에서는', '이번 포스팅에서는',
  '소개해드리겠습니다', '소개해 드리겠습니다', '안내해드리겠습니다', '안내해 드리겠습니다',
  '말씀드리고자', '말씀드리겠습니다', '여러분 안녕', '안녕 여러분',
  // 신규: AI 자극 어휘 (저품질 트리거)
  '경악', '소름', '충격', '폭로', '실화',
];

function splitSentences(text: string): string[] {
  return text.split(/[.!?。]\s*/).map(s => s.trim()).filter(s => s.length > 0);
}

function getEnding(sentence: string): string {
  // 마지막 2~4글자를 어미로 간주
  const cleaned = sentence.replace(/[.!?。\s]+$/, '');
  return cleaned.slice(-3);
}

function countMatches(text: string, words: readonly string[]): number {
  let count = 0;
  for (const w of words) {
    const m = text.match(new RegExp(w, 'g'));
    if (m) count += m.length;
  }
  return count;
}

export function evaluateHumanlike(input: EvaluationInput): SubScore {
  const body = input.body || '';
  const details: Record<string, number> = {};
  const issues: string[] = [];
  const suggestions: string[] = [];
  let total = 0;

  const sentences = splitSentences(body);

  // 1. Burstiness (20점)
  if (sentences.length >= 5) {
    const lengths = sentences.map(s => s.length);
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((acc, l) => acc + Math.pow(l - avg, 2), 0) / lengths.length;
    const stdDev = Math.sqrt(variance);
    let burstScore = 0;
    if (stdDev >= 15 && stdDev <= 35) burstScore = 20;
    else if (stdDev >= 10 && stdDev < 15) burstScore = 14;
    else if (stdDev > 35) burstScore = 14;
    else {
      burstScore = 5;
      issues.push(`문장 길이 분산 ${stdDev.toFixed(1)} — 너무 균일 (AI 흔적)`);
      suggestions.push('짧은 문장(5~15자)과 긴 문장(30~60자) 의도적으로 혼합');
    }
    details.burstiness = burstScore;
    details.burstinessStdDev = Math.round(stdDev * 10) / 10;
    total += burstScore;
  } else {
    details.burstiness = 10;
    total += 10;
  }

  // 2. 어미 변주 (18점)
  if (sentences.length >= 5) {
    const endings = sentences.map(getEnding);
    let consecutive = 0;
    let maxConsecutive = 0;
    let prev = '';
    for (const e of endings) {
      if (e === prev) {
        consecutive++;
        maxConsecutive = Math.max(maxConsecutive, consecutive);
      } else {
        consecutive = 1;
      }
      prev = e;
    }
    const uniqueEndings = new Set(endings).size;
    const diversityRatio = uniqueEndings / endings.length;
    let endingScore = 0;
    if (diversityRatio >= 0.6 && maxConsecutive <= 2) endingScore = 18;
    else if (diversityRatio >= 0.4) endingScore = 12;
    else {
      endingScore = 4;
      issues.push(`어미 다양성 ${(diversityRatio * 100).toFixed(0)}% — AI 같은 균일성 (연속 ${maxConsecutive}회)`);
      suggestions.push('"~요/~네요/~답니다/~거든요/~죠/~잖아요" 같은 다양한 어미 혼합');
    }
    details.endingDiversity = endingScore;
    total += endingScore;
  } else {
    details.endingDiversity = 9;
    total += 9;
  }

  // 3. 자기 정정 마커 (12점)
  const selfCorrCount = countMatches(body, SELF_CORRECTION);
  let scScore = 0;
  if (selfCorrCount >= 3) scScore = 12;
  else if (selfCorrCount >= 1) scScore = 8;
  else {
    scScore = 2;
    issues.push('자기 정정/전환 마커 부재 — 사람 글의 자연스러운 흐름 부족');
    suggestions.push('"아 근데", "사실은", "막상", "처음엔" 같은 전환 표현 2~3회 배치');
  }
  details.selfCorrection = scScore;
  total += scScore;

  // 4. 의도적 imperfection — 비공식 어휘 (8점)
  const informalCount = countMatches(body, INFORMAL);
  const informalPer1000 = (informalCount / Math.max(1, body.length)) * 1000;
  let infScore = 0;
  if (informalPer1000 >= 2 && informalPer1000 <= 10) infScore = 8;
  else if (informalPer1000 >= 1) infScore = 5;
  else {
    infScore = 1;
    issues.push('비공식 어휘 부족 — 문어체 강함 (AI 보고체 의심)');
    suggestions.push('"좀/막/되게/엄청" 같은 구어체 어휘 자연스럽게 분산');
  }
  details.informalWords = infScore;
  total += infScore;

  // 5. AI 보고체 부재 (15점) — v2.10.182 도입부 클리셰 추가
  const aiClicheCount = countMatches(body, AI_CLICHE);
  let aiScore = 15;
  if (aiClicheCount >= 3) {
    aiScore = 0;
    issues.push(`AI 클리셰 ${aiClicheCount}회 출현 — 2026 통합탭 누락 주범 (안녕하세요/오늘은/소개해드리겠습니다 등)`);
    suggestions.push('AI 도입부/진행/결론 클리셰 *전부 삭제* — 1인칭 경험으로 시작');
  } else if (aiClicheCount === 2) {
    aiScore = 5;
    issues.push(`AI 클리셰 ${aiClicheCount}회 — 2026 통합탭 노출 약화`);
  } else if (aiClicheCount === 1) {
    aiScore = 10;
  }
  details.noAiCliche = aiScore;
  total += aiScore;

  // 6. 어휘 다양성 (12점)
  if (body.length >= 500) {
    const tokens = body.match(/[가-힣]{2,}/g) ?? [];
    const uniqueTokens = new Set(tokens).size;
    const ttr = tokens.length > 0 ? uniqueTokens / tokens.length : 0;
    let ttrScore = 0;
    if (ttr >= 0.55) ttrScore = 12;
    else if (ttr >= 0.45) ttrScore = 8;
    else {
      ttrScore = 3;
      issues.push(`어휘 다양성 ${(ttr * 100).toFixed(0)}% — 반복적 (사람 글은 보통 50%+)`);
      suggestions.push('동의어/유사어로 어휘 변주 (반복 단어 1개 → 2~3개 변형)');
    }
    details.lexicalDiversity = ttrScore;
    details.ttr = Math.round(ttr * 100) / 100;
    total += ttrScore;
  } else {
    details.lexicalDiversity = 7;
    total += 7;
  }

  // 7. 직접 경험 신호 (15점) — v2.10.182 신규
  //   2026 네이버 E-E-A-T 핵심: "직접 가봤/실제 써본/제가 찍은" 등 *경험 증거*
  //   네이버 통합탭은 *AI가 쓴 듯한* 글을 누락 → 직접 경험 표현이 노출의 최대 신호
  const expCount = countMatches(body, DIRECT_EXPERIENCE);
  const expPer1000 = (expCount / Math.max(1, body.length)) * 1000;
  let expScore = 0;
  if (expPer1000 >= 3) expScore = 15;
  else if (expPer1000 >= 1.5) expScore = 10;
  else if (expPer1000 >= 0.5) expScore = 5;
  else {
    expScore = 1;
    issues.push('직접 경험 표현 부재 — 2026 네이버 E-E-A-T 최대 신호 부족');
    suggestions.push('"직접 가봤어요", "제가 써본 결과", "찍은 사진 보면" 같은 *경험 증거* 2~3회 배치');
  }
  details.directExperience = expScore;
  details.experienceDensityPer1000 = Math.round(expPer1000 * 10) / 10;
  total += expScore;

  return {
    score: Math.round(Math.max(0, Math.min(100, total))),
    details,
    issues,
    suggestions,
  };
}
