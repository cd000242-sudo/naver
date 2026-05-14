/**
 * SEO 모드 평가기 — 끝판왕 Phase 1 (v2.10.177)
 *
 * 평가 항목 (가중치 합 100):
 *   1. 키워드 밀도 1.5~3% (25점)
 *   2. 키워드 첫 문단 출현 (15점)
 *   3. 소제목 키워드 변형 (15점)
 *   4. H2/H3 구조 2~4개 (15점)
 *   5. 본문 길이 1500자+ (10점)
 *   6. 메타디스크립션 강도 (첫 120자 키워드+훅) (10점)
 *   7. 숫자/리스트 신호 (10점)
 *
 * reviewer 진단 CRITICAL: 기존 analyzeNaverScore는 boolean includes만 체크 → 실제 밀도/배치 무측정.
 *   본 모듈이 실측 신호로 평가.
 */

import type { SubScore, EvaluationInput } from '../qualityEvaluator';

function countKeyword(text: string, keyword: string): number {
  if (!keyword) return 0;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = text.match(new RegExp(escaped, 'gi'));
  return matches ? matches.length : 0;
}

function calcKeywordDensity(text: string, keyword: string): number {
  if (!keyword || !text) return 0;
  const charCount = text.length;
  const keywordCount = countKeyword(text, keyword);
  // 한국어 기준: 키워드 출현 횟수 × 키워드 길이 / 전체 글자 수
  return (keywordCount * keyword.length) / Math.max(1, charCount);
}

function getFirstParagraph(text: string, maxChars: number = 250): string {
  const paragraphs = text.split(/\n\n+/);
  return (paragraphs[0] || '').slice(0, maxChars);
}

