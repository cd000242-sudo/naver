/**
 * SEO 평가기.
 * 키워드 밀도와 숫자 개수가 아니라 검색 의도 충족, 근거 정합성,
 * 주제 범위, 읽기 쉬운 구조를 평가한다.
 */

import type { SubScore, EvaluationInput } from '../qualityEvaluator';
import { evaluateOfficialExposure } from '../officialExposureRubric';
import { auditEvidenceIntegrity, collectUnsupportedConcreteClaims } from '../evidenceIntegrity';

const ANSWER_CUES = /핵심|먼저|기준|조건|순서|방법|차이|이유|확인|주의|가능|필요|해당|결론|key answer|short answer|first check|criterion|condition|order|method|difference|reason|caution|conclusion/i;
const CAUTIOUS_CUES = /확인이 필요|자료 기준|경우에 따라|조건에 따라|다를 수|단정하기 어렵|공식.*확인|check the official|depending on|may differ|source does not confirm/i;
const CONCRETE_PATTERN = /-?\d[\d,]*(?:\.\d+)?\s*(?:%|퍼센트|원|천원|만원|억원|일|주|개월|달|년|시간|분|초|kg|g|cm|mm|mAh|GB|TB|Hz|점|명|건|회)/gi;

function countKeyword(text: string, keyword: string): number {
  if (!text || !keyword) return 0;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.match(new RegExp(escaped, 'gi'))?.length || 0;
}

function keywordDensity(text: string, keyword: string): number {
  if (!text || !keyword) return 0;
  return (countKeyword(text, keyword) * keyword.length / Math.max(1, text.length)) * 100;
}

function splitSentences(text: string): string[] {
  return text.split(/[.!?。\n]+/).map((part) => part.trim()).filter(Boolean);
}

