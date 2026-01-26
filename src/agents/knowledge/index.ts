/**
 * 지식 베이스 시스템
 */

import { KnowledgeItem, KnowledgeCategory } from '../types.js';
import { appManualData } from './appManual.js';
import { settingsGuideData } from './settingsGuide.js';
import { troubleshootingData } from './troubleshooting.js';
import { faqData } from './faq.js';

export class KnowledgeBase {
  private items: KnowledgeItem[] = [];
  private keywordIndex: Map<string, Set<string>> = new Map();
  
  constructor() {
    this.loadKnowledge();
    this.buildIndex();
  }
  
  private loadKnowledge(): void {
    this.items = [
      ...appManualData,
      ...settingsGuideData,
      ...troubleshootingData,
      ...faqData
    ];
    console.log(`📚 [KnowledgeBase] ${this.items.length}개의 지식 항목 로드됨`);
  }
  
  private buildIndex(): void {
    for (const item of this.items) {
      for (const keyword of item.keywords) {
        const normalizedKeyword = this.normalizeKeyword(keyword);
        if (!this.keywordIndex.has(normalizedKeyword)) {
          this.keywordIndex.set(normalizedKeyword, new Set());
        }
        this.keywordIndex.get(normalizedKeyword)!.add(item.id);
      }
    }
    console.log(`🔍 [KnowledgeBase] ${this.keywordIndex.size}개의 키워드 인덱싱됨`);
  }
  
  // 검색 (키워드 매칭 + 텍스트 매칭)
  search(query: string, limit: number = 5): KnowledgeItem[] {
    const queryKeywords = this.extractKeywords(query);
    const scores: Map<string, number> = new Map();
    
    // 1. 키워드 매칭 점수
    for (const keyword of queryKeywords) {
      const normalized = this.normalizeKeyword(keyword);
      
      // 정확한 매칭
      const matchedIds = this.keywordIndex.get(normalized);
      if (matchedIds) {
        for (const id of matchedIds) {
          const currentScore = scores.get(id) || 0;
          scores.set(id, currentScore + 3); // 정확한 매칭 가중치
        }
      }
      
      // 부분 매칭
      for (const [indexKeyword, ids] of this.keywordIndex) {
        if (indexKeyword.includes(normalized) || normalized.includes(indexKeyword)) {
          for (const id of ids) {
            const currentScore = scores.get(id) || 0;
            scores.set(id, currentScore + 1); // 부분 매칭 가중치
          }
        }
      }
    }
    
    // 2. 제목/내용 매칭 점수
    for (const item of this.items) {
      const titleMatch = this.calculateTextMatch(query, item.title);
      const contentMatch = this.calculateTextMatch(query, item.content);
      const questionMatch = item.question 
        ? this.calculateTextMatch(query, item.question) 
        : 0;
      
      if (titleMatch > 0 || contentMatch > 0 || questionMatch > 0) {
        const currentScore = scores.get(item.id) || 0;
        scores.set(item.id, currentScore + titleMatch * 4 + contentMatch + questionMatch * 3);
      }
    }
    
    // 3. 점수로 정렬 및 상위 N개 반환
    const sortedIds = [...scores.entries()]
      .filter(([_, score]) => score > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => id);
    
    return sortedIds
      .map(id => this.items.find(item => item.id === id)!)
      .filter(Boolean);
  }
  
  // 카테고리별 조회
  getByCategory(category: KnowledgeCategory): KnowledgeItem[] {
    return this.items.filter(item => item.category === category);
  }
  
  // ID로 조회
  getById(id: string): KnowledgeItem | undefined {
    return this.items.find(item => item.id === id);
  }
  
  // 관련 주제 조회
  getRelated(itemId: string, limit: number = 3): KnowledgeItem[] {
    const item = this.getById(itemId);
    if (!item?.relatedTopics) return [];
    
    return item.relatedTopics
      .slice(0, limit)
      .map(id => this.getById(id))
      .filter(Boolean) as KnowledgeItem[];
  }
  
  // 모든 항목 조회
  getAll(): KnowledgeItem[] {
    return [...this.items];
  }
  
  // 키워드 추출 (한국어 형태소 분석 간소화)
  private extractKeywords(text: string): string[] {
    // 특수문자 제거 및 공백으로 분리
    const words = text
      .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length >= 2);
    
    // 불용어 제거
    const stopwords = [
      '어떻게', '하는', '뭐야', '뭔가', '있나요', '해줘', '해주세요',
      '으로', '에서', '이', '가', '을', '를', '은', '는', '의', '와', '과',
      '좀', '그', '저', '이런', '저런', '그런', '뭐', '왜', '어디'
    ];
    return words.filter(word => !stopwords.includes(word));
  }
  
  private normalizeKeyword(keyword: string): string {
    return keyword.toLowerCase().trim();
  }
  
  private calculateTextMatch(query: string, text: string): number {
    const queryLower = query.toLowerCase();
    const textLower = text.toLowerCase();
    
    // 정확한 포함
    if (textLower.includes(queryLower)) return 2;
    
    // 단어 단위 매칭
    const queryWords = queryLower.split(/\s+/).filter(w => w.length >= 2);
    const matchCount = queryWords.filter(word => textLower.includes(word)).length;
    
    return queryWords.length > 0 ? matchCount / queryWords.length : 0;
  }
}

// 싱글톤 인스턴스
export const knowledgeBase = new KnowledgeBase();
