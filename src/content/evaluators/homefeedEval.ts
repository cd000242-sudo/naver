/**
 * 홈피드 모드 평가기 — 끝판왕 Phase 1 (v2.10.177)
 *
 * 평가 항목 (가중치 합 100):
 *   1. 제목 후킹 강도 (감정/숫자/호기심) (20점)
 *   2. 첫 200자 강도 (1인칭/감정 시작) (20점)
 *   3. 문장 길이 분산 burstiness (15점)
 *   4. 짧은 문단 (3~5문장) (10점)
 *   5. 감정 단어 빈도 (15점)
 *   6. 페르소나 일관성 (1인칭/체험담 톤) (10점)
 *   7. 짧은 문장 비율 (모바일 가독성) (10점)
 *
 * 진단: 네이버 홈피드는 클릭률·체류시간·완독률이 핵심. 짧고 감정적인 글이 우위.
 */

import type { SubScore, EvaluationInput } from '../qualityEvaluator';
import { evaluateOfficialExposure } from '../officialExposureRubric';

const HOOK_WORDS = ['솔직히', '진짜', '놀라', '대박', '꿀팁', '비밀', '충격', '의외로', '막상', '몰랐', '알고보니', '진심', '레전드'];
const EMOTION_WORDS = ['좋아', '싫어', '신기', '재밌', '슬프', '기뻐', '놀라', '아쉽', '실망', '만족', '편하', '불편', '행복', '뿌듯', '뜨끔', '두근', '설레', '울컥', '찡', '뿌듯'];
const FIRST_PERSON = ['저는', '제가', '내가', '나는', '저도', '나도', '우리'];

const HOOK_SIGNALS = [
  ...HOOK_WORDS,
  'honestly', 'really', 'surprising', 'missed', 'small mistake', 'directly',
  '처음엔', '놓치면', '반전', '헷갈', '직접', '궁금',
];

const EMOTION_SIGNALS = [
  ...EMOTION_WORDS,
  'frustrating', 'different', 'miss', 'worry', 'confusing', 'relief', 'useful', 'felt', 'delayed',
  '답답', '걱정', '당황', '헷갈', '다행', '편했', '느꼈',
];

