/**
 * [Phase 3-6/v2.10.144] contentGenerator god file 분해 — 제목 품질 validator.
 *
 * 4개 validator 모두 pure 함수 + ContentSource type만 의존 (type-only import → cycle 안전).
 *
 * 도메인: 제목/도입부 비평 (issue 배열 반환). cleanup 작업은 contentTitleHelpers.ts 참조.
 */

import type { ContentSource } from './contentGenerator';
import { classifyAffiliateEvidence } from './content/affiliateAuthenticity';

/**
 * SEO 모드 제목의 치명적 이슈 감지.
 *
 * 검증 항목:
 *   - 길이 (22~40자)
 *   - 키워드 앞배치 (앞 5글자 내)
 *   - 0점 종결 패턴 (총정리/방법/후기/추천/가이드 등)
 *   - 숫자/클릭 트리거 부재
 *   - 설명체/딱딱한 어미 (입니다/합니다/에 대해 등)
 *
 * @returns 이슈 배열. 비어있으면 통과.
 */
export function computeSeoTitleCriticalIssues(title: string, primaryKeyword?: string): string[] {
  const issues: string[] = [];
  const t = String(title || '').trim();
  if (!t) {
    issues.push('제목이 비어있음');
    return issues;
  }
  const len = t.length;
  if (len < 22) issues.push('제목 너무 짧음');
  if (len > 42) issues.push('제목 너무 김');

  // 검색 주제 포함 여부만 검증한다. 앞 3~5글자 강제는 자연스러운 제목을 깨뜨린다.
  if (primaryKeyword) {
    const kw = primaryKeyword.trim();
    const kwWords = kw.split(/[\s,/\-]+/).filter(w => w.length >= 2);
    const firstKwWord = kwWords[0] || kw;

    const kwIndex = t.indexOf(firstKwWord);
    if (kwIndex < 0) {
      issues.push(`키워드 미포함 (${firstKwWord})`);
    }
  }

  // 0점 패턴 차단 (뻔한 템플릿 종결)
  const zeroScoreEndings = ['총정리', '방법', '후기', '추천', '가이드', '리뷰', '정리'];
  const endsWithZeroPattern = zeroScoreEndings.some(p => t.endsWith(p));
  if (endsWithZeroPattern) {
    issues.push('뻔한 템플릿 종결 (0점 패턴)');
  }

  // 트리거 검증 — 0점 패턴 제외 실질적 클릭 트리거만 인정
  const goodSeoTriggers = [
    '대상', '조건', '기준', '순서', '절차', '서류', '비교', '차이',
    '해결', '주의', '이유', '확인', '선택', '언제', '얼마', '어떻게',
    '할까', '일까', '어떨까', '가능', '방법'
  ];
  const hasGoodTrigger = goodSeoTriggers.some(x => t.includes(x));
  if (!hasGoodTrigger) issues.push('검색 의도/판단 기준이 제목에 드러나지 않음');

  // 설명체/딱딱한 어미 금지
  const forbiddenSeoPatterns = ['에 대해', '에 관한', '입니다', '합니다', '알아보겠', '하는 법'];
  if (forbiddenSeoPatterns.some(p => t.includes(p))) issues.push('설명체/딱딱한 어미');

  return issues;
}

/**
 * 홈피드(homefeed) 모드 제목의 치명적 이슈 감지.
 *
 * SEO 대비 차이: 길이 28~45자, 감정/체험 트리거 필수, 키워드 반복/특수문자 차단.
 */
