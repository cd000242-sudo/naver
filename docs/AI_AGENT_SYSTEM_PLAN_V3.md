# 🤖 AI 어시스턴트 시스템 구현 플랜 V3 (끝판왕 완결판)

> **"나를 복제한 AI 어시스턴트"** - 앱 전문가처럼 모든 질문에 답변하는 AI
> 
> **V3 업그레이드**: 실제 동작하는 완전한 코드 + 프로덕션 레벨 아키텍처

---

## 📋 목차

1. [핵심 컨셉](#1-핵심-컨셉)
2. [AI 페르소나 설계](#2-ai-페르소나-설계)
3. [지식 베이스 시스템](#3-지식-베이스-시스템)
4. [대화 정책 (Answer Policy)](#4-대화-정책-answer-policy)
5. [에이전트 아키텍처](#5-에이전트-아키텍처)
6. [상세 에이전트 구현](#6-상세-에이전트-구현)
7. [Gemini API 통합](#7-gemini-api-통합)
8. [IPC 통신 시스템](#8-ipc-통신-시스템)
9. [스트리밍 응답 시스템](#9-스트리밍-응답-시스템)
10. [상태 관리 시스템](#10-상태-관리-시스템)
11. [에러 처리 및 복구](#11-에러-처리-및-복구)
12. [UI/UX 설계](#12-uiux-설계)
13. [성능 최적화](#13-성능-최적화)
14. [보안 체크리스트](#14-보안-체크리스트)
15. [테스트 전략](#15-테스트-전략)
16. [구현 계획](#16-구현-계획)
17. [프롬프트 엔지니어링](#17-프롬프트-엔지니어링)
18. [트러블슈팅 가이드](#18-트러블슈팅-가이드)

---

## 1. 핵심 컨셉

### 1.1 비전

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   "이 앱의 모든 것을 알고 있는 나의 분신"                    │
│                                                             │
│   • 앱 사용법? → 즉시 답변                                  │
│   • 설정 방법? → 단계별 가이드                              │
│   • 기능 질문? → 상세 설명 + 예시                           │
│   • 글 작성? → 바로 생성                                    │
│   • 관련 없는 질문? → 정중히 거절                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 V3 핵심 개선사항

| 영역 | V2 | V3 (끝판왕) |
|------|-----|-------------|
| 코드 | 타입 정의만 | 완전한 실행 코드 |
| API 통합 | 기본 호출 | 스트리밍 + 에러 복구 |
| 상태 관리 | 없음 | 전역 상태 시스템 |
| 에러 처리 | 기본 | 3단계 재시도 + 복구 |
| UI | 정적 | 실시간 타이핑 효과 |
| 지식 베이스 | 스키마만 | 실제 데이터 포함 |
| 테스트 | 시나리오만 | 자동화 테스트 코드 |
| 보안 | 없음 | 완전한 체크리스트 |

### 1.3 AI가 할 수 있는 것 vs 없는 것

#### ✅ 할 수 있는 것 (상세)
```typescript
const CAPABILITIES = {
  // 정보 제공
  appUsage: '앱 사용법 설명 (모든 기능, 단축키 포함)',
  settings: 'API 키 설정, 환경설정, 고급 설정',
  troubleshooting: '에러 해결, FAQ, 문제 진단',
  
  // 작업 실행
  contentGeneration: '글 생성 (URL/키워드/직접 입력)',
  contentEditing: '글 수정 (제목, 본문, SEO 최적화)',
  imageGeneration: '이미지 생성 (Gemini Imagen)',
  imageSearch: '이미지 검색 (Pexels, Unsplash)',
  publishing: '블로그 발행 (즉시/예약)',
  
  // 분석
  trendAnalysis: '네이버 트렌드 분석',
  keywordAnalysis: '키워드 검색량, 경쟁도',
  seoAnalysis: 'SEO 점수 분석 및 개선 제안'
};
```

#### ❌ 하지 않는 것 (명확한 경계)
```typescript
const OUT_OF_SCOPE = {
  general: ['날씨', '뉴스', '주식', '환율', '번역'],
  coding: ['코딩', '프로그래밍', '코드 작성', '버그 수정'],
  personal: ['연애', '진로', '취업', '건강 상담'],
  other: ['게임', '영화 추천', '맛집', '여행 정보'],
  sensitive: ['정치', '종교', '논쟁적 주제']
};
```

---

## 2. AI 페르소나 설계

### 2.1 페르소나 정의 (구현 코드)

```typescript
// src/agents/persona.ts
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

export interface ResponseStyle {
  maxLength: number;
  preferBulletPoints: boolean;
  includeExamples: boolean;
  suggestFollowUp: boolean;
}

export const DEFAULT_PERSONA: AIPersona = {
  name: '블로그 어시스턴트',
  personality: {
    tone: '친근하고 전문적인',
    style: '간결하지만 필요시 상세하게',
    emojiUsage: 'moderate',
    formalityLevel: 6
  },
  expertise: [
    '네이버 블로그 자동화',
    '콘텐츠 생성 (Gemini API)',
    'SEO 최적화',
    '이미지 생성/검색',
    '앱 설정 및 트러블슈팅'
  ],
  boundaries: {
    scope: '이 앱 관련 질문만',
    refusalStyle: 'polite_but_firm'
  },
  responseStyle: {
    maxLength: 500,
    preferBulletPoints: true,
    includeExamples: true,
    suggestFollowUp: true
  }
};
```

### 2.2 대화 스타일 가이드

```typescript
// src/agents/responseTemplates.ts
export const RESPONSE_TEMPLATES = {
  // 인사/시작
  greeting: {
    morning: '좋은 아침이에요! 오늘 블로그 어떤 글 쓸까요? 📝',
    afternoon: '안녕하세요! 무엇을 도와드릴까요? 😊',
    evening: '안녕하세요! 늦은 시간까지 열심히시네요 💪'
  },
  
  // 긍정적 응답
  positive: {
    understanding: '네, 이해했어요!',
    working: '작업 중이에요...',
    done: '완료했어요! ✅',
    suggestion: '이런 건 어떨까요?'
  },
  
  // 명확화 요청
  clarification: {
    topic: '어떤 주제로 글을 쓸까요?',
    detail: '좀 더 자세히 알려주시겠어요?',
    choice: '다음 중 어떤 걸 원하세요?'
  },
  
  // 거절
  refusal: {
    outOfScope: '죄송해요, 저는 이 앱 사용에 관한 질문만 도와드릴 수 있어요 😊',
    cannotDo: '그 작업은 제가 할 수 없어요.',
    alternative: '대신 이런 건 도와드릴 수 있어요:'
  },
  
  // 에러
  error: {
    api: 'API 연결에 문제가 있어요. 잠시 후 다시 시도해주세요.',
    network: '네트워크 연결을 확인해주세요.',
    unknown: '문제가 발생했어요. 다시 시도해볼까요?'
  }
};
```

### 2.3 응답 포매터

```typescript
// src/agents/responseFormatter.ts
export class ResponseFormatter {
  private persona: AIPersona;
  
  constructor(persona: AIPersona = DEFAULT_PERSONA) {
    this.persona = persona;
  }
  
  // 단계별 가이드 포맷
  formatSteps(steps: string[]): string {
    return steps.map((step, i) => `${i + 1}. ${step}`).join('\n');
  }
  
  // 팁 포맷
  formatTip(tip: string): string {
    return `💡 **Tip**: ${tip}`;
  }
  
  // 액션 버튼 포함 응답
  formatWithActions(message: string, actions: ActionButton[]): FormattedResponse {
    return {
      message,
      actions,
      type: 'with_actions'
    };
  }
  
  // 진행 상황 포맷
  formatProgress(step: string, current: number, total: number): string {
    const percentage = Math.round((current / total) * 100);
    const bar = this.generateProgressBar(percentage);
    return `${step}\n${bar} ${percentage}%`;
  }
  
  private generateProgressBar(percentage: number): string {
    const filled = Math.round(percentage / 10);
    const empty = 10 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }
  
  // 에러 메시지 포맷 (사용자 친화적)
  formatError(error: Error, context?: string): string {
    const userMessage = this.getErrorUserMessage(error);
    const suggestion = this.getErrorSuggestion(error);
    
    let response = `❌ ${userMessage}`;
    if (suggestion) {
      response += `\n\n${suggestion}`;
    }
    return response;
  }
  
  private getErrorUserMessage(error: Error): string {
    const errorMap: Record<string, string> = {
      'API_KEY_INVALID': 'API 키가 올바르지 않아요.',
      'RATE_LIMIT': '요청이 너무 많아요. 잠시 후 다시 시도해주세요.',
      'NETWORK_ERROR': '인터넷 연결을 확인해주세요.',
      'CONTENT_BLOCKED': '콘텐츠 정책에 위반되어 생성할 수 없어요.'
    };
    return errorMap[error.message] || '문제가 발생했어요.';
  }
  
  private getErrorSuggestion(error: Error): string | null {
    const suggestionMap: Record<string, string> = {
      'API_KEY_INVALID': '💡 환경설정에서 API 키를 다시 확인해주세요.',
      'RATE_LIMIT': '💡 1분 후에 다시 시도해보세요.',
      'NETWORK_ERROR': '💡 Wi-Fi나 데이터 연결 상태를 확인해주세요.'
    };
    return suggestionMap[error.message] || null;
  }
}

interface ActionButton {
  label: string;
  action: string;
  icon?: string;
  primary?: boolean;
}

interface FormattedResponse {
  message: string;
  actions: ActionButton[];
  type: string;
}
```

---

## 3. 지식 베이스 시스템

### 3.1 지식 구조 (완전한 구현)

```
┌─────────────────────────────────────────────────────────────┐
│                    📚 지식 베이스 (Knowledge Base)           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ 📖 앱 매뉴얼  │  │ ⚙️ 설정 가이드 │  │ 🔧 트러블슈팅 │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ 📝 글 작성   │  │ 🖼️ 이미지    │  │ 📊 분석      │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                             │
│  ┌──────────────────────────────────────────────────┐      │
│  │ 🔍 시맨틱 검색 엔진 (TF-IDF + 키워드 매칭)         │      │
│  └──────────────────────────────────────────────────┘      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 지식 베이스 구현

```typescript
// src/agents/knowledge/index.ts
import { KnowledgeItem, KnowledgeCategory } from './types';
import appManual from './data/app-manual.json';
import settingsGuide from './data/settings-guide.json';
import troubleshooting from './data/troubleshooting.json';
import faq from './data/faq.json';

export class KnowledgeBase {
  private items: KnowledgeItem[] = [];
  private keywordIndex: Map<string, Set<string>> = new Map();
  
  constructor() {
    this.loadKnowledge();
    this.buildIndex();
  }
  
  private loadKnowledge(): void {
    // 모든 지식 데이터 로드
    this.items = [
      ...appManual,
      ...settingsGuide,
      ...troubleshooting,
      ...faq
    ];
    console.log(`📚 ${this.items.length}개의 지식 항목 로드됨`);
  }
  
  private buildIndex(): void {
    // 키워드 인덱스 구축 (빠른 검색용)
    for (const item of this.items) {
      for (const keyword of item.keywords) {
        const normalizedKeyword = this.normalizeKeyword(keyword);
        if (!this.keywordIndex.has(normalizedKeyword)) {
          this.keywordIndex.set(normalizedKeyword, new Set());
        }
        this.keywordIndex.get(normalizedKeyword)!.add(item.id);
      }
    }
    console.log(`🔍 ${this.keywordIndex.size}개의 키워드 인덱싱됨`);
  }
  
  // 검색 (TF-IDF 기반 + 키워드 매칭)
  search(query: string, limit: number = 5): KnowledgeItem[] {
    const queryKeywords = this.extractKeywords(query);
    const scores: Map<string, number> = new Map();
    
    // 1. 키워드 매칭 점수
    for (const keyword of queryKeywords) {
      const normalized = this.normalizeKeyword(keyword);
      const matchedIds = this.keywordIndex.get(normalized);
      
      if (matchedIds) {
        for (const id of matchedIds) {
          const currentScore = scores.get(id) || 0;
          scores.set(id, currentScore + 2); // 키워드 매칭 가중치
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
      
      if (titleMatch > 0 || contentMatch > 0) {
        const currentScore = scores.get(item.id) || 0;
        scores.set(item.id, currentScore + titleMatch * 3 + contentMatch);
      }
    }
    
    // 3. 점수로 정렬 및 상위 N개 반환
    const sortedIds = [...scores.entries()]
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
  
  // 키워드 추출 (한국어 형태소 분석 간소화)
  private extractKeywords(text: string): string[] {
    // 특수문자 제거 및 공백으로 분리
    const words = text
      .replace(/[^\w\sㄱ-ㅎㅏ-ㅣ가-힣]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length >= 2);
    
    // 불용어 제거
    const stopwords = ['어떻게', '하는', '뭐야', '뭔가', '있나요', '해줘', '해주세요', '으로', '에서', '이', '가', '을', '를'];
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
    const queryWords = queryLower.split(/\s+/);
    const matchCount = queryWords.filter(word => 
      word.length >= 2 && textLower.includes(word)
    ).length;
    
    return matchCount / queryWords.length;
  }
}

// 싱글톤 인스턴스
export const knowledgeBase = new KnowledgeBase();
```

### 3.3 실제 지식 데이터 (앱 매뉴얼)

```json
// src/agents/knowledge/data/app-manual.json
[
  {
    "id": "manual-overview",
    "category": "manual",
    "keywords": ["앱", "소개", "기능", "뭐야", "뭔가요", "할 수 있어"],
    "title": "앱 소개 및 주요 기능",
    "content": "리더 네이버 자동화는 네이버 블로그 글을 AI로 자동 생성하고 발행하는 앱입니다.",
    "steps": [
      "📝 AI 글 생성: URL, 키워드, 직접 입력으로 글 작성",
      "🖼️ 이미지 자동화: AI 이미지 생성 또는 무료 이미지 검색",
      "🚀 자동 발행: 네이버 블로그에 글 발행 (즉시/예약)",
      "📊 트렌드 분석: 네이버 데이터랩 연동"
    ],
    "relatedTopics": ["manual-content-generation", "settings-api-key"],
    "lastUpdated": "2024-12-17"
  },
  {
    "id": "manual-content-generation",
    "category": "manual",
    "keywords": ["글", "생성", "작성", "만들어", "써줘", "콘텐츠"],
    "title": "글 생성 방법",
    "content": "3가지 방법으로 글을 생성할 수 있습니다.",
    "steps": [
      "1️⃣ URL 입력: 참고할 URL을 입력하면 내용을 분석해서 글 작성",
      "2️⃣ 키워드 입력: 키워드만 입력하면 AI가 주제를 파악해서 작성",
      "3️⃣ 직접 입력: 원하는 내용을 직접 입력하면 글로 변환"
    ],
    "tips": [
      "💡 SEO 모드를 사용하면 검색 최적화된 글이 생성됩니다",
      "💡 홈피드 모드는 네이버 홈피드에 노출되기 좋은 형식입니다",
      "💡 카테고리를 선택하면 해당 분야에 맞는 톤으로 작성됩니다"
    ],
    "relatedTopics": ["manual-seo-mode", "manual-homefeed-mode", "settings-category"],
    "lastUpdated": "2024-12-17"
  },
  {
    "id": "manual-seo-mode",
    "category": "manual",
    "keywords": ["SEO", "검색", "최적화", "노출", "상위"],
    "title": "SEO 모드 사용법",
    "content": "SEO 모드는 네이버 검색에 잘 노출되도록 최적화된 글을 생성합니다.",
    "steps": [
      "1. 글 생성 탭에서 'SEO 모드' 선택",
      "2. 타겟 키워드 입력 (메인 키워드 1개 + 서브 키워드 2-3개)",
      "3. 생성 버튼 클릭",
      "4. AI가 키워드를 자연스럽게 배치한 글 생성"
    ],
    "tips": [
      "💡 제목에 키워드가 포함되어 있으면 검색 노출에 유리합니다",
      "💡 소제목(H2)에도 키워드 변형을 넣으면 좋습니다",
      "💡 본문 2000자 이상 권장"
    ],
    "relatedTopics": ["manual-content-generation", "analysis-keyword"],
    "lastUpdated": "2024-12-17"
  },
  {
    "id": "manual-image",
    "category": "manual",
    "keywords": ["이미지", "사진", "그림", "생성", "검색"],
    "title": "이미지 사용 방법",
    "content": "이미지는 AI 생성 또는 무료 이미지 검색으로 추가할 수 있습니다.",
    "steps": [
      "🎨 AI 이미지 생성: Gemini Imagen으로 주제에 맞는 이미지 생성",
      "🔍 무료 이미지 검색: Pexels, Unsplash에서 고품질 무료 이미지",
      "📁 직접 업로드: 내 컴퓨터의 이미지 사용"
    ],
    "tips": [
      "💡 AI 이미지 생성은 Gemini API 키가 필요합니다",
      "💡 무료 이미지는 상업적 사용도 가능합니다 (라이선스 확인)",
      "💡 이미지는 소제목마다 1개씩 배치하면 좋습니다"
    ],
    "relatedTopics": ["settings-api-key", "settings-image-source"],
    "lastUpdated": "2024-12-17"
  },
  {
    "id": "manual-publish",
    "category": "manual",
    "keywords": ["발행", "게시", "올리기", "포스팅", "블로그"],
    "title": "블로그 발행 방법",
    "content": "작성된 글을 네이버 블로그에 발행합니다.",
    "steps": [
      "1. 글 생성 완료 후 '발행' 버튼 클릭",
      "2. 발행 옵션 선택 (즉시 발행 / 예약 발행)",
      "3. 카테고리, 태그 확인",
      "4. '발행하기' 버튼 클릭"
    ],
    "tips": [
      "💡 첫 발행 전 네이버 로그인이 필요합니다",
      "💡 예약 발행은 최대 1주일 후까지 가능합니다",
      "💡 하루 발행 횟수 제한: 무료 10회, 유료 무제한"
    ],
    "relatedTopics": ["settings-naver-login", "manual-schedule"],
    "lastUpdated": "2024-12-17"
  }
]
```

### 3.4 설정 가이드 데이터

```json
// src/agents/knowledge/data/settings-guide.json
[
  {
    "id": "settings-api-key",
    "category": "settings",
    "keywords": ["api", "API", "키", "key", "제미나이", "gemini", "설정"],
    "title": "Gemini API 키 설정",
    "content": "Gemini API 키를 설정하면 AI 글 생성과 이미지 생성 기능을 사용할 수 있습니다.",
    "steps": [
      "1. 상단 메뉴에서 '환경설정' 탭 클릭",
      "2. 'Gemini API 키' 입력란 찾기",
      "3. 발급받은 API 키 입력",
      "4. '저장' 버튼 클릭",
      "5. 앱 재시작 (변경사항 적용)"
    ],
    "tips": [
      "💡 API 키가 없으시면 '발급 가이드' 버튼을 눌러 Google AI Studio에서 무료로 발급받으세요",
      "💡 무료 티어: 분당 15회, 일 1,500회 요청 가능",
      "💡 API 키는 sk-... 또는 AIza... 형식입니다"
    ],
    "relatedTopics": ["settings-api-guide", "troubleshooting-api-error"],
    "lastUpdated": "2024-12-17"
  },
  {
    "id": "settings-api-guide",
    "category": "settings",
    "keywords": ["api", "발급", "만들기", "가이드", "google", "구글"],
    "title": "API 키 발급 방법",
    "content": "Google AI Studio에서 무료로 Gemini API 키를 발급받을 수 있습니다.",
    "steps": [
      "1. https://aistudio.google.com 접속",
      "2. Google 계정으로 로그인",
      "3. 'Get API key' 버튼 클릭",
      "4. 'Create API key' 선택",
      "5. 생성된 키를 복사해서 앱에 입력"
    ],
    "tips": [
      "💡 무료로 사용 가능합니다 (일일 사용량 제한 있음)",
      "💡 API 키는 다른 사람과 공유하지 마세요",
      "💡 분실 시 새로 발급받으면 됩니다"
    ],
    "relatedTopics": ["settings-api-key"],
    "lastUpdated": "2024-12-17"
  },
  {
    "id": "settings-model",
    "category": "settings",
    "keywords": ["모델", "model", "gemini", "pro", "flash", "변경"],
    "title": "AI 모델 선택",
    "content": "사용할 Gemini 모델을 선택할 수 있습니다.",
    "steps": [
      "1. 환경설정 → AI 모델 선택",
      "2. 원하는 모델 선택:",
      "   • Gemini 2.0 Flash: 빠른 속도, 대부분의 작업에 적합",
      "   • Gemini 1.5 Pro: 높은 품질, 복잡한 작업에 적합",
      "   • Gemini 1.5 Flash: 균형잡힌 성능"
    ],
    "tips": [
      "💡 일반 글 생성은 Flash 모델 추천 (빠르고 충분한 품질)",
      "💡 긴 글이나 전문 콘텐츠는 Pro 모델 추천",
      "💡 무료 티어에서도 모든 모델 사용 가능"
    ],
    "relatedTopics": ["settings-api-key", "manual-content-generation"],
    "lastUpdated": "2024-12-17"
  },
  {
    "id": "settings-image-source",
    "category": "settings",
    "keywords": ["이미지", "소스", "pexels", "unsplash", "imagen"],
    "title": "이미지 소스 설정",
    "content": "글에 삽입할 이미지의 출처를 설정합니다.",
    "steps": [
      "1. 환경설정 → 이미지 설정",
      "2. 이미지 소스 선택:",
      "   • AI 생성 (Gemini Imagen): API 키 필요",
      "   • Pexels: 무료, API 키 선택사항",
      "   • Unsplash: 무료, API 키 필요",
      "   • 혼합: AI + 무료 이미지 조합"
    ],
    "tips": [
      "💡 Pexels는 API 키 없이도 기본 검색 가능",
      "💡 AI 이미지는 저작권 걱정 없이 사용 가능",
      "💡 무료 이미지도 상업적 사용 가능 (라이선스 확인)"
    ],
    "relatedTopics": ["manual-image", "settings-api-key"],
    "lastUpdated": "2024-12-17"
  },
  {
    "id": "settings-naver-login",
    "category": "settings",
    "keywords": ["네이버", "로그인", "계정", "연동", "블로그"],
    "title": "네이버 계정 연동",
    "content": "네이버 블로그에 글을 발행하려면 네이버 계정 연동이 필요합니다.",
    "steps": [
      "1. 환경설정 → 네이버 계정",
      "2. '네이버 로그인' 버튼 클릭",
      "3. 네이버 로그인 페이지에서 로그인",
      "4. '동의하기' 클릭 (블로그 접근 권한)",
      "5. 연동 완료!"
    ],
    "tips": [
      "💡 2차 인증 설정된 경우 OTP 입력 필요",
      "💡 로그인 상태는 일정 기간 유지됩니다",
      "💡 여러 블로그가 있으면 발행할 블로그 선택 가능"
    ],
    "relatedTopics": ["manual-publish", "troubleshooting-login-error"],
    "lastUpdated": "2024-12-17"
  }
]
```

### 3.5 트러블슈팅 데이터

```json
// src/agents/knowledge/data/troubleshooting.json
[
  {
    "id": "troubleshooting-api-error",
    "category": "troubleshooting",
    "keywords": ["api", "에러", "오류", "안돼", "실패", "키"],
    "question": "API 에러가 발생해요",
    "title": "API 오류 해결",
    "content": "API 관련 오류가 발생했을 때 해결 방법입니다.",
    "steps": [
      "1. API 키가 올바르게 입력되었는지 확인",
      "2. API 키 앞뒤 공백 제거",
      "3. 일일 사용량 한도 확인 (무료: 1,500회/일)",
      "4. Google AI Studio에서 키 상태 확인",
      "5. 새 API 키 발급 후 재시도"
    ],
    "tips": [
      "💡 에러 코드 400: API 키 형식 오류",
      "💡 에러 코드 401: API 키 인증 실패",
      "💡 에러 코드 429: 사용량 한도 초과",
      "💡 에러 코드 500: Gemini 서버 오류 (잠시 후 재시도)"
    ],
    "relatedTopics": ["settings-api-key", "settings-api-guide"],
    "lastUpdated": "2024-12-17"
  },
  {
    "id": "troubleshooting-generation-fail",
    "category": "troubleshooting",
    "keywords": ["생성", "실패", "안돼", "에러", "글"],
    "question": "글이 생성되지 않아요",
    "title": "글 생성 실패 해결",
    "content": "글 생성이 실패하는 경우 체크리스트입니다.",
    "steps": [
      "1. API 키 설정 확인",
      "2. 인터넷 연결 상태 확인",
      "3. 입력 내용이 너무 짧지 않은지 확인 (최소 10자)",
      "4. 금지된 키워드가 포함되어 있지 않은지 확인",
      "5. 앱 재시작 후 재시도"
    ],
    "tips": [
      "💡 콘텐츠 정책에 위반되는 주제는 생성 불가",
      "💡 너무 긴 입력도 실패할 수 있음 (10,000자 이하 권장)",
      "💡 특수문자가 많으면 오류 발생 가능"
    ],
    "relatedTopics": ["troubleshooting-api-error", "manual-content-generation"],
    "lastUpdated": "2024-12-17"
  },
  {
    "id": "troubleshooting-login-error",
    "category": "troubleshooting",
    "keywords": ["로그인", "실패", "네이버", "계정", "안돼"],
    "question": "네이버 로그인이 안돼요",
    "title": "네이버 로그인 오류 해결",
    "content": "네이버 로그인 관련 문제 해결 방법입니다.",
    "steps": [
      "1. 네이버 아이디/비밀번호 정확히 입력",
      "2. 2차 인증 설정 확인 (OTP 필요)",
      "3. 해외 로그인 차단 해제 (설정에서)",
      "4. 네이버 앱에서 먼저 로그인 시도",
      "5. 쿠키/캐시 삭제 후 재시도"
    ],
    "tips": [
      "💡 자동 로그인 방지 기능 때문에 실패할 수 있음",
      "💡 VPN 사용 시 로그인 제한될 수 있음",
      "💡 계정 보안 알림이 오면 '내가 맞습니다' 선택"
    ],
    "relatedTopics": ["settings-naver-login", "manual-publish"],
    "lastUpdated": "2024-12-17"
  },
  {
    "id": "troubleshooting-publish-fail",
    "category": "troubleshooting",
    "keywords": ["발행", "실패", "게시", "안돼", "오류"],
    "question": "글 발행이 안돼요",
    "title": "블로그 발행 실패 해결",
    "content": "블로그 발행 오류 해결 방법입니다.",
    "steps": [
      "1. 네이버 로그인 상태 확인",
      "2. 글 내용이 있는지 확인",
      "3. 이미지 용량 확인 (개당 10MB 이하)",
      "4. 네이버 블로그 서비스 상태 확인",
      "5. 일일 발행 횟수 한도 확인"
    ],
    "tips": [
      "💡 하루 발행 횟수 제한: 무료 10회",
      "💡 네이버 점검 시간: 새벽 4-5시경",
      "💡 이미지가 너무 많으면 실패할 수 있음 (20개 이하 권장)"
    ],
    "relatedTopics": ["manual-publish", "troubleshooting-login-error"],
    "lastUpdated": "2024-12-17"
  },
  {
    "id": "troubleshooting-slow",
    "category": "troubleshooting",
    "keywords": ["느려", "느림", "속도", "오래", "로딩"],
    "question": "앱이 느려요 / 응답이 늦어요",
    "title": "속도 문제 해결",
    "content": "앱 속도가 느린 경우 해결 방법입니다.",
    "steps": [
      "1. 인터넷 연결 속도 확인",
      "2. 다른 탭/프로그램 정리",
      "3. Gemini Flash 모델로 변경 (Pro보다 빠름)",
      "4. 앱 재시작",
      "5. 캐시 삭제: 설정 → 캐시 삭제"
    ],
    "tips": [
      "💡 글 생성은 보통 15-30초 소요",
      "💡 이미지 생성은 10-20초 소요",
      "💡 피크 시간(오후 2-6시)에는 더 느릴 수 있음"
    ],
    "relatedTopics": ["settings-model"],
    "lastUpdated": "2024-12-17"
  }
]
```

### 3.6 FAQ 데이터

```json
// src/agents/knowledge/data/faq.json
[
  {
    "id": "faq-free",
    "category": "faq",
    "keywords": ["무료", "비용", "돈", "유료", "가격"],
    "question": "이 앱은 무료인가요?",
    "title": "앱 이용 요금",
    "content": "기본 기능은 무료로 사용 가능합니다. Gemini API는 무료 티어로 하루 1,500회 요청이 가능합니다.",
    "tips": [
      "💡 무료로 충분히 사용 가능 (하루 50개 이상 글 생성 가능)",
      "💡 무료 이미지 검색은 완전 무료",
      "💡 유료 플랜은 더 많은 API 호출 + 우선 지원"
    ],
    "relatedTopics": ["settings-api-key"],
    "lastUpdated": "2024-12-17"
  },
  {
    "id": "faq-safe",
    "category": "faq",
    "keywords": ["안전", "보안", "비밀번호", "해킹", "걱정"],
    "question": "내 계정 정보가 안전한가요?",
    "title": "보안 및 개인정보",
    "content": "모든 정보는 사용자의 로컬 컴퓨터에만 저장됩니다. 서버로 전송되지 않습니다.",
    "tips": [
      "💡 네이버 비밀번호는 저장되지 않음 (세션만 유지)",
      "💡 API 키는 암호화되어 로컬에 저장",
      "💡 인터넷 연결은 AI 생성과 블로그 발행에만 사용"
    ],
    "relatedTopics": ["settings-naver-login"],
    "lastUpdated": "2024-12-17"
  },
  {
    "id": "faq-ai-detection",
    "category": "faq",
    "keywords": ["AI", "탐지", "감지", "티", "자연스러운"],
    "question": "AI가 쓴 글인지 티가 나지 않나요?",
    "title": "AI 탐지 회피",
    "content": "다양한 기법을 사용해 자연스러운 글을 생성합니다.",
    "tips": [
      "💡 문단 길이 다양화 (1줄~8줄 랜덤)",
      "💡 독자 참여 질문 자동 삽입",
      "💡 감정 표현 및 경험담 포함",
      "💡 발행 후 일부 수정 추천 (더 자연스러움)"
    ],
    "relatedTopics": ["manual-content-generation", "manual-seo-mode"],
    "lastUpdated": "2024-12-17"
  },
  {
    "id": "faq-category",
    "category": "faq",
    "keywords": ["카테고리", "종류", "분야", "주제"],
    "question": "어떤 주제의 글을 쓸 수 있나요?",
    "title": "지원 카테고리",
    "content": "23개 카테고리를 지원합니다. 각 카테고리에 최적화된 프롬프트가 적용됩니다.",
    "steps": [
      "일반, 뉴스/이슈, 스포츠, 건강",
      "경제/재테크, IT 리뷰, 쇼핑 리뷰, 육아/교육",
      "요리/맛집, 여행, 인테리어/DIY, 반려동물",
      "패션/뷰티, 취미, 부동산, 자동차",
      "책/영화 리뷰, 자기계발, 학습, 게임",
      "사진/영상, 예술/공예, 음악"
    ],
    "relatedTopics": ["manual-content-generation"],
    "lastUpdated": "2024-12-17"
  },
  {
    "id": "faq-multiple-blogs",
    "category": "faq",
    "keywords": ["여러", "다수", "블로그", "계정"],
    "question": "여러 블로그에 발행할 수 있나요?",
    "title": "다중 블로그 발행",
    "content": "하나의 네이버 계정에 여러 블로그가 있다면 선택해서 발행할 수 있습니다.",
    "tips": [
      "💡 발행 전 블로그 선택 가능",
      "💡 다른 네이버 계정은 로그아웃 후 재로그인 필요",
      "💡 계정 전환 시 세션이 초기화됩니다"
    ],
    "relatedTopics": ["settings-naver-login", "manual-publish"],
    "lastUpdated": "2024-12-17"
  }
]
```

---

## 4. 대화 정책 (Answer Policy)

### 4.1 질문 분류 시스템 (완전한 구현)

```typescript
// src/agents/classifier.ts
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

export class QuestionClassifier {
  // 키워드 사전
  private readonly SCOPE_KEYWORDS = {
    inScope: {
      // 앱 기능
      feature: ['글', '생성', '작성', '발행', '이미지', '사진', '블로그', '네이버', 
                'SEO', '홈피드', '크롤링', '분석', '트렌드', '키워드'],
      // 설정
      settings: ['설정', 'API', '키', 'Gemini', '제미나이', '환경설정', '저장', 
                 '경로', '모델', '무료', '유료', '로그인', '계정'],
      // 사용법
      howTo: ['어떻게', '방법', '사용', '하는법', '뭐야', '뭔가요', '알려줘', '가르쳐'],
      // 문제
      problem: ['안돼', '실패', '에러', '오류', '문제', '왜', '고장', '안되', '느려'],
      // 작업 요청
      action: ['해줘', '해주세요', '만들어', '생성해', '써줘', '작성해', '발행해', '분석해']
    },
    
    outOfScope: {
      general: ['날씨', '뉴스', '주식', '코인', '환율', '번역', '계산'],
      coding: ['코딩', '프로그래밍', '파이썬', '자바', '코드', '스크립트', '개발'],
      personal: ['연애', '진로', '취업', '면접', '건강', '병원', '약'],
      entertainment: ['게임', '영화', '음악', '맛집', '여행', '추천해줘'],
      sensitive: ['정치', '종교', '투표', '대통령']
    }
  };
  
  // 인사 패턴
  private readonly GREETING_PATTERNS = [
    /^안녕/,
    /^하이/,
    /^hello/i,
    /^hi/i,
    /반가워/,
    /^ㅎㅇ/
  ];
  
  // 감사/피드백 패턴
  private readonly FEEDBACK_PATTERNS = [
    /고마워/,
    /감사/,
    /땡큐/,
    /thanks/i,
    /잘했어/,
    /좋아/
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
    if (outOfScopeMatch.confidence > 0.7) {
      return {
        category: 'OUT_OF_SCOPE',
        confidence: outOfScopeMatch.confidence,
        suggestedAction: 'refuse',
        matchedKeywords: outOfScopeMatch.keywords,
        subCategory: outOfScopeMatch.subCategory
      };
    }
    
    // 4. 범위 내 키워드 매칭
    const inScopeMatch = this.matchInScope(lowerMessage);
    
    if (inScopeMatch.confidence > 0.6) {
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
    return this.GREETING_PATTERNS.some(pattern => pattern.test(message));
  }
  
  private isFeedback(message: string): boolean {
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
      const confidence = matched.length / keywords.length * 2; // 가중치
      
      if (confidence > maxConfidence) {
        maxConfidence = Math.min(confidence, 1);
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
    
    const confidence = Math.min(totalMatched.length * 0.3, 1);
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

export const questionClassifier = new QuestionClassifier();
```

### 4.2 거절 응답 시스템

```typescript
// src/agents/refusalHandler.ts
export class RefusalHandler {
  private readonly TEMPLATES = {
    general: `죄송해요, 저는 이 앱 사용에 관한 질문만 도와드릴 수 있어요 😊

대신 이런 건 도와드릴 수 있어요:
• 📝 글 생성/수정/발행
• 🖼️ 이미지 생성
• ⚙️ 설정 방법
• 🔧 문제 해결

무엇을 도와드릴까요?`,
    
    coding: `프로그래밍 관련 질문은 제 전문 분야가 아니에요 😅

하지만 이 앱에서는 코딩 없이:
• URL 입력만으로 자동 크롤링
• AI가 글을 자동으로 생성
• 이미지도 자동으로 추가

별도 코딩 없이 사용 가능해요! 사용법 알려드릴까요?`,
    
    personal: `개인적인 질문에는 답변드리기 어려워요 😊

저는 블로그 자동화 전문이에요!
• 글 작성 도움
• SEO 최적화
• 이미지 생성

이런 건 언제든 물어보세요!`,
    
    entertainment: `그건 제가 잘 모르는 분야예요 😅

블로그 관련 도움은 언제든 가능해요:
• 글 생성/발행
• 트렌드 분석
• 키워드 추천

뭐 도와드릴까요?`,
    
    sensitive: `민감한 주제에 대해서는 답변드리기 어려워요.

대신 블로그 작성에 관한 건 뭐든 도와드릴게요!`
  };
  
  getRefusalResponse(subCategory: string): string {
    return this.TEMPLATES[subCategory as keyof typeof this.TEMPLATES] 
      || this.TEMPLATES.general;
  }
  
  // 거절하면서도 대안 제시
  getRefusalWithAlternative(
    originalQuery: string, 
    subCategory: string
  ): { message: string; suggestions: string[] } {
    const message = this.getRefusalResponse(subCategory);
    
    // 원래 질문에서 키워드 추출해서 관련 기능 제안
    const suggestions = this.getSuggestionsForQuery(originalQuery);
    
    return { message, suggestions };
  }
  
  private getSuggestionsForQuery(query: string): string[] {
    const suggestions: string[] = [];
    
    if (/글|작성|콘텐츠/.test(query)) {
      suggestions.push('글 생성 방법 알려줘');
    }
    if (/이미지|사진/.test(query)) {
      suggestions.push('이미지 생성 방법');
    }
    if (/발행|게시/.test(query)) {
      suggestions.push('블로그 발행 방법');
    }
    
    // 기본 제안
    if (suggestions.length === 0) {
      suggestions.push('앱 사용법', 'API 키 설정', '글 생성 방법');
    }
    
    return suggestions.slice(0, 3);
  }
}

export const refusalHandler = new RefusalHandler();
```

---

## 5. 에이전트 아키텍처

### 5.1 전체 구조 (개선된 버전)

```
┌─────────────────────────────────────────────────────────────────┐
│                         사용자 메시지                            │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    🎯 마스터 에이전트 (Master)                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 1. 전처리 (Preprocessor)                                 │   │
│  │    → 메시지 정규화, 컨텍스트 추출                         │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │ 2. 질문 분류 (Classifier)                                │   │
│  │    → IN_SCOPE / OUT_OF_SCOPE / ACTION_REQUEST            │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │ 3. 라우팅 결정 (Router)                                  │   │
│  │    → 적절한 서브 에이전트 선택 / 체이닝 결정               │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │ 4. 실행 관리 (Executor)                                  │   │
│  │    → 에이전트 실행, 재시도, 타임아웃 관리                  │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │ 5. 결과 통합 (Aggregator)                                │   │
│  │    → 결과 조합, 응답 포맷팅                              │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
│ 📚 지식 에이전트  │   │ ⚡ 실행 에이전트  │   │ 🛡️ 거절 에이전트  │
│   (Knowledge)    │   │   (Execution)    │   │   (Refusal)      │
└──────────────────┘   └──────────────────┘   └──────────────────┘
        │                       │
        │               ┌───────┴───────┐
        │               ▼               ▼
        │       ┌──────────────┐ ┌──────────────┐
        │       │ 📝 Writer    │ │ 🖼️ Image     │
        │       └──────────────┘ └──────────────┘
        │               │               │
        │       ┌───────┴───────┐       │
        │       ▼               ▼       ▼
        │ ┌──────────────┐ ┌──────────────┐
        │ │ ✏️ Editor    │ │ 🚀 Publisher │
        │ └──────────────┘ └──────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────────────┐
│                        📖 지식 베이스                             │
│   (앱 매뉴얼, 설정 가이드, FAQ, 트러블슈팅)                        │
└──────────────────────────────────────────────────────────────────┘
```

### 5.2 에이전트 베이스 클래스

```typescript
// src/agents/baseAgent.ts
import { GeminiAPI } from '../api/gemini';
import { ChatContext } from './chatContext';

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

export abstract class BaseAgent {
  abstract name: string;
  abstract description: string;
  abstract systemPrompt: string;
  
  protected gemini: GeminiAPI;
  protected context: ChatContext;
  
  constructor(gemini: GeminiAPI, context: ChatContext) {
    this.gemini = gemini;
    this.context = context;
  }
  
  // 메인 실행 메서드 (서브클래스에서 구현)
  abstract execute(input: any): Promise<AgentResult>;
  
  // Gemini API 호출 (스트리밍 지원)
  protected async callGemini(
    prompt: string, 
    options?: GeminiCallOptions
  ): Promise<string> {
    const fullPrompt = `${this.systemPrompt}\n\n사용자: ${prompt}`;
    
    try {
      if (options?.stream && options.onChunk) {
        return await this.gemini.generateContentStream(
          fullPrompt,
          options.onChunk
        );
      }
      return await this.gemini.generateContent(fullPrompt);
    } catch (error) {
      this.log(`API 호출 실패: ${error}`);
      throw error;
    }
  }
  
  // 로깅
  protected log(message: string): void {
    console.log(`[${this.name}] ${message}`);
    this.context.addLog({
      agent: this.name,
      message,
      timestamp: new Date()
    });
  }
  
  // 에러 생성 헬퍼
  protected createError(
    code: string, 
    message: string, 
    recoverable: boolean = true
  ): AgentError {
    return { code, message, recoverable };
  }
  
  // 성공 결과 생성 헬퍼
  protected success(
    response: string, 
    options?: Partial<AgentResult>
  ): AgentResult {
    return {
      success: true,
      response,
      ...options
    };
  }
  
  // 실패 결과 생성 헬퍼
  protected failure(error: AgentError): AgentResult {
    return {
      success: false,
      error
    };
  }
}

interface GeminiCallOptions {
  stream?: boolean;
  onChunk?: (chunk: string) => void;
  maxTokens?: number;
  temperature?: number;
}
```

### 5.3 에이전트 간 통신 프로토콜

```typescript
// src/agents/communication.ts
export interface AgentMessage {
  id: string;
  from: string;
  to: string;
  type: 'request' | 'response' | 'delegate' | 'broadcast';
  payload: any;
  context: ChatContext;
  timestamp: Date;
  priority: 'low' | 'normal' | 'high';
}

export interface AgentChain {
  id: string;
  agents: string[];
  currentIndex: number;
  results: Map<string, AgentResult>;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

export class AgentMessageBus {
  private subscribers: Map<string, ((message: AgentMessage) => void)[]> = new Map();
  private messageQueue: AgentMessage[] = [];
  
  // 에이전트 등록
  subscribe(agentName: string, handler: (message: AgentMessage) => void): void {
    if (!this.subscribers.has(agentName)) {
      this.subscribers.set(agentName, []);
    }
    this.subscribers.get(agentName)!.push(handler);
  }
  
  // 메시지 전송
  send(message: AgentMessage): void {
    const handlers = this.subscribers.get(message.to) || [];
    handlers.forEach(handler => handler(message));
    
    // 로깅
    console.log(`[MessageBus] ${message.from} → ${message.to}: ${message.type}`);
  }
  
  // 브로드캐스트
  broadcast(message: AgentMessage): void {
    for (const [agentName, handlers] of this.subscribers) {
      if (agentName !== message.from) {
        handlers.forEach(handler => handler({ ...message, to: agentName }));
      }
    }
  }
  
  // 체인 실행
  async executeChain(chain: AgentChain, input: any): Promise<AgentResult[]> {
    const results: AgentResult[] = [];
    let currentInput = input;
    
    for (const agentName of chain.agents) {
      const message: AgentMessage = {
        id: `${chain.id}-${agentName}`,
        from: 'master',
        to: agentName,
        type: 'request',
        payload: currentInput,
        context: {} as ChatContext,
        timestamp: new Date(),
        priority: 'normal'
      };
      
      // 동기적 실행을 위한 Promise
      const result = await new Promise<AgentResult>((resolve) => {
        const handler = (response: AgentMessage) => {
          if (response.type === 'response') {
            resolve(response.payload);
          }
        };
        this.subscribe(`${agentName}-response`, handler);
        this.send(message);
      });
      
      results.push(result);
      chain.results.set(agentName, result);
      
      // 실패 시 체인 중단
      if (!result.success) {
        chain.status = 'failed';
        break;
      }
      
      // 다음 에이전트의 입력으로 현재 결과 전달
      currentInput = result.data || result.response;
      chain.currentIndex++;
    }
    
    chain.status = chain.currentIndex === chain.agents.length ? 'completed' : 'failed';
    return results;
  }
}

export const messageBus = new AgentMessageBus();
```

---

## 6. 상세 에이전트 구현

### 6.1 마스터 에이전트

```typescript
// src/agents/masterAgent.ts
import { BaseAgent, AgentResult, ActionButton } from './baseAgent';
import { QuestionClassifier, ClassificationResult } from './classifier';
import { KnowledgeAgent } from './knowledgeAgent';
import { ExecutionAgent } from './executionAgent';
import { RefusalAgent } from './refusalAgent';
import { ChatContext } from './chatContext';
import { ResponseFormatter } from './responseFormatter';

export class MasterAgent extends BaseAgent {
  name = 'master';
  description = '사용자 메시지 처리 및 에이전트 라우팅';
  systemPrompt = ''; // 마스터는 직접 LLM을 호출하지 않음
  
  private classifier: QuestionClassifier;
  private knowledgeAgent: KnowledgeAgent;
  private executionAgent: ExecutionAgent;
  private refusalAgent: RefusalAgent;
  private formatter: ResponseFormatter;
  
  constructor(gemini: GeminiAPI, context: ChatContext) {
    super(gemini, context);
    
    this.classifier = new QuestionClassifier();
    this.knowledgeAgent = new KnowledgeAgent(gemini, context);
    this.executionAgent = new ExecutionAgent(gemini, context);
    this.refusalAgent = new RefusalAgent(gemini, context);
    this.formatter = new ResponseFormatter();
  }
  
  async execute(input: { message: string }): Promise<AgentResult> {
    const startTime = Date.now();
    const { message } = input;
    
    this.log(`📨 메시지 수신: "${message.substring(0, 50)}..."`);
    
    try {
      // 1. 전처리
      const preprocessed = this.preprocess(message);
      
      // 2. 분류
      const classification = this.classifier.classify(preprocessed, this.context);
      this.log(`🏷️ 분류 결과: ${classification.category} (${(classification.confidence * 100).toFixed(0)}%)`);
      
      // 3. 라우팅 및 실행
      const result = await this.route(preprocessed, classification);
      
      // 4. 메타데이터 추가
      result.metadata = {
        ...result.metadata,
        processingTime: Date.now() - startTime,
        agentChain: [this.name, ...(result.metadata?.agentChain || [])]
      };
      
      // 5. 컨텍스트 업데이트
      this.context.addMessage({
        role: 'user',
        content: message,
        timestamp: new Date()
      });
      
      if (result.response) {
        this.context.addMessage({
          role: 'assistant',
          content: result.response,
          timestamp: new Date(),
          agentUsed: result.metadata?.agentChain?.join(' → ')
        });
      }
      
      this.log(`✅ 처리 완료 (${result.metadata.processingTime}ms)`);
      return result;
      
    } catch (error) {
      this.log(`❌ 처리 실패: ${error}`);
      return this.handleError(error as Error);
    }
  }
  
  private preprocess(message: string): string {
    return message
      .trim()
      .replace(/\s+/g, ' ')         // 다중 공백 제거
      .replace(/[""]/g, '"')        // 따옴표 정규화
      .replace(/['']/g, "'");
  }
  
  private async route(
    message: string, 
    classification: ClassificationResult
  ): Promise<AgentResult> {
    switch (classification.category) {
      case 'GREETING':
        return this.handleGreeting();
        
      case 'FEEDBACK':
        return this.handleFeedback();
        
      case 'OUT_OF_SCOPE':
        return this.refusalAgent.execute({
          message,
          subCategory: classification.subCategory
        });
        
      case 'ACTION_REQUEST':
        return this.executionAgent.execute({
          message,
          intent: classification.detectedIntent
        });
        
      case 'APP_USAGE':
      case 'SETTINGS':
      case 'FEATURE':
      case 'TROUBLESHOOTING':
        return this.knowledgeAgent.execute({
          message,
          category: classification.category
        });
        
      case 'AMBIGUOUS':
        return this.handleAmbiguous(message);
        
      default:
        return this.handleAmbiguous(message);
    }
  }
  
  private handleGreeting(): AgentResult {
    const hour = new Date().getHours();
    let greeting: string;
    
    if (hour < 12) {
      greeting = '좋은 아침이에요! ☀️';
    } else if (hour < 18) {
      greeting = '안녕하세요! 😊';
    } else {
      greeting = '안녕하세요! 늦은 시간까지 열심히시네요 💪';
    }
    
    return this.success(`${greeting}

저는 블로그 자동화 어시스턴트예요. 이런 것들을 도와드릴 수 있어요:

• 📝 글 생성/수정
• 🖼️ 이미지 생성
• ⚙️ 설정 방법 안내
• 🔧 문제 해결

무엇을 도와드릴까요?`, {
      suggestFollowUp: ['글 생성 방법', 'API 키 설정', '앱 사용법']
    });
  }
  
  private handleFeedback(): AgentResult {
    const responses = [
      '도움이 되었다니 기뻐요! 😊 더 필요한 게 있으면 언제든 말씀하세요.',
      '좋은 피드백 감사해요! 또 궁금한 거 있으면 물어봐 주세요 👍',
      '천만에요! 더 도와드릴 거 있나요?'
    ];
    
    return this.success(responses[Math.floor(Math.random() * responses.length)]);
  }
  
  private handleAmbiguous(message: string): AgentResult {
    return this.success(`무슨 도움이 필요하신지 좀 더 알려주시겠어요?

예를 들어:
• "글 생성 방법 알려줘"
• "API 키 설정은 어떻게 해?"
• "이 주제로 글 써줘: [주제]"

어떤 걸 도와드릴까요?`, {
      suggestFollowUp: ['글 생성 방법', 'API 키 설정', '기능 소개'],
      actions: [
        { id: 'help-write', label: '📝 글 생성', action: 'sendMessage', data: '글 생성 방법 알려줘' },
        { id: 'help-settings', label: '⚙️ 설정', action: 'sendMessage', data: 'API 키 설정 방법' },
        { id: 'help-features', label: '📖 기능 소개', action: 'sendMessage', data: '앱 기능 알려줘' }
      ]
    });
  }
  
  private handleError(error: Error): AgentResult {
    const errorMessage = this.formatter.formatError(error);
    
    return {
      success: false,
      response: errorMessage,
      error: {
        code: 'MASTER_ERROR',
        message: error.message,
        recoverable: true,
        suggestion: '다시 시도해주세요.'
      }
    };
  }
}
```

### 6.2 지식 에이전트

```typescript
// src/agents/knowledgeAgent.ts
import { BaseAgent, AgentResult } from './baseAgent';
import { KnowledgeBase, KnowledgeItem } from './knowledge';

export class KnowledgeAgent extends BaseAgent {
  name = 'knowledge';
  description = '앱 사용법, 설정, 기능에 대한 질문 응답';
  
  systemPrompt = `당신은 "리더 네이버 자동화" 앱의 전문 어시스턴트입니다.

## 역할
- 앱 사용법을 친절하게 설명합니다
- 설정 방법을 단계별로 안내합니다
- 문제 해결을 도와줍니다

## 응답 스타일
- 친근하고 전문적인 톤
- 단계별 가이드 제공 (필요시)
- 이모지 적절히 사용 (과하지 않게)
- 추가 팁이 있으면 제공

## 지식 베이스 정보
{knowledgeContext}

## 중요 규칙
1. 지식 베이스에 없는 내용은 추측하지 않습니다
2. 확실하지 않으면 "확인이 필요해요"라고 합니다
3. 관련 기능을 추천합니다
4. 답변은 간결하게 (200자 이내 권장, 필요시 확장)`;
  
  private knowledgeBase: KnowledgeBase;
  
  constructor(gemini: GeminiAPI, context: ChatContext) {
    super(gemini, context);
    this.knowledgeBase = new KnowledgeBase();
  }
  
  async execute(input: { message: string; category?: string }): Promise<AgentResult> {
    const { message, category } = input;
    
    this.log(`🔍 지식 검색: "${message}"`);
    
    // 1. 지식 베이스에서 관련 정보 검색
    const relevantKnowledge = this.knowledgeBase.search(message, 5);
    
    if (relevantKnowledge.length === 0) {
      return this.handleNoKnowledge(message);
    }
    
    this.log(`📚 ${relevantKnowledge.length}개 관련 지식 발견`);
    
    // 2. 가장 관련성 높은 항목으로 직접 응답 생성 시도
    const bestMatch = relevantKnowledge[0];
    const directResponse = this.tryDirectResponse(message, bestMatch);
    
    if (directResponse) {
      return directResponse;
    }
    
    // 3. 복잡한 질문은 Gemini로 응답 생성
    const knowledgeContext = this.formatKnowledge(relevantKnowledge);
    const prompt = this.systemPrompt.replace('{knowledgeContext}', knowledgeContext);
    
    try {
      const response = await this.callGemini(`${prompt}\n\n사용자 질문: ${message}`);
      
      return this.success(response, {
        suggestFollowUp: relevantKnowledge.slice(0, 3).map(k => k.title),
        metadata: {
          agentChain: [this.name],
          knowledgeUsed: relevantKnowledge.map(k => k.id)
        }
      });
    } catch (error) {
      // API 실패 시 지식 베이스 내용으로 폴백
      return this.fallbackResponse(bestMatch);
    }
  }
  
  // 간단한 질문은 직접 응답 (API 호출 없이)
  private tryDirectResponse(message: string, knowledge: KnowledgeItem): AgentResult | null {
    const lowerMessage = message.toLowerCase();
    
    // 정확한 매칭이 가능한 경우
    if (knowledge.question && this.isSimilarQuestion(lowerMessage, knowledge.question)) {
      return this.formatKnowledgeResponse(knowledge);
    }
    
    // 키워드가 정확히 일치하는 경우
    const matchedKeywords = knowledge.keywords.filter(kw => lowerMessage.includes(kw.toLowerCase()));
    if (matchedKeywords.length >= 2) {
      return this.formatKnowledgeResponse(knowledge);
    }
    
    return null;
  }
  
  private isSimilarQuestion(input: string, question: string): boolean {
    const inputWords = new Set(input.split(/\s+/));
    const questionWords = question.toLowerCase().split(/\s+/);
    
    const matchCount = questionWords.filter(w => inputWords.has(w)).length;
    return matchCount / questionWords.length > 0.6;
  }
  
  private formatKnowledgeResponse(knowledge: KnowledgeItem): AgentResult {
    let response = `${knowledge.title}\n\n${knowledge.content}`;
    
    // 단계가 있으면 추가
    if (knowledge.steps && knowledge.steps.length > 0) {
      response += '\n\n' + knowledge.steps.join('\n');
    }
    
    // 팁이 있으면 추가
    if (knowledge.tips && knowledge.tips.length > 0) {
      response += '\n\n' + knowledge.tips.slice(0, 2).join('\n');
    }
    
    // 액션 버튼 생성
    const actions = this.generateActions(knowledge);
    
    return this.success(response, {
      actions,
      suggestFollowUp: knowledge.relatedTopics?.slice(0, 3),
      metadata: { agentChain: [this.name] }
    });
  }
  
  private generateActions(knowledge: KnowledgeItem): ActionButton[] {
    const actions: ActionButton[] = [];
    
    // 설정 관련이면 설정 열기 버튼
    if (knowledge.category === 'settings') {
      actions.push({
        id: 'open-settings',
        label: '⚙️ 환경설정 열기',
        action: 'openTab',
        data: 'settings',
        primary: true
      });
    }
    
    // API 키 관련이면 발급 가이드 버튼
    if (knowledge.id.includes('api')) {
      actions.push({
        id: 'api-guide',
        label: '🔑 API 키 발급 가이드',
        action: 'openUrl',
        data: 'https://aistudio.google.com'
      });
    }
    
    // 글 생성 관련이면 글 생성 탭 열기
    if (knowledge.id.includes('content') || knowledge.id.includes('generation')) {
      actions.push({
        id: 'open-write',
        label: '📝 글 생성 시작',
        action: 'openTab',
        data: 'write',
        primary: true
      });
    }
    
    return actions;
  }
  
  private formatKnowledge(items: KnowledgeItem[]): string {
    return items.map(item => `
### ${item.title}
${item.content}
${item.steps ? '\n단계:\n' + item.steps.join('\n') : ''}
${item.tips ? '\n팁:\n' + item.tips.join('\n') : ''}
    `).join('\n---\n');
  }
  
  private handleNoKnowledge(message: string): AgentResult {
    return this.success(`죄송해요, 그 질문에 대한 정확한 정보를 찾지 못했어요 😅

혹시 이런 걸 찾으시는 건가요?
• 글 생성 방법
• API 키 설정
• 문제 해결

다르게 질문해주시거나, 위 주제 중 하나를 선택해주세요!`, {
      suggestFollowUp: ['글 생성 방법', 'API 키 설정', '앱 소개'],
      metadata: { agentChain: [this.name] }
    });
  }
  
  private fallbackResponse(knowledge: KnowledgeItem): AgentResult {
    return this.formatKnowledgeResponse(knowledge);
  }
}
```

### 6.3 실행 에이전트

```typescript
// src/agents/executionAgent.ts
import { BaseAgent, AgentResult, ActionButton } from './baseAgent';
import { WriterAgent } from './writers/writerAgent';
import { ImageAgent } from './writers/imageAgent';
import { EditorAgent } from './writers/editorAgent';
import { PublisherAgent } from './writers/publisherAgent';
import { AnalyzerAgent } from './writers/analyzerAgent';

type ActionType = 'WRITE' | 'EDIT' | 'IMAGE' | 'PUBLISH' | 'ANALYZE';

export class ExecutionAgent extends BaseAgent {
  name = 'execution';
  description = '글 생성, 이미지 생성 등 실제 작업 수행';
  
  systemPrompt = `당신은 작업 수행 전문가입니다.
사용자의 요청을 분석하여 적절한 작업을 수행합니다.

## 수행 가능한 작업
1. WRITE: 글 생성 (주제/URL/키워드 기반)
2. EDIT: 글 수정 (제목, 본문)
3. IMAGE: 이미지 생성/검색
4. PUBLISH: 블로그 발행
5. ANALYZE: 트렌드/키워드 분석

## 입력 분석
- 주제 추출
- 키워드 추출
- 요구사항 파악`;
  
  // 서브 에이전트들
  private writerAgent: WriterAgent;
  private imageAgent: ImageAgent;
  private editorAgent: EditorAgent;
  private publisherAgent: PublisherAgent;
  private analyzerAgent: AnalyzerAgent;
  
  constructor(gemini: GeminiAPI, context: ChatContext) {
    super(gemini, context);
    
    this.writerAgent = new WriterAgent(gemini, context);
    this.imageAgent = new ImageAgent(gemini, context);
    this.editorAgent = new EditorAgent(gemini, context);
    this.publisherAgent = new PublisherAgent(gemini, context);
    this.analyzerAgent = new AnalyzerAgent(gemini, context);
  }
  
  async execute(input: { message: string; intent?: string }): Promise<AgentResult> {
    const { message, intent } = input;
    
    // 1. 작업 유형 결정
    const actionType = (intent as ActionType) || this.detectActionType(message);
    this.log(`🎯 작업 유형: ${actionType}`);
    
    // 2. 입력 분석 (주제, 키워드 추출)
    const parsedInput = await this.parseInput(message, actionType);
    
    // 3. 해당 서브 에이전트 실행
    try {
      let result: AgentResult;
      
      switch (actionType) {
        case 'WRITE':
          result = await this.handleWrite(parsedInput);
          break;
        case 'EDIT':
          result = await this.editorAgent.execute(parsedInput);
          break;
        case 'IMAGE':
          result = await this.imageAgent.execute(parsedInput);
          break;
        case 'PUBLISH':
          result = await this.publisherAgent.execute(parsedInput);
          break;
        case 'ANALYZE':
          result = await this.analyzerAgent.execute(parsedInput);
          break;
        default:
          result = await this.handleWrite(parsedInput);
      }
      
      // 에이전트 체인 정보 추가
      result.metadata = {
        ...result.metadata,
        agentChain: [this.name, ...(result.metadata?.agentChain || [])]
      };
      
      return result;
      
    } catch (error) {
      return this.handleExecutionError(error as Error, actionType);
    }
  }
  
  private detectActionType(message: string): ActionType {
    const patterns: [RegExp, ActionType][] = [
      [/수정|바꿔|고쳐|변경/, 'EDIT'],
      [/이미지|사진|그림/, 'IMAGE'],
      [/발행|게시|올려|포스팅/, 'PUBLISH'],
      [/분석|트렌드|키워드|검색량/, 'ANALYZE']
    ];
    
    for (const [pattern, type] of patterns) {
      if (pattern.test(message)) return type;
    }
    
    return 'WRITE'; // 기본값
  }
  
  private async parseInput(message: string, actionType: ActionType): Promise<any> {
    // URL 추출
    const urlMatch = message.match(/https?:\/\/[^\s]+/);
    const url = urlMatch ? urlMatch[0] : null;
    
    // 키워드/주제 추출 (간단한 휴리스틱)
    let topic = message
      .replace(/https?:\/\/[^\s]+/g, '') // URL 제거
      .replace(/글\s*써줘|작성해줘|만들어줘|해줘|해주세요/g, '') // 요청 패턴 제거
      .replace(/으로|에\s*대해|관련|주제/g, '')
      .trim();
    
    // 더 정교한 파싱이 필요하면 Gemini 사용
    if (!topic || topic.length < 3) {
      topic = await this.extractTopicWithAI(message);
    }
    
    return {
      originalMessage: message,
      topic,
      url,
      actionType,
      options: this.extractOptions(message)
    };
  }
  
  private async extractTopicWithAI(message: string): Promise<string> {
    try {
      const response = await this.callGemini(`
다음 메시지에서 블로그 글 주제를 추출해주세요.
주제만 간결하게 답변하세요 (10자 이내).

메시지: "${message}"

주제:`);
      return response.trim();
    } catch {
      return message.substring(0, 30);
    }
  }
  
  private extractOptions(message: string): Record<string, any> {
    const options: Record<string, any> = {};
    
    // SEO 모드 감지
    if (/SEO|검색|최적화/.test(message)) {
      options.mode = 'seo';
    }
    
    // 홈피드 모드 감지
    if (/홈피드|홈 피드/.test(message)) {
      options.mode = 'homefeed';
    }
    
    // 길이 요청 감지
    if (/짧게|간단하게/.test(message)) {
      options.length = 'short';
    } else if (/길게|자세하게|상세하게/.test(message)) {
      options.length = 'long';
    }
    
    return options;
  }
  
  private async handleWrite(input: any): Promise<AgentResult> {
    // 1. 작성 시작 알림
    this.log('📝 글 생성 시작...');
    
    // 2. 글 생성
    const writeResult = await this.writerAgent.execute(input);
    
    if (!writeResult.success) {
      return writeResult;
    }
    
    // 3. 결과에 액션 버튼 추가
    writeResult.actions = [
      {
        id: 'apply-content',
        label: '📝 에디터에 적용',
        action: 'applyContent',
        data: writeResult.data,
        primary: true
      },
      {
        id: 'regenerate',
        label: '🔄 다시 생성',
        action: 'regenerate',
        data: input
      },
      {
        id: 'add-images',
        label: '🖼️ 이미지 추가',
        action: 'addImages',
        data: writeResult.data
      }
    ];
    
    return writeResult;
  }
  
  private handleExecutionError(error: Error, actionType: ActionType): AgentResult {
    const errorMessages: Record<ActionType, string> = {
      WRITE: '글 생성 중 문제가 발생했어요.',
      EDIT: '글 수정 중 문제가 발생했어요.',
      IMAGE: '이미지 처리 중 문제가 발생했어요.',
      PUBLISH: '발행 중 문제가 발생했어요.',
      ANALYZE: '분석 중 문제가 발생했어요.'
    };
    
    return {
      success: false,
      response: `${errorMessages[actionType]} 😅\n\n다시 시도해볼까요?`,
      error: {
        code: `${actionType}_ERROR`,
        message: error.message,
        recoverable: true,
        suggestion: '잠시 후 다시 시도해주세요.'
      },
      actions: [
        {
          id: 'retry',
          label: '🔄 다시 시도',
          action: 'retry',
          primary: true
        }
      ]
    };
  }
}
```

### 6.4 Writer 에이전트 (글 생성)

```typescript
// src/agents/writers/writerAgent.ts
import { BaseAgent, AgentResult } from '../baseAgent';

export class WriterAgent extends BaseAgent {
  name = 'writer';
  description = '블로그 글 작성 전문';
  
  systemPrompt = `당신은 네이버 블로그 SEO 전문 작가입니다.

## 글 작성 규칙
1. 제목: 15-30자, 키워드 포함, 호기심 유발
2. 본문: 2000-4000자
3. 구조: 도입부 → 소제목 3-5개 → 마무리
4. 문단: 길이 다양하게 (1줄~8줄 섞어서)

## AI 탐지 회피
- 독자 질문 2-3개 삽입 ("여러분은 어떠세요?")
- 감정 표현 ("정말", "진짜", "솔직히")
- 경험담 형식 ("저도 처음엔...")
- 불규칙한 문장 시작

## 출력 형식
[제목]
(제목 내용)

[본문]
(본문 내용 - HTML 태그 사용)

[태그]
(쉼표로 구분된 해시태그 5-10개)`;
  
  async execute(input: {
    topic: string;
    url?: string;
    options?: Record<string, any>;
  }): Promise<AgentResult> {
    const { topic, url, options = {} } = input;
    
    this.log(`✍️ 글 작성 시작: "${topic}"`);
    
    // 1. URL이 있으면 크롤링
    let sourceContent = '';
    if (url) {
      sourceContent = await this.crawlUrl(url);
      this.log(`🔗 URL 내용 수집 완료`);
    }
    
    // 2. 프롬프트 구성
    const prompt = this.buildPrompt(topic, sourceContent, options);
    
    // 3. 글 생성
    try {
      const response = await this.callGemini(prompt);
      
      // 4. 응답 파싱
      const parsed = this.parseResponse(response);
      
      if (!parsed.title || !parsed.content) {
        throw new Error('글 생성 결과 파싱 실패');
      }
      
      this.log(`✅ 글 생성 완료: "${parsed.title}"`);
      
      return this.success(
        `글이 완성되었어요! ✨\n\n**제목**: ${parsed.title}\n\n글자 수: ${parsed.content.length}자\n태그: ${parsed.tags.slice(0, 5).join(', ')}`,
        {
          data: parsed,
          metadata: {
            agentChain: [this.name],
            contentLength: parsed.content.length,
            tagCount: parsed.tags.length
          }
        }
      );
      
    } catch (error) {
      this.log(`❌ 글 생성 실패: ${error}`);
      throw error;
    }
  }
  
  private buildPrompt(
    topic: string, 
    sourceContent: string, 
    options: Record<string, any>
  ): string {
    let prompt = this.systemPrompt + '\n\n';
    
    // 모드에 따른 추가 지시
    if (options.mode === 'seo') {
      prompt += `## SEO 모드
- 제목에 키워드 필수 포함
- 소제목(H2)에도 키워드 변형 포함
- 키워드 밀도: 본문의 2-3%\n\n`;
    } else if (options.mode === 'homefeed') {
      prompt += `## 홈피드 모드
- 친근하고 일상적인 톤
- 첫 문장에서 흥미 유발
- 이미지 배치 중요\n\n`;
    }
    
    // 길이 옵션
    if (options.length === 'short') {
      prompt += '## 길이: 짧게 (1500-2000자)\n\n';
    } else if (options.length === 'long') {
      prompt += '## 길이: 길게 (4000-5000자)\n\n';
    }
    
    // 주제
    prompt += `## 작성할 주제\n${topic}\n\n`;
    
    // 참고 자료
    if (sourceContent) {
      prompt += `## 참고 자료 (재구성해서 사용)\n${sourceContent.substring(0, 3000)}\n\n`;
    }
    
    prompt += '위 규칙에 따라 블로그 글을 작성해주세요.';
    
    return prompt;
  }
  
  private parseResponse(response: string): {
    title: string;
    content: string;
    tags: string[];
  } {
    const titleMatch = response.match(/\[제목\]\s*\n?(.+?)(?=\n\[본문\]|\n\n)/s);
    const contentMatch = response.match(/\[본문\]\s*\n?([\s\S]+?)(?=\n\[태그\]|$)/);
    const tagsMatch = response.match(/\[태그\]\s*\n?(.+)/);
    
    const title = titleMatch?.[1]?.trim() || '';
    const content = contentMatch?.[1]?.trim() || response;
    const tagsString = tagsMatch?.[1]?.trim() || '';
    
    const tags = tagsString
      .split(/[,\s#]+/)
      .filter(tag => tag.length > 0)
      .map(tag => tag.startsWith('#') ? tag : `#${tag}`);
    
    return { title, content, tags };
  }
  
  private async crawlUrl(url: string): Promise<string> {
    // IPC를 통해 메인 프로세스의 크롤러 호출
    try {
      const result = await window.electronAPI.crawlUrl(url);
      return result.content || '';
    } catch {
      this.log(`⚠️ URL 크롤링 실패, 주제만으로 진행`);
      return '';
    }
  }
}
```

---

## 7. Gemini API 통합

### 7.1 API 클라이언트 (완전한 구현)

```typescript
// src/api/gemini.ts
export interface GeminiConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
  timeout: number;
}

export interface GeminiResponse {
  text: string;
  finishReason: string;
  tokenCount?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

export class GeminiAPI {
  private config: GeminiConfig;
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  
  constructor(config: Partial<GeminiConfig> = {}) {
    this.config = {
      apiKey: config.apiKey || '',
      model: config.model || 'gemini-2.0-flash-exp',
      maxTokens: config.maxTokens || 8192,
      temperature: config.temperature || 0.7,
      timeout: config.timeout || 30000
    };
  }
  
  // API 키 설정
  setApiKey(apiKey: string): void {
    this.config.apiKey = apiKey;
  }
  
  // 모델 변경
  setModel(model: string): void {
    this.config.model = model;
  }
  
  // 일반 생성 (논스트리밍)
  async generateContent(prompt: string): Promise<string> {
    this.validateApiKey();
    
    const url = `${this.baseUrl}/models/${this.config.model}:generateContent?key=${this.config.apiKey}`;
    
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: this.config.maxTokens,
        temperature: this.config.temperature
      },
      safetySettings: this.getSafetySettings()
    };
    
    try {
      const response = await this.fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      if (!response.ok) {
        throw await this.handleErrorResponse(response);
      }
      
      const data = await response.json();
      return this.extractText(data);
      
    } catch (error) {
      throw this.wrapError(error as Error);
    }
  }
  
  // 스트리밍 생성
  async generateContentStream(
    prompt: string,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    this.validateApiKey();
    
    const url = `${this.baseUrl}/models/${this.config.model}:streamGenerateContent?key=${this.config.apiKey}&alt=sse`;
    
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: this.config.maxTokens,
        temperature: this.config.temperature
      },
      safetySettings: this.getSafetySettings()
    };
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      if (!response.ok) {
        throw await this.handleErrorResponse(response);
      }
      
      const reader = response.body?.getReader();
      if (!reader) throw new Error('스트림을 읽을 수 없습니다');
      
      const decoder = new TextDecoder();
      let fullText = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const json = JSON.parse(line.slice(6));
              const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
              if (text) {
                fullText += text;
                onChunk(text);
              }
            } catch {
              // JSON 파싱 실패 무시
            }
          }
        }
      }
      
      return fullText;
      
    } catch (error) {
      throw this.wrapError(error as Error);
    }
  }
  
  // 이미지 생성 (Imagen)
  async generateImage(prompt: string): Promise<string> {
    this.validateApiKey();
    
    const url = `${this.baseUrl}/models/imagen-3.0-generate-002:predict?key=${this.config.apiKey}`;
    
    const body = {
      instances: [{ prompt }],
      parameters: {
        sampleCount: 1,
        aspectRatio: '16:9'
      }
    };
    
    try {
      const response = await this.fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      if (!response.ok) {
        throw await this.handleErrorResponse(response);
      }
      
      const data = await response.json();
      const imageBase64 = data.predictions?.[0]?.bytesBase64Encoded;
      
      if (!imageBase64) {
        throw new Error('이미지 생성 결과가 없습니다');
      }
      
      return `data:image/png;base64,${imageBase64}`;
      
    } catch (error) {
      throw this.wrapError(error as Error);
    }
  }
  
  // API 키 유효성 검사
  async validateKey(): Promise<boolean> {
    if (!this.config.apiKey) return false;
    
    try {
      await this.generateContent('테스트');
      return true;
    } catch {
      return false;
    }
  }
  
  // 사용량 확인 (근사치)
  getEstimatedTokens(text: string): number {
    // 한글 기준 대략적인 토큰 수 계산
    return Math.ceil(text.length / 2);
  }
  
  private validateApiKey(): void {
    if (!this.config.apiKey) {
      throw new GeminiError('API_KEY_MISSING', 'API 키가 설정되지 않았습니다');
    }
  }
  
  private async fetchWithTimeout(
    url: string, 
    options: RequestInit
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout);
    
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }
  
  private getSafetySettings() {
    return [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }
    ];
  }
  
  private extractText(data: any): string {
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      const blockReason = data.candidates?.[0]?.finishReason;
      if (blockReason === 'SAFETY') {
        throw new GeminiError('CONTENT_BLOCKED', '콘텐츠 정책에 위반되어 생성할 수 없습니다');
      }
      throw new GeminiError('EMPTY_RESPONSE', '응답이 비어있습니다');
    }
    return text;
  }
  
  private async handleErrorResponse(response: Response): Promise<Error> {
    const data = await response.json().catch(() => ({}));
    const message = data.error?.message || response.statusText;
    
    switch (response.status) {
      case 400:
        return new GeminiError('BAD_REQUEST', `잘못된 요청: ${message}`);
      case 401:
        return new GeminiError('API_KEY_INVALID', 'API 키가 유효하지 않습니다');
      case 403:
        return new GeminiError('FORBIDDEN', '접근 권한이 없습니다');
      case 429:
        return new GeminiError('RATE_LIMIT', '요청 한도를 초과했습니다');
      case 500:
        return new GeminiError('SERVER_ERROR', 'Gemini 서버 오류');
      default:
        return new GeminiError('UNKNOWN', `알 수 없는 오류: ${message}`);
    }
  }
  
  private wrapError(error: Error): Error {
    if (error instanceof GeminiError) return error;
    
    if (error.name === 'AbortError') {
      return new GeminiError('TIMEOUT', '요청 시간이 초과되었습니다');
    }
    
    if (error.message.includes('fetch')) {
      return new GeminiError('NETWORK_ERROR', '네트워크 연결을 확인해주세요');
    }
    
    return new GeminiError('UNKNOWN', error.message);
  }
}

// 커스텀 에러 클래스
export class GeminiError extends Error {
  code: string;
  
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'GeminiError';
  }
}

// 싱글톤 인스턴스
export const geminiAPI = new GeminiAPI();
```

### 7.2 API 재시도 래퍼

```typescript
// src/api/retryWrapper.ts
export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  retryableErrors: string[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  retryableErrors: ['RATE_LIMIT', 'SERVER_ERROR', 'TIMEOUT', 'NETWORK_ERROR']
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const { maxRetries, baseDelay, maxDelay, retryableErrors } = {
    ...DEFAULT_RETRY_CONFIG,
    ...config
  };
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // GeminiError인 경우 재시도 가능 여부 확인
      const errorCode = (error as any).code || 'UNKNOWN';
      const isRetryable = retryableErrors.includes(errorCode);
      
      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }
      
      // 지수 백오프 대기
      const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
      console.log(`⏳ 재시도 ${attempt + 1}/${maxRetries} (${delay}ms 후)`);
      
      await sleep(delay);
    }
  }
  
  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 사용 예시
export async function generateContentWithRetry(
  api: GeminiAPI, 
  prompt: string
): Promise<string> {
  return withRetry(() => api.generateContent(prompt));
}
```

---

## 8. IPC 통신 시스템

### 8.1 메인 프로세스 핸들러

```typescript
// src/main/ipcHandlers.ts
import { ipcMain, BrowserWindow } from 'electron';
import { MasterAgent } from '../agents/masterAgent';
import { GeminiAPI } from '../api/gemini';
import { ChatContext } from '../agents/chatContext';

export function setupIpcHandlers(mainWindow: BrowserWindow) {
  // 에이전트 인스턴스 초기화
  const gemini = new GeminiAPI();
  const context = new ChatContext();
  const masterAgent = new MasterAgent(gemini, context);
  
  // 채팅 메시지 처리
  ipcMain.handle('chat:sendMessage', async (event, message: string) => {
    try {
      const result = await masterAgent.execute({ message });
      return {
        success: true,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message
      };
    }
  });
  
  // 스트리밍 메시지 처리
  ipcMain.handle('chat:sendMessageStream', async (event, message: string) => {
    const streamId = `stream-${Date.now()}`;
    
    // 스트리밍 콜백
    const onChunk = (chunk: string) => {
      mainWindow.webContents.send('chat:stream', {
        streamId,
        chunk,
        done: false
      });
    };
    
    try {
      const result = await masterAgent.execute({
        message,
        options: { stream: true, onChunk }
      });
      
      // 완료 신호
      mainWindow.webContents.send('chat:stream', {
        streamId,
        done: true,
        result
      });
      
      return { success: true, streamId };
    } catch (error) {
      mainWindow.webContents.send('chat:stream', {
        streamId,
        done: true,
        error: (error as Error).message
      });
      
      return { success: false, error: (error as Error).message };
    }
  });
  
  // API 키 설정
  ipcMain.handle('settings:setApiKey', async (event, apiKey: string) => {
    gemini.setApiKey(apiKey);
    const isValid = await gemini.validateKey();
    return { success: isValid };
  });
  
  // 대화 히스토리 조회
  ipcMain.handle('chat:getHistory', async () => {
    return context.getHistory();
  });
  
  // 대화 히스토리 클리어
  ipcMain.handle('chat:clearHistory', async () => {
    context.clear();
    return { success: true };
  });
  
  // 액션 실행
  ipcMain.handle('chat:executeAction', async (event, action: {
    type: string;
    data: any;
  }) => {
    switch (action.type) {
      case 'openTab':
        mainWindow.webContents.send('app:openTab', action.data);
        return { success: true };
        
      case 'openUrl':
        require('electron').shell.openExternal(action.data);
        return { success: true };
        
      case 'applyContent':
        mainWindow.webContents.send('editor:applyContent', action.data);
        return { success: true };
        
      default:
        return { success: false, error: '알 수 없는 액션' };
    }
  });
  
  // URL 크롤링
  ipcMain.handle('util:crawlUrl', async (event, url: string) => {
    // 기존 크롤러 함수 호출
    const { crawlUrl } = require('../utils/crawler');
    return crawlUrl(url);
  });
}
```

### 8.2 렌더러 프로세스 API

```typescript
// src/renderer/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

// 렌더러에서 사용할 API 노출
contextBridge.exposeInMainWorld('electronAPI', {
  // 채팅
  chat: {
    sendMessage: (message: string) => 
      ipcRenderer.invoke('chat:sendMessage', message),
    
    sendMessageStream: (message: string) => 
      ipcRenderer.invoke('chat:sendMessageStream', message),
    
    getHistory: () => 
      ipcRenderer.invoke('chat:getHistory'),
    
    clearHistory: () => 
      ipcRenderer.invoke('chat:clearHistory'),
    
    executeAction: (action: { type: string; data: any }) => 
      ipcRenderer.invoke('chat:executeAction', action),
    
    // 스트리밍 이벤트 리스너
    onStream: (callback: (data: any) => void) => {
      ipcRenderer.on('chat:stream', (event, data) => callback(data));
    },
    
    offStream: () => {
      ipcRenderer.removeAllListeners('chat:stream');
    }
  },
  
  // 설정
  settings: {
    setApiKey: (apiKey: string) => 
      ipcRenderer.invoke('settings:setApiKey', apiKey)
  },
  
  // 유틸리티
  util: {
    crawlUrl: (url: string) => 
      ipcRenderer.invoke('util:crawlUrl', url)
  },
  
  // 앱 이벤트
  app: {
    onOpenTab: (callback: (tab: string) => void) => {
      ipcRenderer.on('app:openTab', (event, tab) => callback(tab));
    }
  },
  
  // 에디터 이벤트
  editor: {
    onApplyContent: (callback: (content: any) => void) => {
      ipcRenderer.on('editor:applyContent', (event, content) => callback(content));
    }
  }
});

// TypeScript 타입 정의
declare global {
  interface Window {
    electronAPI: {
      chat: {
        sendMessage: (message: string) => Promise<any>;
        sendMessageStream: (message: string) => Promise<any>;
        getHistory: () => Promise<any[]>;
        clearHistory: () => Promise<any>;
        executeAction: (action: { type: string; data: any }) => Promise<any>;
        onStream: (callback: (data: any) => void) => void;
        offStream: () => void;
      };
      settings: {
        setApiKey: (apiKey: string) => Promise<{ success: boolean }>;
      };
      util: {
        crawlUrl: (url: string) => Promise<{ content: string }>;
      };
      app: {
        onOpenTab: (callback: (tab: string) => void) => void;
      };
      editor: {
        onApplyContent: (callback: (content: any) => void) => void;
      };
    };
  }
}
```

---

## 9. 스트리밍 응답 시스템

### 9.1 스트리밍 메시지 렌더러

```typescript
// src/renderer/streamingRenderer.ts
export class StreamingRenderer {
  private container: HTMLElement;
  private currentMessageEl: HTMLElement | null = null;
  private buffer: string = '';
  private renderInterval: number | null = null;
  private charIndex: number = 0;
  private typingSpeed: number = 30; // ms per character
  
  constructor(container: HTMLElement) {
    this.container = container;
  }
  
  // 새 스트리밍 메시지 시작
  startMessage(): void {
    this.currentMessageEl = document.createElement('div');
    this.currentMessageEl.className = 'chat-message assistant streaming';
    this.currentMessageEl.innerHTML = `
      <div class="message-avatar">🤖</div>
      <div class="message-content">
        <div class="message-text"></div>
        <div class="typing-cursor">▋</div>
      </div>
    `;
    this.container.appendChild(this.currentMessageEl);
    this.scrollToBottom();
    
    this.buffer = '';
    this.charIndex = 0;
    
    // 타이핑 애니메이션 시작
    this.startTypingAnimation();
  }
  
  // 청크 추가
  addChunk(chunk: string): void {
    this.buffer += chunk;
  }
  
  // 메시지 완료
  finishMessage(result?: any): void {
    this.stopTypingAnimation();
    
    if (this.currentMessageEl) {
      // 남은 버퍼 모두 렌더링
      const textEl = this.currentMessageEl.querySelector('.message-text');
      if (textEl) {
        textEl.innerHTML = this.formatText(this.buffer);
      }
      
      // 커서 제거
      const cursor = this.currentMessageEl.querySelector('.typing-cursor');
      cursor?.remove();
      
      // 스트리밍 클래스 제거
      this.currentMessageEl.classList.remove('streaming');
      
      // 액션 버튼 추가
      if (result?.actions?.length > 0) {
        this.addActionButtons(result.actions);
      }
      
      // 팔로우업 제안 추가
      if (result?.suggestFollowUp?.length > 0) {
        this.addFollowUpSuggestions(result.suggestFollowUp);
      }
    }
    
    this.currentMessageEl = null;
    this.buffer = '';
  }
  
  // 에러 표시
  showError(errorMessage: string): void {
    this.stopTypingAnimation();
    
    if (this.currentMessageEl) {
      const textEl = this.currentMessageEl.querySelector('.message-text');
      if (textEl) {
        textEl.innerHTML = `<span class="error-message">${errorMessage}</span>`;
      }
      
      const cursor = this.currentMessageEl.querySelector('.typing-cursor');
      cursor?.remove();
      
      this.currentMessageEl.classList.remove('streaming');
      this.currentMessageEl.classList.add('error');
    }
    
    this.currentMessageEl = null;
  }
  
  private startTypingAnimation(): void {
    this.renderInterval = window.setInterval(() => {
      if (this.charIndex < this.buffer.length) {
        this.renderNextChars();
      }
    }, this.typingSpeed);
  }
  
  private stopTypingAnimation(): void {
    if (this.renderInterval) {
      clearInterval(this.renderInterval);
      this.renderInterval = null;
    }
  }
  
  private renderNextChars(): void {
    if (!this.currentMessageEl) return;
    
    const textEl = this.currentMessageEl.querySelector('.message-text');
    if (!textEl) return;
    
    // 한 번에 여러 문자 렌더링 (속도 최적화)
    const charsToRender = Math.min(3, this.buffer.length - this.charIndex);
    const newText = this.buffer.substring(0, this.charIndex + charsToRender);
    
    textEl.innerHTML = this.formatText(newText);
    this.charIndex += charsToRender;
    
    this.scrollToBottom();
  }
  
  private formatText(text: string): string {
    // 마크다운 기본 변환
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }
  
  private addActionButtons(actions: any[]): void {
    if (!this.currentMessageEl) return;
    
    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'message-actions';
    
    actions.forEach(action => {
      const button = document.createElement('button');
      button.className = `action-btn ${action.primary ? 'primary' : 'secondary'}`;
      button.innerHTML = `${action.icon || ''} ${action.label}`;
      button.onclick = () => this.handleAction(action);
      actionsContainer.appendChild(button);
    });
    
    this.currentMessageEl.querySelector('.message-content')?.appendChild(actionsContainer);
  }
  
  private addFollowUpSuggestions(suggestions: string[]): void {
    if (!this.currentMessageEl) return;
    
    const suggestionsContainer = document.createElement('div');
    suggestionsContainer.className = 'follow-up-suggestions';
    
    suggestions.forEach(suggestion => {
      const chip = document.createElement('button');
      chip.className = 'suggestion-chip';
      chip.textContent = suggestion;
      chip.onclick = () => {
        // 글로벌 채팅 함수 호출
        (window as any).chatPanel?.sendMessage(suggestion);
      };
      suggestionsContainer.appendChild(chip);
    });
    
    this.currentMessageEl.querySelector('.message-content')?.appendChild(suggestionsContainer);
  }
  
  private handleAction(action: any): void {
    window.electronAPI.chat.executeAction({
      type: action.action,
      data: action.data
    });
  }
  
  private scrollToBottom(): void {
    this.container.scrollTop = this.container.scrollHeight;
  }
}
```

### 9.2 채팅 패널 컨트롤러

```typescript
// src/renderer/chatPanel.ts
import { StreamingRenderer } from './streamingRenderer';

export class ChatPanel {
  private container: HTMLElement;
  private messagesContainer: HTMLElement;
  private input: HTMLInputElement;
  private sendButton: HTMLButtonElement;
  private streamingRenderer: StreamingRenderer;
  private isProcessing: boolean = false;
  
  constructor() {
    this.container = document.getElementById('chat-panel')!;
    this.messagesContainer = document.getElementById('chat-messages')!;
    this.input = document.getElementById('chat-input') as HTMLInputElement;
    this.sendButton = document.getElementById('chat-send') as HTMLButtonElement;
    
    this.streamingRenderer = new StreamingRenderer(this.messagesContainer);
    
    this.setupEventListeners();
    this.setupStreamListener();
    this.loadHistory();
    
    // 전역 접근용
    (window as any).chatPanel = this;
  }
  
  private setupEventListeners(): void {
    // 전송 버튼 클릭
    this.sendButton.addEventListener('click', () => this.sendMessage());
    
    // 엔터 키
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
    
    // 빠른 질문 버튼
    document.querySelectorAll('.quick-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const question = (e.target as HTMLElement).dataset.question;
        if (question) {
          this.input.value = question;
          this.sendMessage();
        }
      });
    });
  }
  
  private setupStreamListener(): void {
    window.electronAPI.chat.onStream((data) => {
      if (data.chunk && !data.done) {
        this.streamingRenderer.addChunk(data.chunk);
      } else if (data.done) {
        if (data.error) {
          this.streamingRenderer.showError(data.error);
        } else {
          this.streamingRenderer.finishMessage(data.result);
        }
        this.setProcessing(false);
      }
    });
  }
  
  async sendMessage(message?: string): Promise<void> {
    const text = message || this.input.value.trim();
    if (!text || this.isProcessing) return;
    
    // 입력 클리어
    this.input.value = '';
    
    // 사용자 메시지 표시
    this.addUserMessage(text);
    
    // 처리 중 상태
    this.setProcessing(true);
    
    // 스트리밍 메시지 시작
    this.streamingRenderer.startMessage();
    
    // 메시지 전송
    const result = await window.electronAPI.chat.sendMessageStream(text);
    
    if (!result.success) {
      this.streamingRenderer.showError('메시지 전송에 실패했어요.');
      this.setProcessing(false);
    }
  }
  
  private addUserMessage(text: string): void {
    const messageEl = document.createElement('div');
    messageEl.className = 'chat-message user';
    messageEl.innerHTML = `
      <div class="message-content">
        <span class="message-text">${this.escapeHtml(text)}</span>
      </div>
      <span class="message-time">${this.formatTime(new Date())}</span>
    `;
    this.messagesContainer.appendChild(messageEl);
    this.scrollToBottom();
  }
  
  private setProcessing(processing: boolean): void {
    this.isProcessing = processing;
    this.input.disabled = processing;
    this.sendButton.disabled = processing;
    
    if (processing) {
      this.sendButton.innerHTML = '<span class="loading-spinner"></span>';
    } else {
      this.sendButton.innerHTML = '전송';
    }
  }
  
  private async loadHistory(): Promise<void> {
    const history = await window.electronAPI.chat.getHistory();
    
    if (history.length === 0) {
      // 웰컴 메시지 표시
      this.showWelcomeMessage();
    } else {
      // 히스토리 렌더링
      history.forEach(msg => {
        if (msg.role === 'user') {
          this.addUserMessage(msg.content);
        } else {
          this.addAssistantMessage(msg.content);
        }
      });
    }
  }
  
  private showWelcomeMessage(): void {
    const welcomeEl = document.createElement('div');
    welcomeEl.className = 'chat-message assistant welcome';
    welcomeEl.innerHTML = `
      <div class="message-avatar">🤖</div>
      <div class="message-content">
        <div class="message-text">
          👋 안녕하세요! 저는 블로그 자동화 어시스턴트예요.<br><br>
          이런 것들을 도와드릴 수 있어요:
          <ul>
            <li>📝 글 생성/수정</li>
            <li>🖼️ 이미지 생성</li>
            <li>⚙️ 설정 방법 안내</li>
            <li>🔧 문제 해결</li>
          </ul>
          무엇을 도와드릴까요?
        </div>
      </div>
    `;
    this.messagesContainer.appendChild(welcomeEl);
  }
  
  private addAssistantMessage(text: string): void {
    const messageEl = document.createElement('div');
    messageEl.className = 'chat-message assistant';
    messageEl.innerHTML = `
      <div class="message-avatar">🤖</div>
      <div class="message-content">
        <div class="message-text">${this.formatText(text)}</div>
      </div>
      <span class="message-time">${this.formatTime(new Date())}</span>
    `;
    this.messagesContainer.appendChild(messageEl);
    this.scrollToBottom();
  }
  
  private formatText(text: string): string {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }
  
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  private formatTime(date: Date): string {
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  }
  
  private scrollToBottom(): void {
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }
  
  // 대화 클리어
  async clearHistory(): Promise<void> {
    await window.electronAPI.chat.clearHistory();
    this.messagesContainer.innerHTML = '';
    this.showWelcomeMessage();
  }
}

// 초기화
document.addEventListener('DOMContentLoaded', () => {
  new ChatPanel();
});
```
dgeContext}
`,

  // 실행 에이전트용 (글 생성)
  writer: `
당신은 네이버 블로그 SEO 전문 작가입니다.

[글 작성 규칙]
1. 제목: 15-30자, 키워드 포함, 호기심 유발
2. 본문: 2000-4000자
3. 구조: 도입부 → 소제목 3-5개 → 마무리
4. 문단: 길이 다양화 (1줄~8줄 섞기)

[AI 탐지 회피 필수 요소]
- 독자 질문 2-3개: "여러분은 어떠세요?", "이 부분 공감되지 않나요?"
- 감정 표현: "정말", "진짜", "솔직히", "완전"
- 경험담: "저도 처음엔...", "제가 해보니까..."
- 불규칙한 문장 시작 (같은 패턴 반복 금지)

[출력 형식]
[제목]
(제목 내용)

[본문]
(HTML 태그 사용)

[태그]
(#태그1, #태그2, ... 5-10개)
`,

  // 거절 에이전트용
  refusal: `
당신은 범위 밖 질문을 정중하게 거절하는 역할입니다.

[원칙]
1. 정중하지만 단호하게
2. 왜 답변할 수 없는지 간단히 설명
3. 대신 할 수 있는 것 제안
4. 적절한 이모지로 부드럽게

[응답 길이]
3-5줄로 간결하게

[필수 포함]
- 거절 이유
- 대안 제시 (할 수 있는 것 2-3개)
- 친근한 마무리
`
};
```

### 17.2 동적 프롬프트 빌더

```typescript
// src/agents/prompts/promptBuilder.ts

export class PromptBuilder {
  private basePrompt: string = '';
  private context: string[] = [];
  private constraints: string[] = [];
  private examples: string[] = [];
  
  setBase(prompt: string): this {
    this.basePrompt = prompt;
    return this;
  }
  
  addContext(context: string): this {
    this.context.push(context);
    return this;
  }
  
  addConstraint(constraint: string): this {
    this.constraints.push(constraint);
    return this;
  }
  
  addExample(input: string, output: string): this {
    this.examples.push(`입력: ${input}\n출력: ${output}`);
    return this;
  }
  
  // 대화 히스토리 추가
  addConversationHistory(history: string): this {
    this.context.push(`[이전 대화]\n${history}`);
    return this;
  }
  
  // 지식 베이스 컨텍스트 추가
  addKnowledge(knowledge: string): this {
    this.context.push(`[참고 정보]\n${knowledge}`);
    return this;
  }
  
  build(userMessage: string): string {
    const parts: string[] = [this.basePrompt];
    
    if (this.context.length > 0) {
      parts.push('\n[컨텍스트]');
      parts.push(...this.context);
    }
    
    if (this.constraints.length > 0) {
      parts.push('\n[제약사항]');
      this.constraints.forEach(c => parts.push(`- ${c}`));
    }
    
    if (this.examples.length > 0) {
      parts.push('\n[예시]');
      parts.push(...this.examples);
    }
    
    parts.push(`\n[사용자 메시지]\n${userMessage}`);
    parts.push('\n[응답]');
    
    return parts.join('\n');
  }
  
  // 프롬프트 초기화
  reset(): this {
    this.basePrompt = '';
    this.context = [];
    this.constraints = [];
    this.examples = [];
    return this;
  }
}

// 사용 예시
export function buildKnowledgePrompt(
  userMessage: string,
  knowledgeContext: string,
  conversationHistory?: string
): string {
  const builder = new PromptBuilder();
  
  builder
    .setBase(SYSTEM_PROMPTS.knowledge)
    .addKnowledge(knowledgeContext)
    .addConstraint('200자 이내로 간결하게')
    .addConstraint('추측 답변 금지');
  
  if (conversationHistory) {
    builder.addConversationHistory(conversationHistory);
  }
  
  return builder.build(userMessage);
}
```

---

## 18. 트러블슈팅 가이드

### 18.1 일반적인 문제 해결

```markdown
## 🔧 트러블슈팅 가이드

### 1. API 관련 문제

#### 증상: "API 키가 유효하지 않습니다"
**원인**:
- API 키 오타
- 키 앞뒤 공백
- 만료된 키

**해결**:
1. 환경설정에서 API 키 재입력
2. 공백 제거 확인
3. Google AI Studio에서 새 키 발급

#### 증상: "요청 한도 초과"
**원인**:
- 무료 티어 일일 한도 (1,500회) 초과
- 분당 요청 한도 (15회) 초과

**해결**:
1. 1분 대기 후 재시도
2. 다음 날까지 대기
3. 유료 플랜 고려

---

### 2. 글 생성 문제

#### 증상: "글 생성이 느립니다"
**원인**:
- 네트워크 지연
- Pro 모델 사용 (Flash보다 느림)
- 긴 컨텐츠 요청

**해결**:
1. Flash 모델로 변경
2. 네트워크 상태 확인
3. 요청 길이 줄이기

#### 증상: "글이 중간에 끊깁니다"
**원인**:
- 출력 토큰 한도 초과
- 네트워크 타임아웃

**해결**:
1. 더 짧은 글 요청
2. 재시도
3. 타임아웃 설정 증가

---

### 3. 채팅 패널 문제

#### 증상: "채팅이 응답하지 않습니다"
**원인**:
- IPC 통신 오류
- 메인 프로세스 오류

**해결**:
1. 앱 재시작
2. 개발자 도구에서 에러 확인
3. 로그 확인

#### 증상: "스트리밍이 끊깁니다"
**원인**:
- SSE 연결 끊김
- 버퍼 오버플로

**해결**:
1. 네트워크 안정성 확인
2. 재시도
```

### 18.2 개발자용 디버깅

```typescript
// src/utils/debug.ts

export class DebugLogger {
  private enabled: boolean;
  private prefix: string;
  
  constructor(prefix: string, enabled: boolean = true) {
    this.prefix = prefix;
    this.enabled = enabled;
  }
  
  log(...args: any[]): void {
    if (this.enabled) {
      console.log(`[${this.prefix}]`, ...args);
    }
  }
  
  error(...args: any[]): void {
    console.error(`[${this.prefix}] ERROR:`, ...args);
  }
  
  warn(...args: any[]): void {
    if (this.enabled) {
      console.warn(`[${this.prefix}] WARN:`, ...args);
    }
  }
  
  time(label: string): void {
    if (this.enabled) {
      console.time(`[${this.prefix}] ${label}`);
    }
  }
  
  timeEnd(label: string): void {
    if (this.enabled) {
      console.timeEnd(`[${this.prefix}] ${label}`);
    }
  }
  
  group(label: string): void {
    if (this.enabled) {
      console.group(`[${this.prefix}] ${label}`);
    }
  }
  
  groupEnd(): void {
    if (this.enabled) {
      console.groupEnd();
    }
  }
  
  // 에이전트 실행 추적
  traceAgent(agentName: string, input: any, output: any): void {
    this.group(`Agent: ${agentName}`);
    this.log('Input:', input);
    this.log('Output:', output);
    this.groupEnd();
  }
}

// 전역 디버거 인스턴스
export const debug = {
  master: new DebugLogger('Master'),
  knowledge: new DebugLogger('Knowledge'),
  execution: new DebugLogger('Execution'),
  api: new DebugLogger('API'),
  ipc: new DebugLogger('IPC')
};

// 프로덕션에서 비활성화
if (process.env.NODE_ENV === 'production') {
  Object.values(debug).forEach(d => d.enabled = false);
}
```

---

## ✅ 구현 체크리스트

### Phase 1: 기반 구조
- [ ] BaseAgent 클래스 구현
- [ ] ChatContext 구현
- [ ] 타입 정의 완료
- [ ] 지식 베이스 구조 설계

### Phase 2: 지식 베이스
- [ ] 앱 매뉴얼 데이터 작성
- [ ] 설정 가이드 데이터 작성
- [ ] 트러블슈팅 데이터 작성
- [ ] FAQ 데이터 작성
- [ ] 검색 시스템 구현

### Phase 3: 핵심 에이전트
- [ ] QuestionClassifier 구현
- [ ] MasterAgent 구현
- [ ] KnowledgeAgent 구현
- [ ] RefusalAgent 구현
- [ ] ExecutionAgent 구현

### Phase 4: API 통합
- [ ] GeminiAPI 클래스 구현
- [ ] 스트리밍 구현
- [ ] 재시도 로직 구현
- [ ] 에러 핸들링

### Phase 5: IPC 통신
- [ ] 메인 프로세스 핸들러
- [ ] Preload 스크립트
- [ ] 렌더러 API

### Phase 6: UI
- [ ] 채팅 패널 HTML
- [ ] CSS 스타일링
- [ ] ChatPanel 클래스
- [ ] StreamingRenderer
- [ ] 반응형 디자인

### Phase 7: 테스트 & 최적화
- [ ] 유닛 테스트
- [ ] E2E 테스트
- [ ] 성능 최적화
- [ ] 보안 검토
- [ ] 버그 수정

---

## 🚀 시작하기

이 플랜을 기반으로 구현을 시작하려면:

1. **Phase 1부터 순차적으로 진행**
2. **각 Phase 완료 후 테스트**
3. **문서화 병행**

**구현 시작 명령:**
```bash
# 프로젝트 폴더로 이동
cd your-project

# 에이전트 폴더 생성
mkdir -p src/agents/knowledge/data src/agents/writers src/api src/state src/utils

# Phase 1 시작
touch src/agents/baseAgent.ts src/agents/chatContext.ts src/agents/types.ts
```

**질문이 있으면 언제든 물어보세요!** 🎉