export function evaluateSeo(input: EvaluationInput): SubScore {
  const body = input.body || '';
  const title = input.title || '';
  const headings = input.headings || [];
  const primaryKw = input.primaryKeyword || '';

  const details: Record<string, number> = {};
  const issues: string[] = [];
  const suggestions: string[] = [];
  let total = 0;

  // 1. 키워드 밀도 1.5~3%  (25점)
  if (primaryKw) {
    const density = calcKeywordDensity(body, primaryKw);
    const densityPct = density * 100;
    let densityScore = 0;
    if (densityPct >= 1.5 && densityPct <= 3.0) {
      densityScore = 25;
    } else if (densityPct >= 1.0 && densityPct < 1.5) {
      densityScore = 18;
      issues.push(`키워드 밀도 ${densityPct.toFixed(1)}% — 1.5% 미만 (under-stuffing)`);
    } else if (densityPct > 3.0 && densityPct <= 5.0) {
      densityScore = 18;
      issues.push(`키워드 밀도 ${densityPct.toFixed(1)}% — 3% 초과 (over-stuffing 위험)`);
    } else if (densityPct > 5.0) {
      densityScore = 8;
      issues.push(`키워드 밀도 ${densityPct.toFixed(1)}% — 5% 초과 (네이버 SEO 스팸 감지 위험)`);
    } else {
      densityScore = 5;
      issues.push(`키워드 "${primaryKw}" 거의 미사용 — 본문에 8~12회 배치 필요`);
    }
    details.keywordDensity = densityScore;
    details.keywordDensityPct = Math.round(densityPct * 100) / 100;
    total += densityScore;
  } else {
    details.keywordDensity = 15; // 키워드 미지정 시 평균 부여
    total += 15;
  }

  // 2. 키워드 첫 문단 출현 (15점)
  if (primaryKw) {
    const firstPara = getFirstParagraph(body);
    if (firstPara.toLowerCase().includes(primaryKw.toLowerCase())) {
      details.keywordInFirstPara = 15;
      total += 15;
    } else {
      details.keywordInFirstPara = 0;
      issues.push(`첫 문단(첫 250자)에 키워드 "${primaryKw}" 없음 — SEO 신호 약함`);
      suggestions.push('첫 문단에 메인 키워드를 자연스럽게 배치하라');
    }
  } else {
    details.keywordInFirstPara = 10;
    total += 10;
  }

  // 3. 소제목 키워드 변형 (15점)
  if (primaryKw && headings.length > 0) {
    let kwHeadingCount = 0;
    for (const h of headings) {
      const ht = (h.title || '').toLowerCase();
      if (ht.includes(primaryKw.toLowerCase())) kwHeadingCount++;
    }
    const ratio = kwHeadingCount / headings.length;
    let hScore = 0;
    if (ratio >= 0.3 && ratio <= 0.7) {
      hScore = 15;
    } else if (ratio > 0.7) {
      hScore = 10;
      issues.push(`소제목 ${kwHeadingCount}/${headings.length}개가 키워드 포함 — 과밀 (스팸 위험)`);
    } else if (ratio >= 0.15) {
      hScore = 10;
      issues.push(`소제목 ${kwHeadingCount}/${headings.length}개만 키워드 포함 — 더 자연스러운 변형 권장`);
    } else {
      hScore = 5;
      issues.push(`소제목에 키워드 거의 없음 — 1~2개 변형 형태로 배치 권장`);
    }
    details.headingKeyword = hScore;
    total += hScore;
  } else {
    details.headingKeyword = 10;
    total += 10;
  }

  // 4. H2/H3 구조 2~4개 (15점)
  const headCount = headings.length;
  let structScore = 0;
  if (headCount >= 2 && headCount <= 4) {
    structScore = 15;
  } else if (headCount === 5) {
    structScore = 12;
  } else if (headCount === 1 || headCount === 6) {
    structScore = 8;
    issues.push(`소제목 ${headCount}개 — 권장 2~4개 (가독성/SEO 균형)`);
  } else {
    structScore = 3;
    issues.push(`소제목 ${headCount}개 — 구조 불균형 (SEO 신호 약함)`);
  }
  details.structure = structScore;
  total += structScore;

  // 5. 본문 길이 (10점)
  let lenScore = 0;
  if (body.length >= 1500 && body.length <= 4000) {
    lenScore = 10;
  } else if (body.length >= 1200 && body.length < 1500) {
    lenScore = 7;
    issues.push(`본문 ${body.length}자 — 1500자 미달 (SEO 신호 약함)`);
  } else if (body.length > 4000) {
    lenScore = 7;
  } else {
    lenScore = 3;
    issues.push(`본문 ${body.length}자 — 너무 짧음 (SEO 노출 불리)`);
  }
  details.bodyLength = lenScore;
  total += lenScore;

  // 6. 메타디스크립션 강도 (10점) — 첫 120자에 키워드 + 훅
  const firstSnippet = body.slice(0, 120);
  let metaScore = 0;
  const hasKwInSnippet = primaryKw ? firstSnippet.toLowerCase().includes(primaryKw.toLowerCase()) : true;
  const hasHook = /\?|솔직히|진짜|놀라|꿀팁|정리|비교|추천|방법|총정리/.test(firstSnippet);
  if (hasKwInSnippet && hasHook) metaScore = 10;
  else if (hasKwInSnippet || hasHook) metaScore = 6;
  else {
    metaScore = 3;
    issues.push('검색 스니펫(첫 120자) — 키워드 또는 훅 부족');
    suggestions.push('첫 120자에 키워드 + 호기심 유발 표현 배치 (검색 클릭률 직결)');
  }
  details.metaSnippet = metaScore;
  total += metaScore;

  // 7. 숫자/리스트 신호 (10점)
  // ✅ [v2.10.182 Phase 2.5.1] 2026 네이버 알고리즘 대응 — *구체 수치(단위 포함)* 가산점
  //   AI는 구체 수치를 "검증 가능한 정보"로 분류 (네이버 DIA+ 2026)
  //   예: "10~15분", "300g", "3만원", "12.5%" — 단순 숫자 보다 *훨씬 강한* SEO 신호
  const numberCount = (body.match(/\d+/g) ?? []).length;
  const listCount = (body.match(/^[\s•·\-*]?\s*\d+[.)]/gm) ?? []).length;
  // 구체 수치 (단위 포함) — 시간/무게/가격/비율/수량 단위
  const concreteNumberPattern = /\d+(?:[.,]\d+)?(?:~\d+(?:[.,]\d+)?)?\s*(?:분|초|시간|일|주|개월|년|kg|g|cm|mm|m|km|ml|L|원|만원|천원|%|배|회|개|명|인분|평|위|등)/g;
  const concreteCount = (body.match(concreteNumberPattern) ?? []).length;
  let listScore = 0;
  // 구체 수치 3개+ + 리스트 1개+ → 10점 만점
  if (concreteCount >= 3 && listCount >= 1) listScore = 10;
  else if (concreteCount >= 3) listScore = 9;       // 구체 수치만 강해도 우대
  else if (numberCount >= 5 && listCount >= 2) listScore = 8;
  else if (concreteCount >= 1) listScore = 7;
  else if (numberCount >= 3) listScore = 5;
  else if (numberCount >= 1) listScore = 3;
  else {
    listScore = 1;
    issues.push('숫자/구체 수치 없음 — 2026 네이버 알고리즘 핵심 SEO 신호 부재');
    suggestions.push('구체 수치 (단위 포함) 추가: "10~15분", "300g", "3만원", "12.5%" 같은 형태');
  }
  details.numbersLists = listScore;
  details.concreteNumberCount = concreteCount;
  total += listScore;

  return {
    score: Math.round(Math.max(0, Math.min(100, total))),
    details,
    issues,
    suggestions,
  };
}
