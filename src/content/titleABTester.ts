// ✅ AI 제목 A/B 테스트 기능
// 여러 제목 후보를 생성하고 CTR 높은 제목을 추천

export type TitleCandidate = {
  id: string;
  title: string;
  style: TitleStyle;
  score: number; // 예상 CTR 점수 (0-100)
  reasons: string[];
};

export type TitleStyle = 
  | 'curiosity'    // 호기심 유발
  | 'benefit'      // 혜택 강조
  | 'urgency'      // 긴급성
  | 'question'     // 질문형
  | 'howto'        // 방법 제시
  | 'listicle'     // 리스트형
  | 'emotional'    // 감성적
  | 'factual';     // 사실 기반

export type ABTestResult = {
  keyword: string;
  candidates: TitleCandidate[];
  recommendedTitle: TitleCandidate;
  generatedAt: string;
};

// ✅ 현재 연도 자동 계산
const CURRENT_YEAR = new Date().getFullYear();

// ✅ 스타일별 제목 템플릿 (서브키워드 2개 포함 버전)
const TITLE_TEMPLATES: Record<TitleStyle, string[]> = {
  curiosity: [
    '{keyword} {sub1} {sub2}, 이렇게 하면 확 달라집니다',
    '{keyword} {sub1} 꿀팁, {sub2}까지 알려드려요',
    '왜 {keyword} {sub1}가 중요할까? {sub2} 비법 공개',
    '{keyword} {sub1} 핵심정리, {sub2} 노하우까지',
  ],
  benefit: [
    '{keyword} {sub1} {sub2} 효과, 직접 해본 솔직후기',
    '{keyword} {sub1} 장점 5가지, {sub2}까지 총정리',
    '{keyword} {sub1} 활용법, {sub2} 꿀팁 대방출',
    '{keyword} {sub1} {sub2}, 이것만 알면 끝',
  ],
  urgency: [
    '{keyword} {sub1} {sub2}, 지금 확인 안 하면 손해',
    '{keyword} {sub1} 핵심포인트, {sub2} 필수 체크',
    '놓치면 후회할 {keyword} {sub1} {sub2} 정보',
    '{keyword} {sub1} {sub2}, 빨리 알았으면 좋았을 것들',
  ],
  question: [
    '{keyword} {sub1} {sub2}, 정말 효과 있을까?',
    '{keyword} {sub1} 어떻게 할까? {sub2} 방법 공개',
    '{keyword} {sub1} vs {sub2}, 뭐가 더 좋을까?',
    '{keyword} {sub1} 고민이라면? {sub2} 해결법',
  ],
  howto: [
    '{keyword} {sub1} {sub2} 완벽 가이드 (초보용)',
    '{keyword} {sub1} 하는 법, {sub2}까지 단계별 설명',
    '{keyword} {sub1} {sub2} 따라하기, 누구나 쉽게',
    '{keyword} {sub1} 방법 총정리, {sub2} 팁 포함',
  ],
  listicle: [
    '{keyword} {sub1} {sub2} BEST 5 추천',
    '{keyword} {sub1} 꼭 알아야 할 것들, {sub2} 포함',
    '{keyword} {sub1} TOP 7, {sub2} 비교 분석',
    '{keyword} {sub1} {sub2} 체크리스트 총정리',
  ],
  emotional: [
    '{keyword} {sub1} {sub2}, 직접 경험한 솔직 후기',
    '{keyword} {sub1} 이야기, {sub2}까지 담았어요',
    '{keyword} {sub1} 리얼 후기, {sub2} 느낀 점',
    '{keyword} {sub1} {sub2}, 써보고 느낀 것들',
  ],
  factual: [
    `{keyword} {sub1} {sub2} ${CURRENT_YEAR}년 최신 정보`,
    '{keyword} {sub1} 비교분석, {sub2} 장단점',
    '{keyword} {sub1} 실제 후기, {sub2} 비교까지',
    `{keyword} {sub1} {sub2} ${CURRENT_YEAR} 트렌드 총정리`,
  ],
};

