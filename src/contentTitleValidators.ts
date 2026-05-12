/**
 * [Phase 3-6/v2.10.144] contentGenerator god file 분해 — 제목 품질 validator.
 *
 * 4개 validator 모두 pure 함수 + ContentSource type만 의존 (type-only import → cycle 안전).
 *
 * 도메인: 제목/도입부 비평 (issue 배열 반환). cleanup 작업은 contentTitleHelpers.ts 참조.
 */

import type { ContentSource } from './contentGenerator';

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
  if (len > 40) issues.push('제목 너무 김');

  // 키워드 앞쪽 배치 검증 (앞 3~5글자 내 배치 필수)
  if (primaryKeyword) {
    const kw = primaryKeyword.trim();
    const kwWords = kw.split(/[\s,/\-]+/).filter(w => w.length >= 2);
    const firstKwWord = kwWords[0] || kw;

    const kwIndex = t.indexOf(firstKwWord);
    if (kwIndex < 0) {
      issues.push(`키워드 미포함 (${firstKwWord})`);
    } else if (kwIndex > 5) {
      issues.push(`키워드 앞배치 실패 (${kwIndex}번째 위치)`);
    }
  }

  // 0점 패턴 차단 (뻔한 템플릿 종결)
  const zeroScoreEndings = ['총정리', '방법', '후기', '추천', '가이드', '리뷰', '정리'];
  const endsWithZeroPattern = zeroScoreEndings.some(p => t.endsWith(p));
  if (endsWithZeroPattern) {
    issues.push('뻔한 템플릿 종결 (0점 패턴)');
  }

  // 트리거 검증 — 0점 패턴 제외 실질적 클릭 트리거만 인정
  const hasNumber = /\d/.test(t);
  const goodSeoTriggers = [
    '놓치면', '손해', '안 하면', '모르면', '해봤더니', '써보니', '써봤는데',
    '달라졌', '바뀌었', '놀랐', '할까', '일까', '어떨까',
    '비교', '차이', '해결', '꿀팁', '효과', '최신',
    '진짜', '실제', '직접', '비밀', '몰랐던', '이유',
    '아꼈', '할인', '절약', '만에', '확인'
  ];
  const hasGoodTrigger = goodSeoTriggers.some(x => t.includes(x));
  if (!hasNumber && !hasGoodTrigger) issues.push('숫자/클릭트리거 부재');

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
  // 토픽 매칭 글자수 기준 28~45자
  if (len < 28) issues.push('제목 너무 짧음 (28자 미만, 서브키워드 공간 부족)');
  if (len > 45) issues.push('제목 너무 김 (45자 초과)');

  // 키워드 앞쪽 배치 검증
  if (primaryKeyword) {
    const kw = primaryKeyword.trim();
    const kwWords = kw.split(/[\s,/\-]+/).filter(w => w.length >= 2);
    const firstKwWord = kwWords[0] || kw;

    const kwIndex = t.indexOf(firstKwWord);
    if (kwIndex < 0) {
      issues.push(`키워드 미포함 (${firstKwWord})`);
    } else if (kwIndex > 5) {
      issues.push(`키워드 앞배치 실패 (${kwIndex}번째 위치)`);
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

  // 감정/경험 트리거 + 체험/결과 트리거 (토픽 매칭 100점 공식)
  const emotionTriggers = [
    // 체험 증명형
    '써보니', '써봤는데', '써본', '써보고', '써봤더니', '써봤어요',
    '사용 후', '개월', '주간', '일 차', '해봤더니', '해봤는데',
    '다녀온', '다녀왔', '가봤', '방문', '먹어봤',
    // 결과 공개형
    '효과', '달라진', '달라졌', '바뀌었', '후회', '포기',
    // 호기심 유발형
    '왜 그랬', '의외', '예상 외', '몰랐던', '놀라운',
    // 공감형
    '그랬어요', '저도', '다들', '느꼈', '공감',
    // 발견형
    '90%', '놓치', '손해', '숨겨', '비밀',
    // 반전/변화형
    '결국', '알고보니', '반전', '비교',
    // 시의성 공감형
    '요즘', '최근', '올해', '이번',
    // 감정 트리거
    '진짜', '직접', '현장', '실시간', '반응', '근황', '결과',
    '소식', '순간', '모습', '이유', '놀랐', '소름',
    '난리', '대박', '감동', '궁금', '고민', '당황',
    '침묵', '뒷이야기', '비결', '경험'
  ];
  const hasEmotionTrigger = emotionTriggers.some(x => t.includes(x));
  if (!hasEmotionTrigger) issues.push('감정/경험/체험 트리거 부재');

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
    '진짜', '찐', '리얼', '현실', '솔직히', '깨달은', '써보고', '써본',
    '대박', '후회', '실패', '꿀템', '인생', '개월', '주간'
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
