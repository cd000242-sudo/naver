/**
 * [Phase 3-12/v2.10.150] contentGenerator god file decomposition — product category detection.
 *
 * 상품명/추가 컨텍스트에서 카테고리(food/electronics/cosmetics/...)를 자동 감지.
 * 카테고리별 키워드 DB + 점수 기반 매칭. pure 함수 (console.log side-effect만).
 */

/**
 * ✅ [2026-01-21] 상품명에서 카테고리를 자동 감지
 * AI에게 카테고리를 명시적으로 전달하여 부적절한 표현 방지
 * (예: 과일 상품에 "조립이 필요없다" 같은 가전 표현 사용 방지)
 */
export type ProductCategory =
  | 'food'        // 식품/농산물/음료
  | 'electronics' // 가전/전자제품
  | 'cosmetics'   // 화장품/스킨케어
  | 'fashion'     // 의류/패션/악세서리
  | 'furniture'   // 가구/인테리어
  | 'health'      // 건강/영양제
  | 'baby'        // 유아/아동
  | 'pet'         // 반려동물
  | 'sports'      // 스포츠/레저
  | 'general';    // 일반/기타

export interface ProductCategoryResult {
  category: ProductCategory;
  categoryKorean: string;
  confidence: 'high' | 'medium' | 'low';
  matchedKeywords: string[];
}

