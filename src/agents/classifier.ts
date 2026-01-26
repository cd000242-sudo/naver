/**
 * 질문 분류기
 */

import { QuestionCategory, ClassificationResult } from './types.js';
import { ChatContext } from './chatContext.js';

export class QuestionClassifier {
  // 키워드 사전
  private readonly SCOPE_KEYWORDS = {
    inScope: {
      feature: ['글', '생성', '작성', '발행', '이미지', '사진', '블로그', '네이버', 
                'SEO', '홈피드', '크롤링', '분석', '트렌드', '키워드', '콘텐츠'],
      settings: ['설정', 'API', '키', 'Gemini', '제미나이', '환경설정', '저장', 
                 '경로', '모델', '무료', '유료', '로그인', '계정', '환경'],
      howTo: ['어떻게', '방법', '사용', '하는법', '뭐야', '뭔가요', '알려줘', 
              '가르쳐', '어디', '언제', '뭘', '무엇'],
      problem: ['안돼', '실패', '에러', '오류', '문제', '왜', '고장', '안되', 
                '느려', '안나와', '안해', '못해'],
      action: ['해줘', '해주세요', '만들어', '생성해', '써줘', '작성해', 
               '발행해', '분석해', '검색해', '찾아줘']
    },
    
    outOfScope: {
      general: ['날씨', '뉴스', '주식', '코인', '환율', '번역', '계산', '시간'],
      coding: ['코딩', '프로그래밍', '파이썬', '자바', '코드', '스크립트', '개발', 'javascript'],
      personal: ['연애', '진로', '취업', '면접', '건강', '병원', '약', '다이어트'],
      entertainment: ['게임', '영화', '음악', '맛집', '여행', '추천해줘', '드라마'],
      sensitive: ['정치', '종교', '투표', '대통령', '선거']
    }
  };
  
  // 인사 패턴
  private readonly GREETING_PATTERNS = [
    /^안녕/,
    /^하이/,
    /^hello/i,
    /^hi$/i,
    /반가워/,
    /^ㅎㅇ$/,
    /^헬로/
  ];
  
  // 감사/피드백 패턴
  private readonly FEEDBACK_PATTERNS = [
    /고마워/,
    /감사/,
    /땡큐/,
    /thanks/i,
    /잘했어/,
    /좋아$/,
    /최고/,
    /굿/
  ];
  
  classify(message: string, context?: ChatContext): ClassificationResult {
    const lowerMessage = message.toLowerCase().trim();
    
    // 1. 인사 체크
    if (this.isGreeting(lowerMessage)) {
      return {
        category: 'GREETING',
        confidence: 0.95,
        suggestedAction: 'greet',
        matchedKeywords: []
      };
    }
    
    // 2. 피드백 체크
    if (this.isFeedback(lowerMessage)) {
      return {
        category: 'FEEDBACK',
        confidence: 0.9,
        suggestedAction: 'greet',
        matchedKeywords: []
      };
    }
    
    // 3. 범위 밖 키워드 체크 (우선)
    const outOfScopeMatch = this.matchOutOfScope(lowerMessage);
    if (outOfScopeMatch.confidence > 0.6) {
      // 범위 내 키워드도 있는지 확인 (혼합된 경우)
      const inScopeMatch = this.matchInScope(lowerMessage);
      if (inScopeMatch.confidence > outOfScopeMatch.confidence) {
        // 범위 내 키워드가 더 많으면 범위 내로 처리
      } else {
        return {
          category: 'OUT_OF_SCOPE',
          confidence: outOfScopeMatch.confidence,
          suggestedAction: 'refuse',
          matchedKeywords: outOfScopeMatch.keywords,
          subCategory: outOfScopeMatch.subCategory
        };
      }
    }
    
    // 4. 범위 내 키워드 매칭
    const inScopeMatch = this.matchInScope(lowerMessage);
    
    if (inScopeMatch.confidence > 0.4) {
      // 작업 요청인지 질문인지 구분
      const isActionRequest = this.SCOPE_KEYWORDS.inScope.action
        .some(kw => lowerMessage.includes(kw));
      
      if (isActionRequest) {
        return {
          category: 'ACTION_REQUEST',
          confidence: inScopeMatch.confidence,
          suggestedAction: 'execute',
          matchedKeywords: inScopeMatch.keywords,
          detectedIntent: this.detectActionIntent(lowerMessage)
        };
      }
      
      // 카테고리 세분화
      const category = this.determineCategory(inScopeMatch);
      return {
        category,
        confidence: inScopeMatch.confidence,
        suggestedAction: 'answer',
        matchedKeywords: inScopeMatch.keywords
      };
    }
    
    // 5. 모호한 경우
    return {
      category: 'AMBIGUOUS',
      confidence: 0.5,
      suggestedAction: 'clarify',
      matchedKeywords: inScopeMatch.keywords
    };
  }
  
  private isGreeting(message: string): boolean {
    // 짧은 인사만 인사로 처리 (긴 문장은 질문일 수 있음)
    if (message.length > 20) return false;
    return this.GREETING_PATTERNS.some(pattern => pattern.test(message));
  }
  
  private isFeedback(message: string): boolean {
    if (message.length > 30) return false;
    return this.FEEDBACK_PATTERNS.some(pattern => pattern.test(message));
  }
  
  private matchOutOfScope(message: string): {
    confidence: number;
    keywords: string[];
    subCategory: string;
  } {
    let maxConfidence = 0;
    let matchedKeywords: string[] = [];
    let subCategory = '';
    
    for (const [category, keywords] of Object.entries(this.SCOPE_KEYWORDS.outOfScope)) {
      const matched = keywords.filter(kw => message.includes(kw));
      const confidence = matched.length > 0 ? Math.min(matched.length * 0.4, 1) : 0;
      
      if (confidence > maxConfidence) {
        maxConfidence = confidence;
        matchedKeywords = matched;
        subCategory = category;
      }
    }
    
    return { confidence: maxConfidence, keywords: matchedKeywords, subCategory };
  }
  
  private matchInScope(message: string): {
    confidence: number;
    keywords: string[];
    categories: string[];
  } {
    let totalMatched: string[] = [];
    let matchedCategories: string[] = [];
    
    for (const [category, keywords] of Object.entries(this.SCOPE_KEYWORDS.inScope)) {
      const matched = keywords.filter(kw => message.includes(kw));
      if (matched.length > 0) {
        totalMatched.push(...matched);
        matchedCategories.push(category);
      }
    }
    
    const confidence = Math.min(totalMatched.length * 0.25, 1);
    return {
      confidence,
      keywords: [...new Set(totalMatched)],
      categories: matchedCategories
    };
  }
  
  private determineCategory(match: { categories: string[] }): QuestionCategory {
    if (match.categories.includes('problem')) return 'TROUBLESHOOTING';
    if (match.categories.includes('settings')) return 'SETTINGS';
    if (match.categories.includes('howTo')) return 'APP_USAGE';
    if (match.categories.includes('feature')) return 'FEATURE';
    return 'APP_USAGE';
  }
  
  private detectActionIntent(message: string): string {
    if (/글|작성|써/.test(message)) return 'WRITE';
    if (/수정|바꿔|고쳐/.test(message)) return 'EDIT';
    if (/이미지|사진|그림/.test(message)) return 'IMAGE';
    if (/발행|게시|올려/.test(message)) return 'PUBLISH';
    if (/분석|트렌드|키워드/.test(message)) return 'ANALYZE';
    return 'WRITE';
  }
}

// 싱글톤 인스턴스
export const questionClassifier = new QuestionClassifier();