// ✅ 스타일별 CTR 가중치 (카테고리별)
const STYLE_WEIGHTS: Record<string, Record<TitleStyle, number>> = {
  default: {
    curiosity: 85,
    benefit: 80,
    urgency: 75,
    question: 78,
    howto: 82,
    listicle: 88,
    emotional: 70,
    factual: 75,
  },
  news: {
    curiosity: 90,
    benefit: 70,
    urgency: 95,
    question: 85,
    howto: 60,
    listicle: 75,
    emotional: 80,
    factual: 85,
  },
  entertainment: {
    curiosity: 92,
    benefit: 65,
    urgency: 80,
    question: 88,
    howto: 55,
    listicle: 85,
    emotional: 90,
    factual: 60,
  },
  tech: {
    curiosity: 75,
    benefit: 85,
    urgency: 65,
    question: 70,
    howto: 95,
    listicle: 90,
    emotional: 50,
    factual: 88,
  },
  lifestyle: {
    curiosity: 80,
    benefit: 90,
    urgency: 70,
    question: 82,
    howto: 88,
    listicle: 85,
    emotional: 85,
    factual: 70,
  },
};

// ✅ CTR 향상 키워드
const CTR_BOOST_WORDS = [
  { word: '무료', boost: 10 },
  { word: '최신', boost: 8 },
  { word: '완벽', boost: 7 },
  { word: '쉽게', boost: 6 },
  { word: '빠르게', boost: 6 },
  { word: '비밀', boost: 9 },
  { word: '꿀팁', boost: 8 },
  { word: '필수', boost: 7 },
  { word: '추천', boost: 6 },
  { word: '후기', boost: 8 },
  { word: '비교', boost: 7 },
  { word: '정리', boost: 5 },
  { word: '총정리', boost: 8 },
  { word: '솔직', boost: 7 },
  { word: '실제', boost: 6 },
];

// ✅ 키워드 유형 정의
type KeywordType = 'person' | 'place' | 'product' | 'topic' | 'method';

// ✅ 키워드별 정보 매핑 (유형 + 서브키워드)
const KEYWORD_INFO: Record<string, { type: KeywordType; subs: string[] }> = {
  // 인물 (축구선수 등)
  '메시': { type: 'person', subs: ['발롱도르', '월드컵 우승', '인터마이애미', '아르헨티나', '통산 골', '득점왕', '레전드', '경기 일정'] },
  '손흥민': { type: 'person', subs: ['토트넘', 'EPL', '득점', '어시스트', '경기 일정', '하이라이트', '골 모음', '활약상'] },
  '호날두': { type: 'person', subs: ['알나스르', '레알마드리드', '통산 골', '득점', '레전드', '경기력', '기록'] },
  // 장소
  '맛집': { type: 'place', subs: ['추천', '메뉴', '가격', '위치', '분위기', '후기', '예약', '웨이팅'] },
  '카페': { type: 'place', subs: ['추천', '분위기', '메뉴', '인테리어', '위치', '후기', '디저트', '커피'] },
  '여행': { type: 'place', subs: ['코스', '숙소', '맛집', '일정', '비용', '후기', '명소', '교통'] },
  // 제품
  '다이어트': { type: 'product', subs: ['식단', '운동', '체중감량', '건강', '식이조절', '칼로리', '효과', '방법'] },
  '인테리어': { type: 'product', subs: ['셀프', '비용', '업체', '추천', '아이디어', '트렌드', '거실', '방'] },
  // 주제/방법
  '부동산': { type: 'topic', subs: ['시세', '전망', '투자', '매매', '전세', '청약', '분석', '추천'] },
  '주식': { type: 'topic', subs: ['추천', '분석', '전망', '종목', '투자', '수익', '차트', '매수'] },
  '영어': { type: 'method', subs: ['공부법', '회화', '단어', '문법', '독학', '학원', '인강', '시험'] },
  '코딩': { type: 'method', subs: ['입문', '독학', '강의', '언어', '프로젝트', '취업', '부트캠프', '추천'] },
  '헬스': { type: 'method', subs: ['루틴', '운동법', '초보', '식단', 'PT', '홈트', '근육', '효과'] },
};

