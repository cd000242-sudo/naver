/**
 * 홈판 평가기.
 * 감정어·1인칭·숫자의 개수를 세는 대신 첫 화면의 관련성, 저장 가치,
 * 모바일 호흡, 근거에 맞는 화자를 평가한다.
 */

import type { SubScore, EvaluationInput } from '../qualityEvaluator';
import { evaluateOfficialExposure } from '../officialExposureRubric';
import { auditEvidenceIntegrity } from '../evidenceIntegrity';

const CLICKBAIT = /충격|경악|소름|대박|레전드|폭로|진실\s*공개|알고보니|난리|실화|100%|무조건/gi;
const VALUE_CUES = /확인|기준|순서|차이|이유|체크|주의|비교|방법|줄일|피할|고르는|판단|check|criterion|order|difference|reason|caution|compare|method|avoid|decision|useful clue|next action/i;
const SITUATION_CUES = /처음|먼저|버튼|신청|고민|헷갈|불편|놓치|다시|막히|필요|찾을|때|하면|first|before|form|application|delay|mistake|miss|need|when|again|blocking/i;
const EMOTION_CUES = /걱정|답답|당황|헷갈|다행|아쉽|불편|편하|놀라|기쁘|속상|부담|frustrating|worried|confused|relieved|uncomfortable/gi;

function titleLengthFits(title: string): boolean {
  if (/[가-힣]/.test(title)) return title.length >= 20 && title.length <= 42;
  const wordCount = title.trim().split(/\s+/).filter(Boolean).length;
  return title.length >= 20 && title.length <= 90 && wordCount >= 4 && wordCount <= 16;
}

function splitSentences(text: string): string[] {
  return text.split(/[.!?。\n]+/).map((part) => part.trim()).filter(Boolean);
}

function keywordCount(text: string, keyword?: string): number {
  const value = String(keyword || '').trim();
  if (!value) return 0;
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.match(new RegExp(escaped, 'gi'))?.length || 0;
}