export function computeHomefeedTitleCriticalIssues(title: string, primaryKeyword?: string): string[] {
  const issues: string[] = [];
  const t = String(title || '').trim();
  if (!t) {
    issues.push('제목이 비어있음');
    return issues;
  }
  const len = t.length;
  // 홈판 제목 단일 기준: 28~42자
  if (len < 28) issues.push('제목 너무 짧음 (28자 미만, 서브키워드 공간 부족)');
  if (len > 42) issues.push('제목 너무 김 (42자 초과)');

  // 홈판은 자연스러운 위치에 주제를 한 번 포함하면 충분하다.
  if (primaryKeyword) {
    const kw = primaryKeyword.trim();
    const kwWords = kw.split(/[\s,/\-]+/).filter(w => w.length >= 2);
    const firstKwWord = kwWords[0] || kw;

    const kwIndex = t.indexOf(firstKwWord);
    if (kwIndex < 0) {
      issues.push(`키워드 미포함 (${firstKwWord})`);
    }
  }

  // 키워드 중복 감지 — 같은 2자+ 단어 2회+ 등장하면 키워드 나열
  const koreanWordsCheck = t.match(/[가-힣]{2,}/g) || [];
  const wordFreqCheck = new Map<string, number>();
  for (const w of koreanWordsCheck) {
    wordFreqCheck.set(w, (wordFreqCheck.get(w) || 0) + 1);
  }
  const dupWordsCheck = Array.from(wordFreqCheck.entries()).filter(([, c]) => c >= 2).map(([w]) => w);
  if (dupWordsCheck.length > 0) {
    issues.push(`키워드 반복 (${dupWordsCheck.join(', ')} — 같은 단어 2회 이상 사용 금지)`);
  }

  // 0점 패턴 확장 — 정보성/설명형 종결어는 홈판에서 0점
  const zeroScoreEndings = ['총정리', '방법', '후기', '추천', '가이드', '리뷰', '정리', '하는 법', '꿀팁', '비법', '노하우'];
  const endsWithZeroPattern = zeroScoreEndings.some(p => t.endsWith(p));
  if (endsWithZeroPattern) {
    issues.push('뻔한 정보성 종결 (홈판 0점 패턴)');
  }

  // 감정어가 아니라 독자가 얻을 가치·판단 기준을 검증한다.
  const valueTriggers = [
    '조건', '기준', '순서', '차이', '이유', '확인', '주의', '비교',
    '선택', '고민', '헷갈', '놓치', '달라진', '결과', '반응', '근황',
    '할까', '일까', '어떻게', '왜', '먼저', '전에'
  ];
  const hasValueTrigger = valueTriggers.some(x => t.includes(x));
  if (!hasValueTrigger) issues.push('독자 가치/판단 기준이 제목에 드러나지 않음');

  if (/(충격|경악|소름|대박|폭로|진실\s*공개|알고보니|난리|실화)/.test(t)) {
    issues.push('과장·클릭베이트 표현 포함');
  }

  // 금지 표현
  const forbiddenTitlePatterns = ['왜?', '왜일까?', '에 대해', '에 관한', '알아보겠습니다', '입니다', '합니다'];
  if (forbiddenTitlePatterns.some(p => t.includes(p))) issues.push('금지 표현 포함');

  // 가운뎃점/세미콜론/작은따옴표 차단
  if (/[·;']/.test(t)) issues.push('금지 특수문자 포함 (·;\' — 검색 매칭 실패)');

  return issues;
}

/**
 * 쇼핑커넥트(affiliate) 제목 치명적 이슈 감지.
 *
 * 검증 항목:
 *   - 길이 (15~50자)
 *   - 상품명 정합성 (그대로 vs 추가 키워드)
 *   - 금지 패턴 (vs, 비교분석, 에러/오류/캡차 등)
 *   - 가격대-키워드 정합성 (고가+저가 키워드 불일치 등)
 *   - 매력 키워드는 경고만 (이슈 X — 강제 재생성 방지)
 */
export function computeAffiliateTitleCriticalIssues(title: string, source: ContentSource): string[] {
  const issues: string[] = [];
  const t = String(title || '').trim();

  if (!t) {
    issues.push('제목이 비어있음');
    return issues;
  }

  const len = t.length;

  // 1. 길이 검증
  if (len < 15) issues.push('제목 너무 짧음 (15자 미만)');
  if (len > 50) issues.push('제목 너무 김 (50자 초과)');

  // 2. 상품명 포함 여부 검증
  const productName = String(source.productInfo?.name || source.title || '').trim();
  if (productName && productName.length >= 3) {
    // 상품명 그대로 검증 (AI 훅 제목 보존)
    const normalizedTitle = t.replace(/[^\w가-힣]/g, '').toLowerCase();
    const normalizedProduct = productName.replace(/[^\w가-힣]/g, '').toLowerCase();

    if (normalizedTitle === normalizedProduct) {
      issues.push('상품명 그대로 (후킹 키워드 필요)');
    } else if (normalizedProduct.length >= 10 && normalizedTitle.length > 0) {
      const overlap = normalizedTitle.includes(normalizedProduct) || normalizedProduct.includes(normalizedTitle);
      if (overlap) {
        const titleWords = t.split(/[\s,/\-]+/).filter(w => w.length >= 2).filter(w => !/^\[.+\]$/.test(w));
        const productWords = productName.split(/[\s,/\-]+/).filter(w => w.length >= 2);
        const additionalWords = titleWords.filter(tw =>
          !productWords.some(pw => tw.toLowerCase().includes(pw.toLowerCase()) || pw.toLowerCase().includes(tw.toLowerCase()))
        );
        if (additionalWords.length < 1) {
          issues.push('상품명 그대로 (후킹 키워드 추가 필요)');
        }
      }
    }

    // 상품명 핵심 단어 누락 검증
    const productWordsArr = productName.split(/[\s,/\-]+/).filter(w => w.length >= 2);
    const coreProductWords = productWordsArr.slice(0, 3);

    const hasProductKeyword = coreProductWords.some(word =>
      t.toLowerCase().includes(word.toLowerCase())
    );

    if (!hasProductKeyword && coreProductWords.length > 0) {
      issues.push(`상품명 누락 (${coreProductWords[0]}...)`);
    }
  }

  // 3. 금지 패턴 검증
  const forbiddenPatterns = [
    'vs ', ' vs.', '비교분석', '에 대해', '에 관한', '알아보겠',
    '입니다', '합니다', '왜일까',
    '에러', '오류', '캡차',
  ];
  if (forbiddenPatterns.some(p => t.toLowerCase().includes(p.toLowerCase()))) {
    issues.push('금지 패턴 포함');
  }

  const evidenceMode = classifyAffiliateEvidence(source).mode;
  if (evidenceMode !== 'first_party') {
    const unsupportedExperienceTitle = /써보|사용해보|직접\s*(?:써|사용|구매)|내돈내산|실사용|(?:한\s*달|\d+\s*(?:일|주|개월))\s*(?:써|사용)/i;
    if (unsupportedExperienceTitle.test(t)) {
      issues.push('작성자 실사용 근거 없는 체험형 제목');
    }
  }

  // 4. 가격대-키워드 정합성 검증
  const priceStr = String(source.productPrice || source.productInfo?.price || '').replace(/[^0-9]/g, '');
  const price = parseInt(priceStr) || 0;

  if (price > 0) {
    const lowPriceKeywords = ['가성비', '입문용', '저렴', '싸게', '최저가', '자취', '원룸', '1인가구'];
    const highPriceKeywords = ['프리미엄', '최고급', '하이엔드', '명품', '고급형'];

    if (price >= 1000000) {
      if (lowPriceKeywords.some(kw => t.includes(kw))) {
        issues.push(`가격 불일치 (${Math.floor(price / 10000)}만원 고가 + 저가 키워드)`);
      }
    } else if (price < 300000) {
      if (highPriceKeywords.some(kw => t.includes(kw))) {
        issues.push(`가격 불일치 (${Math.floor(price / 10000)}만원 저가 + 고가 키워드)`);
      }
    }
  }

  // 5. 매력적 키워드 검증 — 경고만 로그, 이슈에는 추가 안 함 (강제 재생성 방지)
  const affiliateTriggers = [
    '추천', '후기', '리뷰', '구매', '사용', '만족', '솔직',
    '가성비', '비교', '장단점', '꿀팁', '선택', '최신', '인기',
    '2026', '2025', '신제품', '핫딜', '특가', '할인',
    '현실', '장단점', '선택', '체크', '조건', '소음', '크기', '무게',
    '가격', '옵션', '구성', '후기에서', '구매 전', '맞을까'
  ];
  const hasTrigger = affiliateTriggers.some(x => t.includes(x));
  if (!hasTrigger) {
    console.warn(`[AffiliateTitleCheck] 매력적 키워드 없음 (경고만): "${t}"`);
  }

  return issues;
}

/**
 * 홈피드 도입부의 치명적 이슈 감지 — 길이 검증만.
 */
export function computeHomefeedIntroCriticalIssues(intro: string | undefined): string[] {
  const issues: string[] = [];
  const s = String(intro || '').trim();
  if (!s) return issues;
  const lines = s.split(/[.!?]\s*/).filter(x => x.trim().length > 0).length;
  if (lines > 5) issues.push('도입부가 너무 김');
  return issues;
}
