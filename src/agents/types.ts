/**
 * AI 에이전트 시스템 타입 정의
 */

// ==================== 질문 분류 ====================

export type QuestionCategory = 
  | 'APP_USAGE'        // 앱 사용법
  | 'SETTINGS'         // 설정 관련
  | 'FEATURE'          // 기능 설명
  | 'TROUBLESHOOTING'  // 문제 해결
  | 'ACTION_REQUEST'   // 작업 요청 (글 생성 등)
  | 'OUT_OF_SCOPE'     // 범위 밖 질문
  | 'AMBIGUOUS'        // 모호한 질문
  | 'GREETING'         // 인사
  | 'FEEDBACK';        // 피드백/감사

export interface ClassificationResult {
  category: QuestionCategory;
  confidence: number;           // 0-1
  suggestedAction: 'answer' | 'clarify' | 'refuse' | 'execute' | 'greet';
  matchedKeywords: string[];
  subCategory?: string;         // 세부 분류
  detectedIntent?: string;      // 감지된 의도
}

// ==================== 에이전트 결과 ====================

export interface AgentResult {
  success: boolean;
  response?: string;
  data?: any;
  actions?: ActionButton[];
  suggestFollowUp?: string[];
  error?: AgentError;
  metadata?: {
    processingTime: number;
    tokensUsed?: number;
    model?: string;
    agentChain?: string[];
  };
}

export interface AgentError {
  code: string;
  message: string;
  recoverable: boolean;
  suggestion?: string;
}

export interface ActionButton {
  id: string;
  label: string;
  action: string;
  icon?: string;
  primary?: boolean;
  data?: any;
}

// ==================== 대화 컨텍스트 ====================

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  agentUsed?: string;
  actions?: ActionButton[];
  isStreaming?: boolean;
}

export interface AgentLog {
  agent: string;
  message: string;
  timestamp: Date;
  level?: 'info' | 'warn' | 'error';
}

// ==================== 지식 베이스 ====================

export type KnowledgeCategory = 'manual' | 'settings' | 'troubleshooting' | 'faq' | 'feature';

export interface KnowledgeItem {
  id: string;
  category: KnowledgeCategory;
  keywords: string[];
  title: string;
  content: string;
  question?: string;      // FAQ용
  steps?: string[];       // 단계별 가이드
  tips?: string[];        // 추가 팁
  relatedTopics?: string[];
  lastUpdated: string;
}

// ==================== 페르소나 ====================

export interface AIPersona {
  name: string;
  personality: PersonalityTraits;
  expertise: string[];
  boundaries: BoundaryRules;
  responseStyle: ResponseStyle;
}

export interface PersonalityTraits {
  tone: string;
  style: string;
  emojiUsage: 'minimal' | 'moderate' | 'none';
  formalityLevel: number; // 1-10
}

export interface BoundaryRules {
  scope: string;
  refusalStyle: 'polite_but_firm' | 'apologetic' | 'redirect';
}

export interface ResponseStyle {
  maxLength: number;
  preferBulletPoints: boolean;
  includeExamples: boolean;
  suggestFollowUp: boolean;
}

// ==================== Gemini API 옵션 ====================

export interface GeminiCallOptions {
  stream?: boolean;
  onChunk?: (chunk: string) => void;
  maxTokens?: number;
  temperature?: number;
}

// ==================== 포맷된 응답 ====================

export interface FormattedResponse {
  message: string;
  actions?: ActionButton[];
  type: 'text' | 'with_actions' | 'progress' | 'error';
}
