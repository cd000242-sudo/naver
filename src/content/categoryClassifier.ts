/**
 * SPEC-CONVERSION-001 L2-1.2 — 카테고리 분류기
 *
 * 5단계 체인드 파이프라인의 Stage 1.
 * ContentSource(제목·rawText·productHint·기존 categoryHint)를 받아
 * PersonaCategory 10종 중 하나로 결정론적 분류한다.
 *
 * 설계 원칙:
 *   - LLM 없이 휴리스틱 매칭 (속도·비용 0)
 *   - L4 단계에서 LLM 분류로 업그레이드 가능 (인터페이스 호환)
 *   - 메모리 [silent 폴백 금지]: 매칭 실패 시 'general' 명시 폴백 + 신뢰도 0
 *   - 메모리 [추정 효과 금지]: 분류 정확도 보장 약속 안 함, 운영 메트릭 후 calibrate
 */

import type { PersonaCategory } from './personaBuilder';

export interface CategoryClassifierInput {
  readonly title?: string;
  readonly rawText?: string;
  readonly productHint?: string;
  readonly existingHint?: string;
}

export interface CategoryClassifierResult {
  readonly category: PersonaCategory;
  readonly confidence: number;          // 0~1, 휴리스틱 일치도
  readonly matchedKeywords: readonly string[];
  readonly source: 'existingHint' | 'keyword' | 'fallback';
}

interface CategoryKeywords {
  readonly category: PersonaCategory;
  readonly keywords: readonly string[];
}

const CATEGORY_KEYWORDS: readonly CategoryKeywords[] = [
  {
    category: 'food',
    keywords: [
      '맛집', '음식', '요리', '레시피', '식당', '카페', '디저트', '베이커리',
      '메뉴', '한식', '양식', '일식', '중식', '분식', '치킨', '피자', '햄버거',
      '커피', '브런치', '와인', '맥주', '소주', '술집', '주점', '바', '뷔페',
    ],
  },
  {
    category: 'parenting',
    keywords: [
      '육아', '아이', '아기', '유아', '신생아', '돌', '돐', '엄마', '아빠',
      '출산', '임신', '결혼', '신혼', '유치원', '어린이집', '초등', '학용품',
      '분유', '이유식', '기저귀', '카시트', '유모차', '장난감', '교육', '학습지',
    ],
  },
  {
    category: 'beauty',
    keywords: [
      '뷰티', '화장품', '스킨케어', '메이크업', '립스틱', '아이섀도', '마스카라',
      '쿠션', '파운데이션', '컨실러', '향수', '네일', '헤어', '염색', '펌',
      '에센스', '세럼', '크림', '토너', '클렌징', '선크림', '미용실', '피부과',
    ],
  },
  {
    category: 'health',
    keywords: [
      '건강', '운동', '헬스', '다이어트', '영양제', '비타민', '프로바이오틱',
      '단백질', '식단', '체중', '체형', '근력', '러닝', '요가', '필라테스',
      '병원', '약국', '의원', '약', '치료', '수술', '검진', '면역', '관절',
    ],
  },
  {
    category: 'travel',
    keywords: [
      '여행', '호텔', '리조트', '펜션', '게스트하우스', '에어비앤비', '관광',
      '명소', '코스', '일정', '제주', '부산', '강릉', '경주', '서울', '도쿄',
      '오사카', '발리', '다낭', '비행기', '항공권', '패키지', '자유여행', '국내', '해외',
    ],
  },
  {
    category: 'tech',
    keywords: [
      '스마트폰', '아이폰', '갤럭시', '노트북', '맥북', '태블릿', '아이패드',
      '이어폰', '에어팟', '키보드', '마우스', '모니터', '그래픽카드', 'CPU',
      'GPU', '게이밍', '카메라', '렌즈', '드론', '가전', '냉장고', '세탁기',
      '청소기', 'TV', '에어컨', '공기청정기', '로봇청소기', '자동차', '전기차',
    ],
  },
  {
    category: 'lifestyle',
    keywords: [
      '인테리어', '홈데코', '가구', '소파', '침대', '식탁', '책상', '의자',
      '조명', '커튼', '러그', '벽지', '수납', '정리', '청소', '세제', '주방용품',
      '식기', '컵', '냄비', '프라이팬', '자취', '원룸', '셀프인테리어',
    ],
  },
  {
    category: 'entertainment',
    keywords: [
      '영화', '드라마', '예능', '연예', '아이돌', '가수', '배우', '뮤지컬',
      '콘서트', '공연', '넷플릭스', '디즈니', '왓챠', '티빙', '쿠팡플레이',
      'OTT', '책', '소설', '에세이', '게임', '플레이스테이션', '닌텐도', '스팀',
    ],
  },
  {
    category: 'finance',
    keywords: [
      '재테크', '투자', '주식', '펀드', 'ETF', '코인', '비트코인', '부동산',
      '아파트', '청약', '대출', '적금', '예금', '연금', '보험', '카드',
      '체크카드', '신용카드', '캐시백', '리워드', '세금', '연말정산', '세무',
    ],
  },
];

const VALID_CATEGORIES: ReadonlySet<PersonaCategory> = new Set([
  'food', 'parenting', 'beauty', 'health', 'travel',
  'tech', 'lifestyle', 'entertainment', 'finance', 'general',
]);

function normalizeText(text?: string): string {
  return (text ?? '').toLowerCase().trim();
}

function countKeywordMatches(text: string, keywords: readonly string[]): { count: number; matched: string[] } {
  if (!text) return { count: 0, matched: [] };
  const matched: string[] = [];
  for (const kw of keywords) {
    if (text.includes(kw.toLowerCase())) {
      matched.push(kw);
    }
  }
  return { count: matched.length, matched };
}

export function classifyCategory(input: CategoryClassifierInput): CategoryClassifierResult {
  // 1. existingHint 우선 (메인이 이미 알려준 카테고리)
  if (input.existingHint) {
    const lower = input.existingHint.toLowerCase().trim();
    if (VALID_CATEGORIES.has(lower as PersonaCategory)) {
      return {
        category: lower as PersonaCategory,
        confidence: 1.0,
        matchedKeywords: [],
        source: 'existingHint',
      };
    }
  }

  // 2. 키워드 매칭 — title + productHint 가중치 ×2, rawText 가중치 ×1
  const titleNorm = normalizeText(input.title);
  const productNorm = normalizeText(input.productHint);
  const rawTextNorm = normalizeText(input.rawText).slice(0, 2000); // V2 ReDoS 방어 일관성

  let bestCategory: PersonaCategory = 'general';
  let bestScore = 0;
  let bestMatched: string[] = [];

  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    const titleHit = countKeywordMatches(titleNorm, keywords);
    const productHit = countKeywordMatches(productNorm, keywords);
    const rawHit = countKeywordMatches(rawTextNorm, keywords);

    const score = titleHit.count * 2 + productHit.count * 2 + rawHit.count;
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
      bestMatched = [...new Set([...titleHit.matched, ...productHit.matched, ...rawHit.matched])].slice(0, 8);
    }
  }

  if (bestScore === 0) {
    console.log('[CategoryClassifier] 매칭 키워드 없음 → general 폴백 (silent X, 명시 로그)');
    return {
      category: 'general',
      confidence: 0,
      matchedKeywords: [],
      source: 'fallback',
    };
  }

  // 신뢰도: 매칭 키워드 수에 따라 0.3~1.0
  const confidence = Math.min(1.0, 0.3 + bestScore * 0.1);

  return {
    category: bestCategory,
    confidence,
    matchedKeywords: bestMatched,
    source: 'keyword',
  };
}
