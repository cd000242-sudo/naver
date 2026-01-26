# 🤖 AI 에이전트 시스템 구현 플랜

> 네이버 블로그 자동화 앱에 AI 에이전트 시스템 추가

---

## 📋 목차

1. [개요](#1-개요)
2. [시스템 아키텍처](#2-시스템-아키텍처)
3. [에이전트 정의](#3-에이전트-정의)
4. [구현 단계](#4-구현-단계)
5. [UI/UX 설계](#5-uiux-설계)
6. [기술 스택](#6-기술-스택)
7. [일정 계획](#7-일정-계획)

---

## 1. 개요

### 1.1 목표
- 사용자가 AI와 대화하며 블로그 글 생성/수정/발행 가능
- 복잡한 작업을 여러 전문 에이전트가 분담 처리
- 자연어로 앱의 모든 기능 제어 가능

### 1.2 핵심 기능
| 기능 | 설명 |
|------|------|
| 💬 AI 채팅 | 실시간 대화형 인터페이스 |
| 🎯 멀티 에이전트 | 역할별 전문 에이전트 |
| 🔄 대화 히스토리 | 컨텍스트 유지 |
| ⚡ 앱 기능 연동 | 글 생성, 이미지, 발행 등 |

---

## 2. 시스템 아키텍처

### 2.1 전체 구조

```
┌─────────────────────────────────────────────────────────────┐
│                        사용자 인터페이스                      │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              AI 채팅 패널 (Chat Panel)               │   │
│  │  - 메시지 입력                                       │   │
│  │  - 대화 히스토리 표시                                 │   │
│  │  - 액션 버튼 (글 적용, 발행 등)                       │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   오케스트레이터 (Orchestrator)              │
│  - 사용자 의도 파악                                         │
│  - 적절한 에이전트 선택                                      │
│  - 작업 흐름 관리                                           │
│  - 결과 통합 및 응답 생성                                    │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ 📝 글 생성    │     │ 🔍 리서치    │     │ 🖼️ 이미지    │
│   에이전트    │     │   에이전트    │     │   에이전트    │
└──────────────┘     └──────────────┘     └──────────────┘
        │                     │                     │
        ▼                     ▼                     ▼
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ ✏️ 편집      │     │ 📊 분석      │     │ 🚀 발행      │
│   에이전트    │     │   에이전트    │     │   에이전트    │
└──────────────┘     └──────────────┘     └──────────────┘
```

### 2.2 데이터 흐름

```
1. 사용자 메시지 입력
       ↓
2. 오케스트레이터가 의도 분석
       ↓
3. 필요한 에이전트 호출 (단일 또는 체인)
       ↓
4. 에이전트 실행 결과 수집
       ↓
5. 결과 통합 및 사용자에게 응답
       ↓
6. 대화 히스토리에 저장
```

---

## 3. 에이전트 정의

### 3.1 오케스트레이터 (Orchestrator)

```typescript
interface OrchestratorAgent {
  name: 'orchestrator';
  role: '사용자 의도 파악 및 에이전트 라우팅';
  capabilities: [
    '의도 분류 (글 생성, 수정, 질문, 발행 등)',
    '에이전트 선택 및 호출 순서 결정',
    '결과 통합 및 최종 응답 생성'
  ];
}
```

**의도 분류 카테고리:**
| 의도 | 예시 | 호출 에이전트 |
|------|------|--------------|
| `WRITE` | "글 써줘" | 글 생성 → 이미지 |
| `EDIT` | "제목 수정해줘" | 편집 |
| `RESEARCH` | "이 주제 조사해줘" | 리서치 |
| `ANALYZE` | "트렌드 분석해줘" | 분석 |
| `PUBLISH` | "발행해줘" | 발행 |
| `QUESTION` | "SEO란 뭐야?" | 일반 응답 |
| `IMAGE` | "이미지 생성해줘" | 이미지 |

### 3.2 글 생성 에이전트 (Writer)

```typescript
interface WriterAgent {
  name: 'writer';
  role: '블로그 글 작성 전문';
  systemPrompt: `
    당신은 네이버 블로그 SEO 전문가입니다.
    - 검색 최적화된 제목 작성
    - 구조화된 본문 (H2 소제목 3-5개)
    - 자연스러운 키워드 배치
    - 독자 engagement 유도
  `;
  tools: ['generateContent', 'getPrompt'];
  inputSchema: {
    topic: string;
    keywords?: string[];
    contentMode: 'seo' | 'homefeed';
    category?: string;
  };
  outputSchema: {
    title: string;
    content: string;
    tags: string[];
  };
}
```

### 3.3 리서치 에이전트 (Researcher)

```typescript
interface ResearcherAgent {
  name: 'researcher';
  role: 'URL/키워드 분석 및 정보 수집';
  capabilities: [
    'URL 크롤링 및 내용 분석',
    '네이버 검색 API 활용',
    '관련 정보 요약'
  ];
  tools: ['crawlUrl', 'naverSearch', 'summarize'];
}
```

### 3.4 이미지 에이전트 (Image)

```typescript
interface ImageAgent {
  name: 'image';
  role: '본문에 맞는 이미지 선택/생성';
  capabilities: [
    'Gemini Imagen으로 이미지 생성',
    '무료 이미지 검색 (Unsplash, Pexels 등)',
    '본문 분석 후 적절한 이미지 추천'
  ];
  tools: ['generateImage', 'searchImage', 'analyzeContent'];
}
```

### 3.5 편집 에이전트 (Editor)

```typescript
interface EditorAgent {
  name: 'editor';
  role: '글 수정 및 SEO 최적화';
  capabilities: [
    '제목 수정/개선',
    '본문 교정',
    'SEO 점수 분석',
    '가독성 개선'
  ];
  tools: ['editTitle', 'editContent', 'analyzeSEO'];
}
```

### 3.6 분석 에이전트 (Analyzer)

```typescript
interface AnalyzerAgent {
  name: 'analyzer';
  role: '트렌드 및 키워드 분석';
  capabilities: [
    '네이버 데이터랩 트렌드',
    '키워드 검색량 분석',
    '경쟁 키워드 추천'
  ];
  tools: ['getTrend', 'getKeywordVolume', 'suggestKeywords'];
}
```

### 3.7 발행 에이전트 (Publisher)

```typescript
interface PublisherAgent {
  name: 'publisher';
  role: '네이버 블로그 발행';
  capabilities: [
    '블로그 발행',
    '예약 발행',
    '발행 상태 확인'
  ];
  tools: ['publishPost', 'schedulePost', 'checkStatus'];
}
```

---

## 4. 구현 단계

### Phase 1: 기반 구조 (1-2일)

#### 1.1 에이전트 베이스 클래스
```typescript
// src/agents/baseAgent.ts
abstract class BaseAgent {
  abstract name: string;
  abstract description: string;
  abstract systemPrompt: string;
  
  abstract execute(input: any): Promise<AgentResult>;
  
  protected async callGemini(prompt: string): Promise<string>;
  protected log(message: string): void;
}
```

#### 1.2 오케스트레이터 구현
```typescript
// src/agents/orchestrator.ts
class Orchestrator {
  private agents: Map<string, BaseAgent>;
  
  async processMessage(message: string, context: ChatContext): Promise<Response>;
  private classifyIntent(message: string): Intent;
  private selectAgents(intent: Intent): BaseAgent[];
  private executeChain(agents: BaseAgent[], input: any): Promise<any>;
}
```

#### 1.3 대화 컨텍스트 관리
```typescript
// src/agents/chatContext.ts
interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  agentUsed?: string;
}

class ChatContext {
  private history: ChatMessage[];
  
  addMessage(msg: ChatMessage): void;
  getHistory(limit?: number): ChatMessage[];
  clear(): void;
}
```

### Phase 2: 핵심 에이전트 구현 (2-3일)

#### 2.1 글 생성 에이전트
- 기존 `generateStructuredContent` 함수 래핑
- 대화형 인터페이스 지원
- 점진적 수정 가능

#### 2.2 편집 에이전트
- 제목/본문 부분 수정
- SEO 점수 분석
- 개선 제안

#### 2.3 이미지 에이전트
- 본문 분석 → 이미지 키워드 추출
- 자동 이미지 생성/검색

### Phase 3: UI 구현 (1-2일)

#### 3.1 채팅 패널 UI
- 사이드바 또는 탭으로 추가
- 실시간 타이핑 애니메이션
- 액션 버튼 (적용, 발행 등)

#### 3.2 상태 표시
- 현재 실행 중인 에이전트 표시
- 진행률 표시
- 에러 메시지

### Phase 4: 고급 기능 (2-3일)

#### 4.1 에이전트 체이닝
```typescript
// 예: "이 URL로 글 써줘"
// 리서치 → 글 생성 → 이미지 자동 체인
```

#### 4.2 대화 히스토리 저장
- 세션별 대화 저장
- 이전 대화 불러오기

#### 4.3 커스텀 에이전트
- 사용자가 에이전트 프롬프트 수정 가능

---

## 5. UI/UX 설계

### 5.1 채팅 패널 위치

**옵션 A: 사이드바**
```
┌────────────────────────────────────────────────┐
│  [기존 UI]              │  [AI 채팅 패널]      │
│                         │                      │
│  글 작성 영역           │  💬 대화 내용        │
│                         │                      │
│                         │  ─────────────────   │
│                         │  [입력창] [전송]     │
└────────────────────────────────────────────────┘
```

**옵션 B: 플로팅 버튼 + 모달**
```
┌────────────────────────────────────────┐
│  [기존 UI 전체]                        │
│                                        │
│                              [🤖 AI]   │  ← 플로팅 버튼
└────────────────────────────────────────┘
```

### 5.2 메시지 디자인

```html
<!-- 사용자 메시지 -->
<div class="chat-message user">
  <div class="avatar">👤</div>
  <div class="content">이 주제로 글 써줘</div>
</div>

<!-- AI 메시지 -->
<div class="chat-message assistant">
  <div class="avatar">🤖</div>
  <div class="content">
    글을 작성했습니다!
    <div class="action-buttons">
      <button>📝 에디터에 적용</button>
      <button>🚀 바로 발행</button>
    </div>
  </div>
</div>

<!-- 에이전트 작업 중 -->
<div class="chat-message assistant working">
  <div class="avatar">🔍</div>
  <div class="content">
    <span class="agent-badge">리서치 에이전트</span>
    URL 분석 중...
    <div class="progress-bar"></div>
  </div>
</div>
```

---

## 6. 기술 스택

### 6.1 백엔드 (main process)

| 구성요소 | 기술 |
|----------|------|
| 에이전트 프레임워크 | 커스텀 TypeScript |
| AI 모델 | Gemini API (기존 사용) |
| 대화 관리 | 인메모리 + JSON 저장 |

### 6.2 프론트엔드 (renderer)

| 구성요소 | 기술 |
|----------|------|
| 채팅 UI | HTML/CSS (기존 스타일) |
| 실시간 통신 | IPC (Electron) |
| 상태 관리 | 로컬 상태 |

### 6.3 파일 구조

```
src/
├── agents/
│   ├── index.ts              # 에이전트 시스템 진입점
│   ├── baseAgent.ts          # 베이스 클래스
│   ├── orchestrator.ts       # 오케스트레이터
│   ├── chatContext.ts        # 대화 컨텍스트
│   ├── writerAgent.ts        # 글 생성 에이전트
│   ├── researcherAgent.ts    # 리서치 에이전트
│   ├── imageAgent.ts         # 이미지 에이전트
│   ├── editorAgent.ts        # 편집 에이전트
│   ├── analyzerAgent.ts      # 분석 에이전트
│   └── publisherAgent.ts     # 발행 에이전트
├── main.ts                   # IPC 핸들러 추가
└── renderer/
    └── chatPanel.ts          # 채팅 UI 로직
```

---

## 7. 일정 계획

### 7.1 전체 일정 (약 7-10일)

| 단계 | 작업 | 예상 시간 |
|------|------|----------|
| **Phase 1** | 기반 구조 | 1-2일 |
| **Phase 2** | 핵심 에이전트 | 2-3일 |
| **Phase 3** | UI 구현 | 1-2일 |
| **Phase 4** | 고급 기능 | 2-3일 |
| **테스트** | 통합 테스트 | 1일 |

### 7.2 우선순위

1. ⭐⭐⭐ 오케스트레이터 + 글 생성 에이전트
2. ⭐⭐⭐ 채팅 UI 기본
3. ⭐⭐ 편집/이미지 에이전트
4. ⭐⭐ 대화 히스토리
5. ⭐ 분석/발행 에이전트
6. ⭐ 고급 기능

---

## 8. 예상 사용 시나리오

### 시나리오 1: 글 생성
```
👤: "겨울철 건강 관리 팁으로 글 써줘"
🤖: [글 생성 에이전트 실행 중...]
🤖: "글이 완성되었습니다! 제목: '겨울철 건강을 지키는 5가지 생활습관'"
    [📝 에디터에 적용] [👀 미리보기]
```

### 시나리오 2: URL 기반 글 생성
```
👤: "https://example.com/article 이 내용으로 글 써줘"
🤖: [리서치 에이전트] URL 분석 중...
🤖: [글 생성 에이전트] 글 작성 중...
🤖: [이미지 에이전트] 이미지 생성 중...
🤖: "완성되었습니다! 제목: '...' + 이미지 3장 생성됨"
```

### 시나리오 3: 글 수정
```
👤: "제목을 더 궁금증 유발하게 바꿔줘"
🤖: [편집 에이전트] 제목 수정 중...
🤖: "수정된 제목: '이것 모르면 겨울 건강 망칩니다'"
    [✅ 적용] [🔄 다시 생성]
```

### 시나리오 4: 트렌드 분석
```
👤: "요즘 뜨는 키워드 뭐야?"
🤖: [분석 에이전트] 네이버 트렌드 분석 중...
🤖: "현재 인기 키워드:
    1. 연말정산 (↑45%)
    2. 크리스마스 선물 (↑120%)
    3. 겨울 여행 (↑30%)"
```

---

## ✅ 다음 단계

플랜 검토 후 구현을 시작하려면 알려주세요!

1. **Phase 1부터 순차 진행**
2. **특정 에이전트 먼저 구현**
3. **UI 먼저 구현**

어떤 방식으로 진행할까요?
