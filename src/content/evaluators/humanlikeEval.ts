/**
 * 사람다움 평가기 — 끝판왕 Phase 1 (v2.10.177)
 *
 * reviewer 진단 HIGH #10: 기존 사람다움 검증은 negative-only (forbidden 차단만).
 *   본 모듈이 positive signal로 측정 — burstiness, 어미 변주, 자기 정정, 감정 진폭.
 *
 * 평가 항목 (가중치 합 100):
 *   1. Burstiness — 문장 길이 표준편차 (25점)
 *   2. 어미 변주 — 연속 동일 어미 감점 (20점)
 *   3. 자기 정정 마커 — "아 근데/사실은/막상" (15점)
 *   4. 의도적 imperfection — "좀/막/되게" 비공식 어휘 (10점)
 *   5. AI 보고체 부재 (15점)
 *   6. 어휘 다양성 (15점)
 */

import type { SubScore, EvaluationInput } from '../qualityEvaluator';

const SELF_CORRECTION = ['아 근데', '사실은', '근데 다시', '솔직히', '막상', '의외로', '처음엔', '그런데 보니', '알고보니', '생각해보니'];
const INFORMAL = ['좀', '막', '되게', '엄청', '정말', '진짜', '완전', '대박', '제일', '꽤'];
const AI_CLICHE = ['알아보겠습니다', '살펴보겠습니다', '시작하겠습니다', '마치겠습니다', '도움이 되셨', '아래와 같이', '다음과 같이', '결론적으로 말하자면', '많은 분들이'];

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

  // 1. Burstiness (25점)
  if (sentences.length >= 5) {
    const lengths = sentences.map(s => s.length);
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((acc, l) => acc + Math.pow(l - avg, 2), 0) / lengths.length;
    const stdDev = Math.sqrt(variance);
    let burstScore = 0;
    if (stdDev >= 15 && stdDev <= 35) burstScore = 25;
    else if (stdDev >= 10 && stdDev < 15) burstScore = 18;
    else if (stdDev > 35) burstScore = 18;
    else {
      burstScore = 6;
      issues.push(`문장 길이 분산 ${stdDev.toFixed(1)} — 너무 균일 (AI 흔적)`);
      suggestions.push('짧은 문장(5~15자)과 긴 문장(30~60자) 의도적으로 혼합');
    }
    details.burstiness = burstScore;
    details.burstinessStdDev = Math.round(stdDev * 10) / 10;
    total += burstScore;
  } else {
    details.burstiness = 12;
    total += 12;
  }

  // 2. 어미 변주 (20점) — 연속 2회+ 동일 어미 감점
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
    // 고유 어미 비율
    const uniqueEndings = new Set(endings).size;
    const diversityRatio = uniqueEndings / endings.length;
    let endingScore = 0;
    if (diversityRatio >= 0.6 && maxConsecutive <= 2) endingScore = 20;
    else if (diversityRatio >= 0.4) endingScore = 13;
    else {
      endingScore = 5;
      issues.push(`어미 다양성 ${(diversityRatio * 100).toFixed(0)}% — AI 같은 균일성 (연속 ${maxConsecutive}회)`);
      suggestions.push('"~요/~네요/~답니다/~거든요/~죠/~잖아요" 같은 다양한 어미 혼합');
    }
    details.endingDiversity = endingScore;
    total += endingScore;
  } else {
    details.endingDiversity = 10;
    total += 10;
  }

  // 3. 자기 정정 마커 (15점)
  const selfCorrCount = countMatches(body, SELF_CORRECTION);
  let scScore = 0;
  if (selfCorrCount >= 3) scScore = 15;
  else if (selfCorrCount >= 1) scScore = 10;
  else {
    scScore = 3;
    issues.push('자기 정정/전환 마커 부재 — 사람 글의 자연스러운 흐름 부족');
    suggestions.push('"아 근데", "사실은", "막상", "처음엔" 같은 전환 표현 2~3회 배치');
  }
  details.selfCorrection = scScore;
  total += scScore;

  // 4. 의도적 imperfection — 비공식 어휘 (10점)
  const informalCount = countMatches(body, INFORMAL);
  const informalPer1000 = (informalCount / Math.max(1, body.length)) * 1000;
  let infScore = 0;
  if (informalPer1000 >= 2 && informalPer1000 <= 10) infScore = 10;
  else if (informalPer1000 >= 1) infScore = 6;
  else {
    infScore = 2;
    issues.push('비공식 어휘 부족 — 문어체 강함 (AI 보고체 의심)');
    suggestions.push('"좀/막/되게/엄청" 같은 구어체 어휘 자연스럽게 분산');
  }
  details.informalWords = infScore;
  total += infScore;

  // 5. AI 보고체 부재 (15점)
  const aiClicheCount = countMatches(body, AI_CLICHE);
  let aiScore = 15;
  if (aiClicheCount >= 3) {
    aiScore = 0;
    issues.push(`AI 보고체 ${aiClicheCount}회 출현 — "알아보겠습니다/살펴보겠습니다" 등`);
    suggestions.push('AI 보고체 *전부 삭제* — 본인이 직접 보고 느낀 톤으로 교체');
  } else if (aiClicheCount === 2) {
    aiScore = 5;
    issues.push(`AI 보고체 ${aiClicheCount}회 — 사람다움 약화`);
  } else if (aiClicheCount === 1) {
    aiScore = 10;
  }
  details.noAiCliche = aiScore;
  total += aiScore;

  // 6. 어휘 다양성 (15점) — type-token ratio
  if (body.length >= 500) {
    const tokens = body.match(/[가-힣]{2,}/g) ?? [];
    const uniqueTokens = new Set(tokens).size;
    const ttr = tokens.length > 0 ? uniqueTokens / tokens.length : 0;
    let ttrScore = 0;
    if (ttr >= 0.55) ttrScore = 15;
    else if (ttr >= 0.45) ttrScore = 10;
    else {
      ttrScore = 4;
      issues.push(`어휘 다양성 ${(ttr * 100).toFixed(0)}% — 반복적 (사람 글은 보통 50%+)`);
      suggestions.push('동의어/유사어로 어휘 변주 (반복 단어 1개 → 2~3개 변형)');
    }
    details.lexicalDiversity = ttrScore;
    details.ttr = Math.round(ttr * 100) / 100;
    total += ttrScore;
  } else {
    details.lexicalDiversity = 8;
    total += 8;
  }

  return {
    score: Math.round(Math.max(0, Math.min(100, total))),
    details,
    issues,
    suggestions,
  };
}