export function evaluateHomefeed(input: EvaluationInput): SubScore {
  const body = input.body || '';
  const title = input.title || '';
  const intro = body.slice(0, 260);
  const sentences = splitSentences(body);
  const paragraphs = body.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const details: Record<string, number> = {};
  const issues: string[] = [];
  const suggestions: string[] = [];
  let total = 0;

  // 1. 제목: 자극어가 아니라 주제 + 읽을 이유가 보이는가 (18)
  const titleClickbaitCount = title.match(CLICKBAIT)?.length || 0;
  const titleHasTopic = input.primaryKeyword
    ? title.toLowerCase().includes(input.primaryKeyword.toLowerCase())
    : title.length >= 12;
  const titleHasValue = VALUE_CUES.test(title) || /[?]/.test(title);
  const titleLengthFit = titleLengthFits(title);
  let titleScore = (titleHasTopic ? 7 : 2) + (titleHasValue ? 6 : 2) + (titleLengthFit ? 5 : 2);
  if (titleClickbaitCount > 0) {
    titleScore = Math.min(3, titleScore);
    issues.push(`제목의 과장·클릭베이트 표현 ${titleClickbaitCount}회`);
    suggestions.push('충격/대박/비밀 대신 독자가 얻을 기준·차이·주의점을 제목에 명시');
  }
  details.titleHook = titleScore;
  total += titleScore;

  // 2. 첫 화면: 독자 상황과 얻을 정보가 함께 보이는가 (18)
  const introHasTopic = input.primaryKeyword
    ? intro.toLowerCase().includes(input.primaryKeyword.toLowerCase())
    : intro.length >= 45;
  const introHasSituation = SITUATION_CUES.test(intro);
  const introHasValue = VALUE_CUES.test(intro);
  const introScore = (introHasTopic ? 6 : 2) + (introHasSituation ? 6 : 2) + (introHasValue ? 6 : 2);
  details.introStrength = introScore;
  total += introScore;
  if (introScore < 14) {
    issues.push('첫 화면에서 독자 상황과 읽을 이유가 함께 드러나지 않음');
    suggestions.push('인사말 없이 독자가 겪는 구체 상황과 이 글에서 얻을 판단 기준을 첫 2~3문장에 배치');
  }

  // 3. 문장 길이 변화 (12)
  let burstScore = 6;
  if (sentences.length >= 5) {
    const lengths = sentences.map((sentence) => sentence.length);
    const average = lengths.reduce((sum, length) => sum + length, 0) / lengths.length;
    const variance = lengths.reduce((sum, length) => sum + ((length - average) ** 2), 0) / lengths.length;
    const stdDev = Math.sqrt(variance);
    burstScore = stdDev >= 8 && stdDev <= 38 ? 12 : stdDev >= 5 ? 8 : 4;
    details.burstinessStdDev = Math.round(stdDev * 10) / 10;
    if (burstScore <= 4) issues.push('문장 길이가 지나치게 균일해 자동 생성 문장처럼 보임');
  }
  details.burstiness = burstScore;
  total += burstScore;

  // 4. 모바일 문단 호흡 (12)
  const averageSentences = paragraphs.length > 0
    ? paragraphs.reduce((sum, paragraph) => sum + splitSentences(paragraph).length, 0) / paragraphs.length
    : 0;
  const paragraphScore = averageSentences >= 1 && averageSentences <= 4 ? 12 : averageSentences <= 6 ? 8 : 3;
  details.paragraphLength = paragraphScore;
  total += paragraphScore;
  if (paragraphScore <= 3) issues.push('문단이 길어 모바일에서 한 판단씩 읽기 어려움');

  // 5. 감정어 절제 (10). 감정어가 없어도 감점하지 않고, 남발만 강하게 감점한다.
  const emotionCount = body.match(EMOTION_CUES)?.length || 0;
  const emotionPer1000 = (emotionCount / Math.max(1, body.length)) * 1000;
  const emotionScore = emotionPer1000 <= 5 ? 10 : emotionPer1000 <= 9 ? 6 : 1;
  details.emotionDensity = emotionScore;
  total += emotionScore;
  if (emotionScore <= 1) {
    issues.push('감정어가 과도해 정보보다 반응을 연출하는 글로 보임');
    suggestions.push('감정 단어를 줄이고 어떤 조건에서 왜 그렇게 판단하는지 설명');
  }

  // 6. 화자 근거 정합성 (15)
  const evidence = auditEvidenceIntegrity({
    title,
    body,
    groundingText: input.groundingText || input.rawText || '',
    firstPartyEvidenceAvailable: input.firstPartyEvidenceAvailable === true,
  });
  const firstPersonIssue = evidence.issues.some((issue) => issue.code === 'UNSUPPORTED_FIRST_PERSON');
  const concreteIssue = evidence.issues.some((issue) => issue.code === 'UNSUPPORTED_CONCRETE_CLAIM');
  const evidenceScore = firstPersonIssue ? 0 : concreteIssue ? 5 : 15;
  details.firstPerson = evidenceScore;
  details.evidenceIntegrity = evidence.score;
  total += evidenceScore;
  if (firstPersonIssue) issues.push('작성자 경험 근거 없는 1인칭 체험이 포함됨');
  if (concreteIssue) issues.push('입력 자료에 없는 수치·기간·금액이 포함됨');

  // 7. 모바일에서 짧게 끊기는 문장 비율 (10)
  const shortRatio = sentences.length > 0
    ? sentences.filter((sentence) => sentence.length <= 38).length / sentences.length
    : 0;
  const shortScore = shortRatio >= 0.3 && shortRatio <= 0.85 ? 10 : shortRatio >= 0.2 ? 7 : 3;
  details.shortSentenceRatio = shortScore;
  total += shortScore;

  // 8. 저장 가치 (5): 목록·표·명확한 판단 기준 중 하나면 충분하다.
  const hasStructuredValue = /^\s*(?:[-*]|\d+[.)])\s+/m.test(body) || /\|.+\|/.test(body) || VALUE_CUES.test(body);
  details.utility = hasStructuredValue ? 5 : 1;
  total += details.utility;
  if (!hasStructuredValue) suggestions.push('독자가 다시 볼 수 있는 기준·주의점·짧은 체크리스트 중 하나 추가');

  const legacyScore = Math.round(Math.max(0, Math.min(100, total)));
  const officialExposure = evaluateOfficialExposure(input);
  const officialDetails = Object.fromEntries(
    Object.entries(officialExposure.details).map(([key, value]) => [`official_${key}`, value]),
  );
  const blendedScore = Math.round((legacyScore * 0.7) + (officialExposure.score * 0.3));

  return {
    score: Math.max(0, Math.min(100, blendedScore)),
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