const FIRST_PERSON_SIGNALS = [
  ...FIRST_PERSON,
  'I ', 'my ', 'me ', 'we ', 'I checked', 'I compared', 'I would', 'I thought',
  '저도', '제 경우', '제가 보니', '제가 확인',
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countMatches(text: string, words: readonly string[]): number {
  let count = 0;
  for (const word of words) {
    const matches = text.match(new RegExp(escapeRegex(word), 'gi'));
    if (matches) count += matches.length;
  }
  return count;
}

function splitSentences(text: string): string[] {
  return text.split(/[.!?。\n]+/).map(s => s.trim()).filter(s => s.length > 0);
}

export function evaluateHomefeed(input: EvaluationInput): SubScore {
  const body = input.body || '';
  const title = input.title || '';

  const details: Record<string, number> = {};
  const issues: string[] = [];
  const suggestions: string[] = [];
  let total = 0;

  // 1. 제목 후킹 강도 (20점)
  let titleScore = 0;
  if (title) {
    const hasHook = HOOK_SIGNALS.some(w => title.toLowerCase().includes(w.toLowerCase()));
    const hasNum = /\d/.test(title);
    const hasQ = /[?!]/.test(title);
    const hasEmotion = EMOTION_SIGNALS.some(w => title.toLowerCase().includes(w.toLowerCase()));
    let bonusCount = 0;
    if (hasHook) bonusCount++;
    if (hasNum) bonusCount++;
    if (hasQ) bonusCount++;
    if (hasEmotion) bonusCount++;
    if (bonusCount >= 3) titleScore = 20;
    else if (bonusCount === 2) titleScore = 15;
    else if (bonusCount === 1) titleScore = 8;
    else {
      titleScore = 3;
      issues.push('제목 후킹 약함 — 감정/숫자/호기심/물음표 중 2가지 이상 권장');
      suggestions.push('제목에 "솔직히/진짜/놀라" + 숫자 또는 물음표 추가');
    }
  } else {
    titleScore = 10;
  }
  details.titleHook = titleScore;
  total += titleScore;

  // 2. 첫 200자 강도 (20점)
  const intro = body.slice(0, 200);
  let introScore = 0;
  const hasFirstPerson = FIRST_PERSON_SIGNALS.some(w => intro.toLowerCase().includes(w.toLowerCase()));
  const hasIntroEmotion = EMOTION_SIGNALS.some(w => intro.toLowerCase().includes(w.toLowerCase()))
    || HOOK_SIGNALS.some(w => intro.toLowerCase().includes(w.toLowerCase()));
  if (hasFirstPerson && hasIntroEmotion) introScore = 20;
  else if (hasFirstPerson || hasIntroEmotion) introScore = 12;
  else {
    introScore = 4;
    issues.push('첫 200자 도입부 — 1인칭(저/나) 또는 감정 표현 부재');
    suggestions.push('첫 문장: "저도 처음엔..." "솔직히 의심했어요" 같은 1인칭 + 감정 시작');
  }
  details.introStrength = introScore;
  total += introScore;

  // 3. 문장 길이 분산 (burstiness) (15점)
  const sentences = splitSentences(body);
  if (sentences.length >= 5) {
    const lengths = sentences.map(s => s.length);
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((acc, l) => acc + Math.pow(l - avg, 2), 0) / lengths.length;
    const stdDev = Math.sqrt(variance);
    let burstScore = 0;
    if (stdDev >= 15 && stdDev <= 35) burstScore = 15;
    else if (stdDev >= 10 && stdDev < 15) burstScore = 10;
    else if (stdDev > 35) burstScore = 10;
    else {
      burstScore = 4;
      issues.push(`문장 길이 분산 ${stdDev.toFixed(1)} — 너무 균일 (AI 흔적)`);
      suggestions.push('짧은 문장(5~15자)과 긴 문장(30~60자) 섞어 자연스러운 흐름 만들기');
    }
    details.burstiness = burstScore;
    details.burstinessStdDev = Math.round(stdDev * 10) / 10;
    total += burstScore;
  } else {
    details.burstiness = 5;
    total += 5;
  }

  // 4. 짧은 문단 (3~5문장) (10점)
  const paragraphs = body.split(/\n\n+/).filter(p => p.trim().length > 0);
  if (paragraphs.length > 0) {
    const avgSentencePerPara = paragraphs.reduce((acc, p) => acc + splitSentences(p).length, 0) / paragraphs.length;
    let paraScore = 0;
    if (avgSentencePerPara >= 2 && avgSentencePerPara <= 5) paraScore = 10;
    else if (avgSentencePerPara > 5 && avgSentencePerPara <= 7) paraScore = 6;
    else {
      paraScore = 3;
      issues.push(`문단당 평균 ${avgSentencePerPara.toFixed(1)}문장 — 모바일 가독성 약함 (권장 3~5)`);
    }
    details.paragraphLength = paraScore;
    total += paraScore;
  } else {
    details.paragraphLength = 5;
    total += 5;
  }

  // 5. 감정 단어 빈도 (15점)
  const emotionCount = countMatches(body, EMOTION_SIGNALS);
  const emotionPer1000 = (emotionCount / Math.max(1, body.length)) * 1000;
  let emoScore = 0;
  if (emotionPer1000 >= 3 && emotionPer1000 <= 10) emoScore = 15;
  else if (emotionPer1000 >= 1.5) emoScore = 10;
  else if (emotionPer1000 >= 0.8) {
    // Natural copy with restrained emotion — credit it instead of the harsh 4-point cliff.
    // Forcing emotion words mechanically reads as AI; reward genuine-but-moderate tone.
    emoScore = 7;
  } else {
    emoScore = 4;
    issues.push(`감정 단어 빈도 낮음 (1000자당 ${emotionPer1000.toFixed(1)}회) — 홈피드 톤과 어긋남`);
    suggestions.push('감정 표현 ("좋아/신기/놀라/뿌듯") 자연스럽게 분산 배치');
  }
  details.emotionDensity = emoScore;
  total += emoScore;

  // 6. 페르소나 일관성 (10점)
  const fpCount = countMatches(body, FIRST_PERSON_SIGNALS);
  const fpPer1000 = (fpCount / Math.max(1, body.length)) * 1000;
  let fpScore = 0;
  if (fpPer1000 >= 2) fpScore = 10;
  else if (fpPer1000 >= 1) fpScore = 6;
  else {
    fpScore = 2;
    issues.push('1인칭 표현 부족 — 체험담 톤 약함');
    suggestions.push('"저는/제가/나는" 자연스럽게 본문에 등장');
  }
  details.firstPerson = fpScore;
  total += fpScore;

  // 7. 짧은 문장 비율 (모바일) (10점)
  if (sentences.length > 0) {
    const shortCount = sentences.filter(s => s.length <= 30).length;
    const shortRatio = shortCount / sentences.length;
    let shortScore = 0;
    if (shortRatio >= 0.3 && shortRatio <= 0.6) shortScore = 10;
    else if (shortRatio >= 0.2) shortScore = 6;
    else if (shortRatio >= 0.15) shortScore = 6;
    else {
      shortScore = 3;
      issues.push(`30자 이하 짧은 문장 비율 ${(shortRatio * 100).toFixed(0)}% — 너무 낮음 (모바일 가독성 약화)`);
    }
    details.shortSentenceRatio = shortScore;
    total += shortScore;
  } else {
    total += 5;
  }

  const legacyScore = Math.round(Math.max(0, Math.min(100, total)));
  const officialExposure = evaluateOfficialExposure(input);
  const officialDetails = Object.fromEntries(
    Object.entries(officialExposure.details).map(([key, value]) => [`official_${key}`, value]),
  );
  const blendedScore = Math.round((legacyScore * 0.85) + (officialExposure.score * 0.15));

  return {
    score: Math.round(Math.max(0, Math.min(100, blendedScore))),
    details: {
      ...details,
      legacyHomefeedScore: legacyScore,
      officialExposureScore: officialExposure.score,
      ...officialDetails,
    },
    issues: [...issues, ...officialExposure.issues],
    suggestions: [...suggestions, ...officialExposure.suggestions],
  };
}
