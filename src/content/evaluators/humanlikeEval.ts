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
import { auditAffiliateAuthenticity } from '../affiliateAuthenticity';
import { auditEvidenceIntegrity } from '../evidenceIntegrity';

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
  // [SPEC-HOMEFEED-EMPATHY-2026 R2-2] Observational first-person experience —
  //   honest "I watched/saw it" signals for news/3rd-party topics where the writer
  //   has no hands-on experience (faking "I did it" = fabrication; "I watched it" = true).
  '지켜봤', '지켜보', '실시간으로 봤', '실시간으로 지켜', '중계로', '직관',
  '방송으로 봤', '영상으로 봤', '영상으로 확인', '캡처를 다시', '다시 돌려봤',
  '보는 내내', '장면을 보면서', '소식을 접하', '경기를 보면서', '두 눈으로 봤',
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

const SELF_CORRECTION_SIGNALS = [
  ...SELF_CORRECTION,
  'actually', 'at first', 'but when', 'but once', 'honestly', 'to be fair',
  'the exception', 'compared with', 'that difference', 'first check', 'the safer order',
  '다시 보니', '처음에는', '막상 보니', '따지고 보면', '솔직히 말하면',
];

const INFORMAL_SIGNALS = [
  ...INFORMAL,
  'honestly', 'really', 'a bit', 'kind of', 'tiny', 'worth checking',
  'simple', 'small', 'useful', 'safer', 'clear', 'guessing',
  '그렇더라고요', '하더라고요', '잖아요', '거든요', '느껴졌어요',
];

const CONVERSATIONAL_CRUTCHES = [
  '거든요', '잖아요', '더라고요', '진짜', '완전', '찐으로', 'ㄹㅇ',
  '다들 그러잖아요', '이거 아는 사람', '솔직히 말해서', '와,', '헉',
  '왜 아무도 말 안 해줬죠', '이거 좀', '여기서 봐야 할 건',
  // 헤징 버릇 — 감탄사 남발의 반대편 AI 티. 근거 표현을 매 문장 붙이는 것도 감점.
  '자료를 보면', '자료를 놓고 보면', '확인해보면', '보도 흐름을 보면', '제가 확인한 바로는',
];

const DIRECT_EXPERIENCE_SIGNALS = [
  ...DIRECT_EXPERIENCE,
  'I checked', 'I compared', 'I watched', 'I tried', 'I would', 'I thought',
  'my case', 'before applying', 'save a screenshot', 'looked complete',
  '확인해보니', '비교해보니', '제가 확인', '제가 비교', '사례를 보니',
];

function splitSentences(text: string): string[] {
  return text.split(/[.!?。]\s*/).map(s => s.trim()).filter(s => s.length > 0);
}