export function evaluateSeo(input: EvaluationInput): SubScore {
  const body = input.body || '';
  const title = input.title || '';
  const headings = input.headings || [];
  const primary = String(input.primaryKeyword || '').trim();
  const firstScreen = body.slice(0, 350);
  const grounding = input.groundingText || input.rawText || '';
  const details: Record<string, number> = {};
  const issues: string[] = [];
  const suggestions: string[] = [];
  let total = 0;

  // 1. 자연스러운 키워드 사용 (15). 앞 3글자나 최소 밀도는 요구하지 않는다.
  const bodyKeywordCount = primary ? countKeyword(body, primary) : 0;
  const densityPct = primary ? keywordDensity(body, primary) : 0;
  let keywordScore = 12;
  if (primary) {
    const titleOrIntro = title.toLowerCase().includes(primary.toLowerCase())
      || firstScreen.toLowerCase().includes(primary.toLowerCase());
    const stuffing = densityPct > 4 || bodyKeywordCount > Math.max(10, Math.ceil(body.length / 250));
    keywordScore = (titleOrIntro ? 9 : 3) + (!stuffing ? 6 : 0);
    if (!titleOrIntro) {
      issues.push(`메인 주제 "${primary}"가 제목과 첫 화면에서 명확하지 않음`);
      suggestions.push('키워드를 기계적으로 앞에 붙이지 말고 제목 또는 첫 답변 문장에 한 번 명확히 사용');
    }
    if (stuffing) {
      issues.push(`키워드 반복 과다 (${bodyKeywordCount}회, ${densityPct.toFixed(1)}%)`);
      suggestions.push('반복 키워드를 조건·예외·세부 개념·동의어로 바꿔 검색 의도 범위를 넓히기');
    }
  }
  details.keywordDensity = keywordScore;
  details.keywordDensityPct = Math.round(densityPct * 100) / 100;
  total += keywordScore;

  // 2. 첫 화면의 직접 답변 (20)
  const firstScreenHasTopic = primary
    ? firstScreen.toLowerCase().includes(primary.toLowerCase())
    : firstScreen.length >= 50;
  const firstScreenHasAnswer = ANSWER_CUES.test(firstScreen);
  const firstScreenScore = (firstScreenHasTopic ? 9 : 3) + (firstScreenHasAnswer ? 11 : 4);
  details.keywordInFirstPara = firstScreenScore;
  details.metaSnippet = firstScreenScore;
  total += firstScreenScore;
  if (firstScreenScore < 16) {
    issues.push('첫 화면에서 검색 질문의 답과 적용 조건이 바로 보이지 않음');
    suggestions.push('첫 2~3문장에 짧은 답, 적용 조건, 다음에 확인할 내용을 순서대로 제시');
  }

  // 3. 소제목의 질문 범위와 중복 억제 (15)
  const normalizedHeadings = headings
    .map((heading) => String(heading.title || '').toLowerCase().replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const uniqueHeadingRatio = normalizedHeadings.length > 0
    ? new Set(normalizedHeadings).size / normalizedHeadings.length
    : 0;
  const keywordHeadingCount = primary
    ? normalizedHeadings.filter((heading) => heading.includes(primary.toLowerCase())).length
    : 0;
  const keywordHeadingRatio = normalizedHeadings.length > 0 ? keywordHeadingCount / normalizedHeadings.length : 0;
  let headingScore = normalizedHeadings.length >= 3 && normalizedHeadings.length <= 7 ? 9 : 4;
  headingScore += uniqueHeadingRatio >= 0.9 ? 4 : uniqueHeadingRatio >= 0.7 ? 2 : 0;
  headingScore += keywordHeadingRatio <= 0.5 ? 2 : 0;
  details.headingKeyword = headingScore;
  total += headingScore;
  if (keywordHeadingRatio > 0.5) issues.push('소제목 절반 이상에 동일 메인 키워드가 반복됨');

  // 4. 읽기 쉬운 구조와 충분한 설명 (15)
  const sentences = splitSentences(body);
  const paragraphs = body.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const averageSentenceLength = sentences.length > 0
    ? sentences.reduce((sum, sentence) => sum + sentence.length, 0) / sentences.length
    : 0;
  const structureScore = normalizedHeadings.length >= 3 && normalizedHeadings.length <= 7 ? 10 : 5;
  const readable = paragraphs.length >= 3 && averageSentenceLength >= 12 && averageSentenceLength <= 90;
  const lengthScore = readable ? 5 : 2;
  details.structure = structureScore;
  details.bodyLength = lengthScore;
  total += structureScore + lengthScore;
  if (!readable) suggestions.push('소제목 3~7개, 한 문단 한 판단, 모바일에서 읽히는 문장 길이로 정리');

  // 5. 연관 주제 범위 (10)
  const secondary = (input.secondaryKeywords || []).map((keyword) => keyword.trim()).filter(Boolean);
  const covered = secondary.filter((keyword) => body.toLowerCase().includes(keyword.toLowerCase())).length;
  const coverage = secondary.length > 0 ? covered / secondary.length : 1;
  const topicScore = coverage >= 0.6 ? 10 : coverage >= 0.3 ? 7 : 3;
  details.topicVocabulary = coverage >= 0.6 ? 7 : coverage >= 0.3 ? 5 : 2;
  details.topicCoverage = Math.round(coverage * 100) / 100;
  total += topicScore;
  if (topicScore <= 3) suggestions.push('동일 키워드 반복 대신 검색자가 함께 묻는 조건·서류·예외·비교 항목을 확장');

  // 6. 근거 정합성 (20). 숫자가 없어서 감점하지 않고, 입력에 없는 숫자를 감점한다.
  const evidence = auditEvidenceIntegrity({
    title,
    body,
    groundingText: grounding,
    firstPartyEvidenceAvailable: input.firstPartyEvidenceAvailable === true,
  });
  const unsupportedConcrete = collectUnsupportedConcreteClaims(`${title}\n${body}`, grounding);
  const concreteCount = body.match(CONCRETE_PATTERN)?.length || 0;
  const hasGrounding = grounding.trim().length >= 50;
  let evidenceScore = evidence.hardFail ? 0 : hasGrounding ? 20 : CAUTIOUS_CUES.test(body) ? 17 : 13;
  details.numbersLists = evidenceScore;
  details.concreteNumberCount = concreteCount - unsupportedConcrete.length;
  details.evidenceIntegrity = evidence.score;
  total += evidenceScore;
  if (evidence.hardFail) {
    issues.push(...evidence.issues.map((issue) => issue.message));
    suggestions.push('입력에 없는 작성자 경험·수치·기간·금액을 삭제하고 조건·절차·공식 확인처로 대체');
  }

  // 7. 판단을 돕는 구조화 정보 (5). 주제에 맞는 한 가지면 충분하다.
  const structured = /^\s*(?:[-*]|\d+[.)])\s+/m.test(body) || /\|.+\|/.test(body) || /체크|순서|기준|주의/.test(body);
  details.utility = structured ? 5 : 2;
  total += details.utility;

  const intentFirstScore = Math.round(Math.max(0, Math.min(100, total)));
  const officialExposure = evaluateOfficialExposure(input);
  const officialDetails = Object.fromEntries(
    Object.entries(officialExposure.details).map(([key, value]) => [`official_${key}`, value]),
  );
  const blendedScore = Math.round((intentFirstScore * 0.7) + (officialExposure.score * 0.3));

  return {
    score: Math.max(0, Math.min(100, blendedScore)),
    details: {
      ...details,
      legacySeoScore: intentFirstScore,
      officialExposureScore: officialExposure.score,
      ...officialDetails,
    },
    issues: [...issues, ...officialExposure.issues],
    suggestions: [...suggestions, ...officialExposure.suggestions],
  };
}