// ✅ 유형별 제목 템플릿 (키워드 맥락에 맞게)
const TYPE_TEMPLATES: Record<KeywordType, string[]> = {
  person: [
    `{keyword} {sub1} {sub2} ${CURRENT_YEAR} 총정리`,
    '{keyword} {sub1} 소식, {sub2}까지 한눈에',
    '{keyword} {sub1} 근황, {sub2} 업데이트',
    '{keyword} {sub1} {sub2} 최신 소식 정리',
    '{keyword} {sub1} 분석, {sub2} 현황',
  ],
  place: [
    '{keyword} {sub1} {sub2} BEST 추천',
    '{keyword} {sub1} 솔직 후기, {sub2}까지 총정리',
    '{keyword} {sub1} {sub2} 가볼만한 곳 추천',
    '{keyword} {sub1} 완벽 가이드, {sub2} 정보',
    '{keyword} {sub1} {sub2} 리얼 방문 후기',
  ],
  product: [
    '{keyword} {sub1} {sub2} 효과 솔직 후기',
    '{keyword} {sub1} 비교, {sub2} 장단점 분석',
    '{keyword} {sub1} {sub2} 추천 TOP 5',
    '{keyword} {sub1} 선택 가이드, {sub2} 팁',
    '{keyword} {sub1} {sub2} 실제 사용 리뷰',
  ],
  topic: [
    `{keyword} {sub1} {sub2} ${CURRENT_YEAR} 전망`,
    '{keyword} {sub1} 분석, {sub2} 핵심 정리',
    '{keyword} {sub1} {sub2} 알아야 할 것들',
    '{keyword} {sub1} 완벽 정리, {sub2} 포함',
    '{keyword} {sub1} {sub2} 최신 트렌드',
  ],
  method: [
    '{keyword} {sub1} {sub2} 완벽 가이드',
    '{keyword} {sub1} 하는 법, {sub2} 팁 포함',
    '{keyword} {sub1} {sub2} 초보자 필독',
    '{keyword} {sub1} 효과적인 방법, {sub2} 노하우',
    '{keyword} {sub1} {sub2} 단계별 정리',
  ],
};

// ✅ 기본 서브키워드 (매핑이 없을 때)
const DEFAULT_SUB_KEYWORDS = ['추천', '정보', '후기', '비교', '정리', '팁', '가이드', '분석'];

export class TitleABTester {
  // ✅ 키워드 정보 가져오기 (유형 + 서브키워드)
  private getKeywordInfo(keyword: string): { type: KeywordType; subs: string[] } {
    // 정확한 키워드 매핑 찾기
    let info = KEYWORD_INFO[keyword];
    
    // 없으면 키워드 일부 매칭 시도
    if (!info) {
      for (const [key, data] of Object.entries(KEYWORD_INFO)) {
        if (keyword.includes(key) || key.includes(keyword)) {
          info = data;
          break;
        }
      }
    }
    
    // 그래도 없으면 기본값 (topic 유형)
    if (!info) {
      info = { type: 'topic', subs: DEFAULT_SUB_KEYWORDS };
    }
    
    return info;
  }

  // ✅ 키워드에 맞는 서브키워드 2개 선택
  private getSubKeywords(keyword: string): [string, string] {
    const info = this.getKeywordInfo(keyword);
    const shuffled = [...info.subs].sort(() => Math.random() - 0.5);
    return [shuffled[0], shuffled[1]];
  }