function getEnding(sentence: string): string {
  // 마지막 2~4글자를 어미로 간주
  const cleaned = sentence.replace(/[.!?。\s]+$/, '');
  return cleaned.slice(-3);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countMatches(text: string, words: readonly string[]): number {
  let count = 0;
  for (const w of words) {
    const m = text.match(new RegExp(escapeRegex(w), 'gi'));
    if (m) count += m.length;
  }
  return count;
}

function countRepeatedCrutches(text: string): number {
  let repeats = 0;
  for (const word of CONVERSATIONAL_CRUTCHES) {
    const matches = text.match(new RegExp(escapeRegex(word), 'gi'));
    if (matches && matches.length > 2) {
      repeats += matches.length - 2;
    }
  }
  return repeats;
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

  // 3. 전환 표현 절제 (12점)
  // 전환어를 의무화하면 모든 글이 "솔직히/막상/사실은"으로 도배된다.
  const selfCorrCount = countMatches(body, SELF_CORRECTION_SIGNALS);
  let scScore = 0;
  if (selfCorrCount <= 2) scScore = 12;
  else if (selfCorrCount <= 4) scScore = 8;
  else {
    scScore = 3;
    issues.push(`전환 표현 ${selfCorrCount}회 — 자연스러운 흐름보다 AI식 말투 장식에 가까움`);
    suggestions.push('솔직히/막상/사실은 같은 전환어를 지우고 문장 내용 자체로 흐름을 연결');
  }
  details.selfCorrection = scScore;
  total += scScore;

  // 4. 의도적 imperfection — 비공식 어휘 (8점)
  const informalCount = countMatches(body, INFORMAL_SIGNALS);
  const informalPer1000 = (informalCount / Math.max(1, body.length)) * 1000;
  let infScore = 0;
  if (informalPer1000 <= 10) infScore = 8;
  else if (informalPer1000 <= 15) infScore = 5;
  else {
    infScore = 1;
    issues.push('구어체 장식이 과도해 실제 대화보다 연출된 말투로 보임');
    suggestions.push('좀/막/진짜/엄청 같은 장식어를 구체 상황과 판단 이유로 교체');
  }
  details.informalWords = infScore;
  total += infScore;

  // 4.5 과한 입말 장식 감점 — "사람 흉내" 회귀 방지
  const crutchCount = countMatches(body, CONVERSATIONAL_CRUTCHES);
  const repeatedCrutches = countRepeatedCrutches(body);
  const crutchPer1000 = (crutchCount / Math.max(1, body.length)) * 1000;
  let crutchPenalty = 0;
  if (repeatedCrutches >= 4 || (crutchCount >= 8 && crutchPer1000 >= 8)) {
    crutchPenalty = Math.min(12, 4 + repeatedCrutches * 2);
    issues.push(`입말 장식 반복 ${crutchCount}회 — 사람 말투가 아니라 AI식 구어체 흉내로 보일 수 있음`);
    suggestions.push('거든요/잖아요/더라고요/진짜/찐으로 같은 표현은 줄이고, 관찰·근거·판단 문장으로 대체');
  }
  details.conversationalCrutches = crutchCount;
  details.conversationalCrutchPenalty = -crutchPenalty;
  total -= crutchPenalty;

  // 5. AI 보고체 부재 (15점) — v2.10.182 도입부 클리셰 추가
  const aiClicheCount = countMatches(body, AI_CLICHE);
  let aiScore = 15;
  if (aiClicheCount >= 3) {
    aiScore = 0;
    issues.push(`AI 클리셰 ${aiClicheCount}회 출현 — 2026 통합탭 누락 주범 (안녕하세요/오늘은/소개해드리겠습니다 등)`);
    suggestions.push('AI 도입부/진행/결론 클리셰를 삭제하고 독자의 질문이나 구체 상황에서 바로 시작');
  } else if (aiClicheCount === 2) {
    aiScore = 5;
    issues.push(`AI 클리셰 ${aiClicheCount}회 — 2026 통합탭 노출 약화`);
  } else if (aiClicheCount === 1) {
    aiScore = 10;
  }
  details.noAiCliche = aiScore;
  total += aiScore;
  if (aiClicheCount >= 3) {
    const reportPenalty = Math.min(24, 12 + ((aiClicheCount - 3) * 3));
    details.aiReportPenalty = -reportPenalty;
    total -= reportPenalty;
    issues.push('AI 보고체/클리셰가 연속되어 실제 작성자의 판단 흐름이 보이지 않음');
  }

  // 6. 어휘 다양성 (12점)
  if (body.length >= 500) {
    const tokens = body.match(/[\p{L}\p{N}]{2,}/gu) ?? [];
    const uniqueTokens = new Set(tokens).size;
    const ttr = tokens.length > 0 ? uniqueTokens / tokens.length : 0;
    let ttrScore = 0;
    if (ttr >= 0.55) ttrScore = 12;
    else if (ttr >= 0.42) ttrScore = 8;
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

  // 7. 경험/근거 화자 정합성 (15점)
  // 직접 경험은 실제 first-party 근거가 있을 때만 가산한다. 리뷰 종합/스펙 글은
  // 가짜 체험을 만들지 않고 출처에 맞게 설명하는 것이 사람다운 글이다.
  const expCount = countMatches(body, DIRECT_EXPERIENCE_SIGNALS);
  const expPer1000 = (expCount / Math.max(1, body.length)) * 1000;
  let expScore = 0;
  const affiliateEvidenceMode = input.affiliateEvidenceMode;
  if (input.mode === 'affiliate' && affiliateEvidenceMode && affiliateEvidenceMode !== 'first_party') {
    const authenticity = auditAffiliateAuthenticity({
      title: input.title,
      body,
      evidenceMode: affiliateEvidenceMode,
    });
    const fabricated = authenticity.issues.some(issue => issue.code === 'FABRICATED_FIRST_PERSON');
    if (fabricated) {
      expScore = 0;
      issues.push('실사용 근거 없는 1인칭 체험 표현 — 자연스러움이 아니라 신뢰 훼손 신호');
      suggestions.push('리뷰 종합형은 구매자 의견으로 귀속하고, 스펙형은 확인된 조건과 판단 기준으로 서술');
    } else {
      expScore = 15;
    }
  } else if (input.mode !== 'affiliate' && input.firstPartyEvidenceAvailable !== true) {
    const evidence = auditEvidenceIntegrity({
      title: input.title,
      body,
      groundingText: input.groundingText || input.rawText || '',
      firstPartyEvidenceAvailable: false,
    });
    const fabricated = evidence.issues.some((issue) => issue.code === 'UNSUPPORTED_FIRST_PERSON');
    if (fabricated) {
      expScore = 0;
      issues.push('사용자 경험 근거 없는 1인칭 체험은 사람다움이 아니라 신뢰 훼손 신호');
      suggestions.push('독자 상황, 확인된 사실, 판단 이유로 바꾸고 작성자 체험처럼 말하지 않기');
    } else {
      expScore = 15;
    }
  } else if (expCount > 0) {
    expScore = 15;
  } else {
    expScore = 10;
    suggestions.push('사용자 제공 경험이 있다면 입력에 적힌 장면·관찰·한계 중 한두 곳만 구체적으로 반영');
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
