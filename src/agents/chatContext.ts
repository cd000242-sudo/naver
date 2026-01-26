/**
 * 대화 컨텍스트 관리 + 학습 기능
 */

import { ChatMessage, AgentLog } from './types.js';
import * as fs from 'fs';
import * as path from 'path';

// 학습 데이터 타입
interface LearningData {
  frequentQuestions: { question: string; count: number }[];
  userPreferences: {
    favoriteTopics: string[];
    preferredStyle: string;
    lastUsedKeywords: string[];
  };
  learnedPatterns: { pattern: string; response: string }[];
  lastUpdated: string;
}

export class ChatContext {
  private history: ChatMessage[] = [];
  private logs: AgentLog[] = [];
  private maxHistorySize: number = 50;
  private learningData: LearningData;
  private dataDir: string;
  
  constructor(maxHistorySize: number = 50) {
    this.maxHistorySize = maxHistorySize;
    this.dataDir = path.join(process.env.APPDATA || '', 'better-life-naver');
    this.learningData = this.loadLearningData();
  }
  
  // 학습 데이터 파일 경로
  private getLearningFilePath(): string {
    return path.join(this.dataDir, 'ai-learning.json');
  }
  
  // 학습 데이터 로드
  private loadLearningData(): LearningData {
    try {
      const filePath = this.getLearningFilePath();
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        console.log('[ChatContext] 학습 데이터 로드 완료');
        return JSON.parse(data);
      }
    } catch (error) {
      console.warn('[ChatContext] 학습 데이터 로드 실패:', error);
    }
    return {
      frequentQuestions: [],
      userPreferences: {
        favoriteTopics: [],
        preferredStyle: 'friendly',
        lastUsedKeywords: []
      },
      learnedPatterns: [],
      lastUpdated: new Date().toISOString()
    };
  }
  
  // 학습 데이터 저장
  saveLearningData(): void {
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
      this.learningData.lastUpdated = new Date().toISOString();
      fs.writeFileSync(this.getLearningFilePath(), JSON.stringify(this.learningData, null, 2));
      console.log('[ChatContext] 학습 데이터 저장 완료');
    } catch (error) {
      console.error('[ChatContext] 학습 데이터 저장 실패:', error);
    }
  }
  
  // 질문 패턴 학습
  learnFromQuestion(question: string): void {
    const normalizedQ = question.toLowerCase().trim();
    
    // 자주 묻는 질문 기록
    const existing = this.learningData.frequentQuestions.find(
      q => q.question.toLowerCase().includes(normalizedQ.slice(0, 20)) || 
           normalizedQ.includes(q.question.toLowerCase().slice(0, 20))
    );
    
    if (existing) {
      existing.count++;
    } else {
      this.learningData.frequentQuestions.push({ question: normalizedQ.slice(0, 100), count: 1 });
    }
    
    // 키워드 관련 질문이면 키워드 추출
    if (normalizedQ.includes('키워드') || normalizedQ.includes('검색어')) {
      const keywords = question.match(/["']([^"']+)["']|(\S+키워드)/g);
      if (keywords) {
        keywords.forEach(kw => {
          const cleanKw = kw.replace(/["']/g, '').trim();
          if (cleanKw && !this.learningData.userPreferences.lastUsedKeywords.includes(cleanKw)) {
            this.learningData.userPreferences.lastUsedKeywords.unshift(cleanKw);
            if (this.learningData.userPreferences.lastUsedKeywords.length > 10) {
              this.learningData.userPreferences.lastUsedKeywords.pop();
            }
          }
        });
      }
    }
    
    // 자동 저장 (10개 질문마다)
    if (this.history.length % 10 === 0) {
      this.saveLearningData();
    }
  }
  
  // 학습된 데이터 조회
  getLearningData(): LearningData {
    return this.learningData;
  }
  
  // 자주 묻는 질문 Top N 조회
  getTopQuestions(n: number = 5): { question: string; count: number }[] {
    return [...this.learningData.frequentQuestions]
      .sort((a, b) => b.count - a.count)
      .slice(0, n);
  }
  
  // 사용자 선호 키워드 조회
  getRecentKeywords(): string[] {
    return this.learningData.userPreferences.lastUsedKeywords;
  }
  
  // 메시지 추가
  addMessage(message: Omit<ChatMessage, 'id' | 'timestamp'>): ChatMessage {
    const fullMessage: ChatMessage = {
      ...message,
      id: this.generateId(),
      timestamp: new Date()
    };
    
    this.history.push(fullMessage);
    
    // 히스토리 크기 제한
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(-this.maxHistorySize);
    }
    
    return fullMessage;
  }
  
  // 사용자 메시지 추가 (편의 메서드)
  addUserMessage(content: string): ChatMessage {
    return this.addMessage({ role: 'user', content });
  }
  
  // 어시스턴트 메시지 추가 (편의 메서드)
  addAssistantMessage(content: string, agentUsed?: string): ChatMessage {
    return this.addMessage({ role: 'assistant', content, agentUsed });
  }
  
  // 히스토리 조회
  getHistory(limit?: number): ChatMessage[] {
    if (limit) {
      return this.history.slice(-limit);
    }
    return [...this.history];
  }
  
  // 마지막 N개 메시지 조회
  getLastMessages(count: number): ChatMessage[] {
    return this.history.slice(-count);
  }
  
  // 마지막 사용자 메시지
  getLastUserMessage(): ChatMessage | undefined {
    return [...this.history].reverse().find(m => m.role === 'user');
  }
  
  // 마지막 어시스턴트 메시지
  getLastAssistantMessage(): ChatMessage | undefined {
    return [...this.history].reverse().find(m => m.role === 'assistant');
  }
  
  // 히스토리 초기화
  clear(): void {
    this.history = [];
    this.logs = [];
  }
  
  // 특정 메시지 업데이트 (스트리밍용)
  updateMessage(id: string, updates: Partial<ChatMessage>): void {
    const index = this.history.findIndex(m => m.id === id);
    if (index !== -1) {
      this.history[index] = { ...this.history[index], ...updates };
    }
  }
  
  // 로그 추가
  addLog(log: Omit<AgentLog, 'timestamp'>): void {
    this.logs.push({
      ...log,
      timestamp: new Date()
    });
    
    // 로그 크기 제한
    if (this.logs.length > 100) {
      this.logs = this.logs.slice(-100);
    }
  }
  
  // 로그 조회
  getLogs(limit?: number): AgentLog[] {
    if (limit) {
      return this.logs.slice(-limit);
    }
    return [...this.logs];
  }
  
  // 대화 컨텍스트를 프롬프트용 문자열로 변환
  toPromptContext(limit: number = 10): string {
    const recentMessages = this.getLastMessages(limit);
    
    return recentMessages
      .map(m => {
        const role = m.role === 'user' ? '사용자' : 'AI';
        return `${role}: ${m.content}`;
      })
      .join('\n\n');
  }
  
  // 히스토리 크기
  get size(): number {
    return this.history.length;
  }
  
  // ID 생성
  private generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // 직렬화 (저장용)
  serialize(): string {
    return JSON.stringify({
      history: this.history,
      logs: this.logs
    });
  }
  
  // 역직렬화 (로드용)
  static deserialize(data: string): ChatContext {
    const parsed = JSON.parse(data);
    const context = new ChatContext();
    
    context.history = parsed.history.map((m: any) => ({
      ...m,
      timestamp: new Date(m.timestamp)
    }));
    
    context.logs = parsed.logs.map((l: any) => ({
      ...l,
      timestamp: new Date(l.timestamp)
    }));
    
    return context;
  }
}

// 싱글톤 인스턴스 (앱 전역에서 사용)
export const chatContext = new ChatContext();