  // ✅ 제목 후보 생성 (키워드 유형에 맞는 제목)
  generateTitleCandidates(
    keyword: string,
    category?: string,
    count: number = 5
  ): ABTestResult {
    const candidates: TitleCandidate[] = [];
    const weights = STYLE_WEIGHTS[category || 'default'] || STYLE_WEIGHTS.default;
    
    // ✅ 키워드 유형 파악
    const keywordInfo = this.getKeywordInfo(keyword);
    const keywordType = keywordInfo.type;
    
    // ✅ 키워드 유형에 맞는 템플릿 사용
    const typeTemplates = TYPE_TEMPLATES[keywordType];
    
    // 유형별 템플릿에서 제목 생성
    for (let i = 0; i < typeTemplates.length; i++) {
      const template = typeTemplates[i];
      
      // ✅ 서브키워드 2개 선택 (매번 다르게)
      const [sub1, sub2] = this.getSubKeywords(keyword);
      
      // ✅ 키워드 + 서브키워드 치환
      const title = template
        .replace('{keyword}', keyword)
        .replace('{sub1}', sub1)
        .replace('{sub2}', sub2);
      
      // 스타일 매핑 (유형별로 다른 스타일)
      const styleMap: Record<number, TitleStyle> = {
        0: 'factual',
        1: 'curiosity',
        2: 'benefit',
        3: 'listicle',
        4: 'howto',
      };
      const style = styleMap[i] || 'factual';
      
      // 점수 계산
      const baseScore = weights[style];
      const boostScore = this.calculateBoostScore(title);
      const lengthPenalty = this.calculateLengthPenalty(title);
      const score = Math.min(100, Math.max(0, baseScore + boostScore - lengthPenalty));
      
      candidates.push({
        id: `title_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title,
        style,
        score,
        reasons: this.generateReasons(style, score, title),
      });
    }
    
    // 점수순 정렬
    candidates.sort((a, b) => b.score - a.score);
    
    // 상위 N개만 반환
    const topCandidates = candidates.slice(0, count);
    
    return {
      keyword,
      candidates: topCandidates,
      recommendedTitle: topCandidates[0],
      generatedAt: new Date().toISOString(),
    };
  }

  // ✅ CTR 부스트 점수 계산
  private calculateBoostScore(title: string): number {
    let boost = 0;
    
    for (const { word, boost: wordBoost } of CTR_BOOST_WORDS) {
      if (title.includes(word)) {
        boost += wordBoost;
      }
    }
    
    // 숫자 포함 보너스
    if (/\d+/.test(title)) {
      boost += 5;
    }
    
    // 이모지 포함 보너스 (적당히)
    const emojiCount = (title.match(/[\u{1F300}-\u{1F9FF}]/gu) || []).length;
    if (emojiCount === 1) boost += 3;
    else if (emojiCount > 1) boost -= 2;
    
    return boost;
  }

  // ✅ 길이 패널티 계산
  private calculateLengthPenalty(title: string): number {
    const length = title.length;
    
    // 최적 길이: 20-35자
    if (length >= 20 && length <= 35) return 0;
    if (length < 15) return 10;
    if (length > 45) return 15;
    if (length > 40) return 10;
    if (length < 20) return 5;
    
    return 0;
  }

  // ✅ 추천 이유 생성
  private generateReasons(style: TitleStyle, score: number, title: string): string[] {
    const reasons: string[] = [];
    
    // 스타일별 이유
    const styleReasons: Record<TitleStyle, string> = {
      curiosity: '호기심을 자극하여 클릭을 유도합니다.',
      benefit: '독자에게 명확한 혜택을 제시합니다.',
      urgency: '긴급성을 부여하여 즉각적인 행동을 유도합니다.',
      question: '질문형으로 독자의 공감을 이끌어냅니다.',
      howto: '실용적인 정보를 약속하여 신뢰를 줍니다.',
      listicle: '숫자로 명확한 정보량을 제시합니다.',
      emotional: '감성적 연결로 공유를 유도합니다.',
      factual: '신뢰할 수 있는 정보임을 강조합니다.',
    };
    
    reasons.push(styleReasons[style]);
    
    // 점수별 이유
    if (score >= 85) {
      reasons.push('🔥 높은 CTR이 예상됩니다.');
    } else if (score >= 70) {
      reasons.push('✅ 양호한 CTR이 예상됩니다.');
    }
    
    // 길이 이유
    if (title.length >= 20 && title.length <= 35) {
      reasons.push('📏 최적의 제목 길이입니다.');
    }
    
    // 부스트 워드 이유
    for (const { word } of CTR_BOOST_WORDS.slice(0, 5)) {
      if (title.includes(word)) {
        reasons.push(`💡 "${word}" 키워드가 CTR을 높입니다.`);
        break;
      }
    }
    
    return reasons;
  }

  // ✅ 커스텀 제목 점수 평가
  evaluateTitle(title: string, category?: string): TitleCandidate {
    const weights = STYLE_WEIGHTS[category || 'default'] || STYLE_WEIGHTS.default;
    
    // 스타일 감지
    const style = this.detectStyle(title);
    
    // 점수 계산
    const baseScore = weights[style];
    const boostScore = this.calculateBoostScore(title);
    const lengthPenalty = this.calculateLengthPenalty(title);
    const score = Math.min(100, Math.max(0, baseScore + boostScore - lengthPenalty));
    
    return {
      id: `eval_${Date.now()}`,
      title,
      style,
      score,
      reasons: this.generateReasons(style, score, title),
    };
  }

  // ✅ 제목 스타일 감지
  private detectStyle(title: string): TitleStyle {
    if (title.includes('?') || title.includes('까')) return 'question';
    if (/\d+/.test(title) && (title.includes('가지') || title.includes('TOP') || title.includes('베스트'))) return 'listicle';
    if (title.includes('방법') || title.includes('하는 법') || title.includes('가이드')) return 'howto';
    if (title.includes('지금') || title.includes('마감') || title.includes('서두')) return 'urgency';
    if (title.includes('비밀') || title.includes('진실') || title.includes('숨겨진')) return 'curiosity';
    if (title.includes('효과') || title.includes('혜택') || title.includes('장점')) return 'benefit';
    if (title.includes('감동') || title.includes('행복') || title.includes('따뜻')) return 'emotional';
    
    return 'factual';
  }

  // ✅ 제목 개선 제안
  suggestImprovements(title: string): string[] {
    const suggestions: string[] = [];
    
    // 길이 체크
    if (title.length < 15) {
      suggestions.push('제목이 너무 짧습니다. 20-35자가 최적입니다.');
    } else if (title.length > 45) {
      suggestions.push('제목이 너무 깁니다. 45자 이내로 줄여보세요.');
    }
    
    // 숫자 체크
    if (!/\d+/.test(title)) {
      suggestions.push('숫자를 추가하면 CTR이 높아집니다. (예: "5가지", "TOP 10")');
    }
    
    // 부스트 워드 체크
    const hasBoostWord = CTR_BOOST_WORDS.some(({ word }) => title.includes(word));
    if (!hasBoostWord) {
      suggestions.push('CTR 향상 키워드를 추가해보세요: 무료, 최신, 완벽, 꿀팁, 후기 등');
    }
    
    // 질문형 체크
    if (!title.includes('?') && !title.includes('까')) {
      suggestions.push('질문형 제목은 클릭률이 높습니다. "~할까요?", "~일까?" 형태를 고려해보세요.');
    }
    
    return suggestions;
  }

  // ✅ 사용 가능한 스타일 목록
  getAvailableStyles(): TitleStyle[] {
    return Object.keys(TITLE_TEMPLATES) as TitleStyle[];
  }
}