export function detectProductCategory(productName: string, additionalContext?: string): ProductCategoryResult {
  const text = `${productName || ''} ${additionalContext || ''}`.toLowerCase().trim();

  // 카테고리별 키워드 데이터베이스
  const categoryKeywords: Record<ProductCategory, string[]> = {
    food: [
      // 과일
      '샤인머스캣', '포도', '사과', '배', '귤', '감귤', '한라봉', '천혜향', '딸기', '복숭아', '수박', '참외',
      '망고', '바나나', '오렌지', '자몽', '키위', '블루베리', '체리', '아보카도', '레몬', '라임',
      // 채소
      '배추', '무', '양배추', '당근', '감자', '고구마', '양파', '마늘', '파', '시금치', '상추', '토마토',
      '오이', '호박', '고추', '파프리카', '브로콜리', '콩나물', '버섯',
      // 육류/해산물
      '한우', '소고기', '돼지고기', '삼겹살', '닭고기', '오리', '연어', '참치', '전복', '새우', '랍스터',
      '굴', '홍합', '조개', '오징어', '낙지', '문어', '꽃게', '대게',
      // 가공식품
      '라면', '과자', '빵', '케이크', '초콜릿', '사탕', '젤리', '아이스크림', '치즈', '햄', '소시지',
      '김치', '장류', '간장', '된장', '고추장', '식초', '올리브유', '참기름',
      // 음료
      '커피', '차', '주스', '우유', '두유', '요거트', '콤부차', '탄산수', '생수',
      // 건강식품
      '꿀', '홍삼', '인삼', '흑마늘', '도라지', '즙', '진액', '엑기스',
      // 일반 식품 키워드
      '식품', '음식', '먹거리', '간식', '반찬', '밑반찬', '요리', '레시피',
      '유기농', 'gap', '무농약', '친환경', '국내산', '수입산', '프리미엄',
      '신선', '냉동', '냉장', '상온', '당도', '과즙', '시즙'
    ],
    electronics: [
      // 주방가전
      '청소기', '에어프라이어', '전자레인지', '오븐', '토스터', '믹서기', '블렌더', '커피머신', '정수기', '식기세척기',
      '냉장고', '김치냉장고', '밥솥', '전기포트', '인덕션', '가스레인지',
      // 생활가전
      '에어컨', '선풍기', '서큘레이터', '히터', '온풍기', '제습기', '가습기', '공기청정기', '로봇청소기',
      '세탁기', '건조기', '다리미', '스타일러',
      // IT/디지털
      '스마트폰', '태블릿', '노트북', '컴퓨터', 'pc', '모니터', '키보드', '마우스', '헤드폰', '이어폰',
      '스피커', '블루투스', '충전기', '보조배터리', '케이블', 'usb', 'ssd', 'hdd',
      // 영상/음향
      'tv', '텔레비전', '빔프로젝터', '사운드바', '홈시어터', '카메라', 'dslr', '액션캠',
      // 미용가전
      '드라이기', '고데기', '헤어', '전동', '면도기', '제모기', '마사지기',
      // 일반 가전 키워드
      '가전', '전자', '전기', '무선', '유선', '배터리', '충전', '와트', 'w', '인치', '리터', 'l',
      '조립', '설치', '소음', '전력', '에너지', '효율', '스마트', 'iot', '앱연동'
    ],
    cosmetics: [
      // 스킨케어
      '스킨', '토너', '로션', '에센스', '세럼', '크림', '앰플', '오일', '미스트',
      '클렌저', '클렌징', '폼', '워터', '밀크', '필링', '스크럽', '마스크팩', '패드',
      '선크림', '자외선', 'spf', '선스틱', '쿠션', '파운데이션',
      // 메이크업
      '립스틱', '립밤', '틴트', '립글로스', '아이라이너', '마스카라', '아이섀도', '블러셔', '하이라이터',
      '파우더', '컨실러', '프라이머', '베이스', '픽서', '세팅',
      // 헤어/바디
      '샴푸', '린스', '컨디셔너', '트리트먼트', '헤어오일', '헤어에센스', '왁스', '젤', '스프레이',
      '바디워시', '바디로션', '바디오일', '핸드크림', '풋크림',
      // 일반 화장품 키워드
      '화장품', '코스메틱', '뷰티', '메이크업', '스킨케어', '더마', '피부', '모공', '주름', '미백',
      '수분', '보습', '영양', '탄력', '발림', '흡수', '촉촉', '산뜻'
    ],
    fashion: [
      // 의류
      '티셔츠', '셔츠', '블라우스', '니트', '가디건', '자켓', '코트', '패딩', '점퍼', '후드',
      '청바지', '슬랙스', '치마', '스커트', '원피스', '반바지', '조거', '레깅스',
      // 신발
      '운동화', '스니커즈', '구두', '로퍼', '샌들', '슬리퍼', '부츠', '힐',
      // 가방/악세서리
      '가방', '백팩', '토트백', '크로스백', '클러치', '지갑', '벨트', '모자', '스카프',
      '목걸이', '반지', '귀걸이', '팔찌', '시계',
      // 속옷/양말
      '속옷', '브라', '팬티', '런닝', '양말', '스타킹',
      // 일반 패션 키워드
      '패션', '의류', '옷', '착용', '사이즈', '핏', 'xs', 's', 'm', 'l', 'xl', 'xxl',
      '신축성', '통기성', '소재', '원단', '면', '폴리', '울', '캐시미어', '린넨'
    ],
    furniture: [
      // 가구
      '소파', '침대', '매트리스', '책상', '의자', '테이블', '책장', '옷장', '서랍장', '화장대',
      '식탁', '거실장', 'tv장', '신발장', '수납장',
      // 인테리어
      '커튼', '블라인드', '러그', '카펫', '조명', '스탠드', '액자', '거울', '시계',
      // 침구
      '이불', '베개', '매트', '토퍼', '시트', '차렵이불',
      // 일반 가구 키워드
      '가구', '인테리어', '공간', '배치', '조립', '설치', '원목', '철제', '나무', '패브릭',
      '모던', '클래식', '미니멀', '북유럽'
    ],
    health: [
      '영양제', '비타민', '오메가', '유산균', '프로바이오틱스', '콜라겐', '루테인', '밀크씨슬',
      '마그네슘', '철분', '칼슘', '아연', '종합비타민',
      '건강식품', '보조제', '건강', '면역', '피로', '활력', '눈', '간', '장',
      '다이어트', '체중', '단백질', '프로틴'
    ],
    baby: [
      '유아', '아기', '신생아', '유모차', '카시트', '기저귀', '분유', '이유식', '젖병',
      '아이', '어린이', '키즈', '베이비', '아동복', '아동화',
      '육아', '출산', '임신', '산모'
    ],
    pet: [
      '강아지', '고양이', '반려동물', '펫', '사료', '간식', '장난감', '하우스', '캔', '슬', '파우치',
      '애견', '애묘', '반려견', '반려묘', '목줄', '배변패드'
    ],
    sports: [
      '운동', '헬스', '피트니스', '요가', '필라테스', '러닝', '자전거', '골프', '테니스', '수영',
      '등산', '캠핑', '낚시', '레저', '아웃도어',
      '덤벨', '바벨', '매트', '밴드', '폼롤러', '운동복', '트레이닝'
    ],
    general: []
  };

  const matchedKeywords: string[] = [];
  const categoryScores: Record<ProductCategory, number> = {
    food: 0, electronics: 0, cosmetics: 0, fashion: 0,
    furniture: 0, health: 0, baby: 0, pet: 0, sports: 0, general: 0
  };

  // 각 카테고리별 매칭 점수 계산
  for (const [category, keywords] of Object.entries(categoryKeywords) as [ProductCategory, string[]][]) {
    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) {
        categoryScores[category] += keyword.length; // 긴 키워드일수록 높은 점수
        matchedKeywords.push(keyword);
      }
    }
  }

  // 가장 높은 점수의 카테고리 선택
  let bestCategory: ProductCategory = 'general';
  let maxScore = 0;
  for (const [category, score] of Object.entries(categoryScores) as [ProductCategory, number][]) {
    if (score > maxScore) {
      maxScore = score;
      bestCategory = category;
    }
  }

  // 신뢰도 결정
  let confidence: 'high' | 'medium' | 'low' = 'low';
  if (maxScore >= 10) confidence = 'high';
  else if (maxScore >= 5) confidence = 'medium';

  // 카테고리 한국어 이름
  const categoryKoreanMap: Record<ProductCategory, string> = {
    food: '식품/농산물',
    electronics: '가전/전자제품',
    cosmetics: '화장품/스킨케어',
    fashion: '의류/패션',
    furniture: '가구/인테리어',
    health: '건강/영양제',
    baby: '유아/아동',
    pet: '반려동물',
    sports: '스포츠/레저',
    general: '일반 상품'
  };

  console.log(`[CategoryDetect] "${productName}" → ${bestCategory} (${categoryKoreanMap[bestCategory]}), 신뢰도: ${confidence}, 매칭: [${matchedKeywords.slice(0, 5).join(', ')}]`);

  return {
    category: bestCategory,
    categoryKorean: categoryKoreanMap[bestCategory],
    confidence,
    matchedKeywords: [...new Set(matchedKeywords)].slice(0, 10)
  };
}
