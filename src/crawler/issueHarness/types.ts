// src/crawler/issueHarness/types.ts
// Issue endgame image collection harness — shared types.
// Isolated from shopping/full-auto image pipelines by design (regression safety).

/** Per-heading query variants produced by the AI fanout step. */
export interface HeadingQuerySet {
  heading: string;
  /** Korean base query: subject + issue core words */
  koreanQuery: string;
  /** English query (romanized names) for overseas sources */
  englishQuery: string;
  /** Fandom-style query (e.g. "인물명 직찍") — main supply of clean fan photos */
  fandomQuery: string;
  /** Event/venue query (e.g. "시상식명 2026") — scene photos without the name */
  eventQuery: string;
  /** Wide fallback query when everything else returns nothing */
  broaderQuery: string;
  /**
   * AI-recommended image count for this heading (1~3). Default 1 — only
   * raised when the body clearly covers multiple scenes/steps/comparisons.
   */
  recommendedImages?: number;
}

/** Result of the AI body analysis + query fanout. */
/**
 * [2026-09-17 사장님 라이브] 양수진(마담 논란) 글에 치어리더·아이돌 사진이 붙었다. 주체가 얼굴이
 * 알려진 공인이 아니면 "이름 + 직찍" 검색은 동명이인 연예인을 데려오고, 비전 판정도 그 사람을
 * 본인으로 오인한다. 주체 유형을 플랜에서 받아 검색어와 판정 규칙을 갈아 끼운다.
 */
export type IssueSubjectType = 'celebrity' | 'public-figure' | 'private' | 'unknown';

export interface IssueQueryPlan {
  /** 주체 유형 — AI 플랜이 채운다. 휴리스틱 폴백은 'unknown'. */
  subjectType?: IssueSubjectType;
  /** Core subject (person/team) extracted from title+body */
  mainSubject: string;
  /** Romanized subject for overseas searches ("손흥민" → "Son Heung-min") */
  romanizedSubject: string;
  /**
   * [2026-08-17] 글 전체가 다루는 사건 요약 (1~2문장, 고유명사 포함).
   * 예: "배우 한다감이 시험관 시술로 임신에 성공했고, 미운 우리 새끼 방송에서
   * 남편이 눈물을 보인 장면이 화제". 검색어 생성과 Vision 관련성 판정의 기준 —
   * 소제목 문구만 보면 후킹 표현에 끌려 무관한 이미지가 들어온다(실측).
   */
  contextSummary: string;
  /** 사건의 무대가 되는 프로그램·행사 고유명사 (예: "미운 우리 새끼"). 없으면 '' */
  programName: string;
  querySets: HeadingQuerySet[];
  /** true when Gemini produced the plan, false when heuristics fallback was used */
  aiGenerated: boolean;
}

/** One candidate image found by any source adapter. */
export interface IssueCandidateImage {
  url: string;
  thumbnailUrl?: string;
  sourceName: string;
  query: string;
  width?: number;
  height?: number;
  /*
   * [2026-09-12] 캡션·출처 페이지 제목. 예전에는 버렸다 — 그래놓고 "이 사진이 이 글과
   * 맞는가" 를 Vision API 로 다시 샀다. 네이버 이미지 API 는 항목마다 title 을 주고,
   * 그 값은 원문 캡션에 가깝다. 텍스트로 알 수 있는 것을 그림으로 되사지 않는다.
   */
  caption?: string;
  /** 이미지가 실린 문서 주소(있으면). 도메인·경로도 약한 신호가 된다. */
  pageUrl?: string;
}

/** Common interface every source adapter implements. */
export interface IssueSourceAdapter {
  name: string;
  search(query: string, maxImages: number): Promise<IssueCandidateImage[]>;
}

/** Input for one heading: title plus the body paragraph under it. */
export interface IssueHeadingInput {
  title: string;
  body?: string;
}

export interface IssueCollectPayload {
  title: string;
  headings: IssueHeadingInput[];
  mainKeyword?: string;
  /** 서론/도입부 — 사건 맥락이 가장 진하게 담긴 부분이라 별도로 전달한다. */
  intro?: string;
}

/** Real-time progress event emitted while the harness runs. */
export interface IssueProgressInfo {
  /** 0~100 overall progress */
  percent: number;
  /** Human-readable Korean status line for the progress modal */
  message: string;
}

export interface IssueHarnessOptions {
  /** How many images to place per heading (default 1) */
  perHeadingTarget?: number;
  /** Hard cap of candidates kept per heading (default 60) */
  maxCandidatesPerHeading?: number;
  /**
   * 검색어 플랜(텍스트) 호출자 — 고른 글생성 엔진으로 배선된다(textRoute.ts).
   * 없으면 휴리스틱 플랜으로 내려간다(무료).
   */
  planCaller?: import('./textRoute.js').IssuePlanCaller;
  /** 플랜을 만든 엔진 이름 — 로그·화면 표기용. */
  planEngineLabel?: string;
  /**
   * Vision 게이트 경로 — 사용자가 고른 글생성 엔진을 따라간다(visionRoute.ts).
   * null/미지정이면 Vision 을 아예 돌리지 않고 무료 캡션 게이트만 쓴다.
   */
  visionRoute?: import('./visionRoute.js').IssueVisionRoute | null;
  /** Called at each pipeline stage — wired to the renderer progress modal. */
  onProgress?: (info: IssueProgressInfo) => void;
}

export interface IssueHarnessStats {
  totalCandidates: number;
  afterFilter: number;
  perSource: Record<string, number>;
  aiPlanUsed: boolean;
  /** 플랜을 만든 엔진 이름. 휴리스틱이면 비어 있다. */
  planEngine?: string;
  /** R3 funnel stats */
  visionUsed?: boolean;
  /** 실제로 판정한 벤더 라벨 — 어디로 청구됐는지 화면에 그대로 보여 준다. */
  visionVendor?: string;
  /** 구독 CLI라 API 과금이 0인가. */
  visionFree?: boolean;
  visionInspected?: number;
  cleanTotal?: number;
  perceptualDuplicates?: number;
}

export interface IssueHarnessResult {
  /** heading → placed image URLs (top pick first) */
  images: Record<string, string[]>;
  /** heading → all surviving candidates (renderer saves them to disk) */
  candidates: Record<string, IssueCandidateImage[]>;
  stats: IssueHarnessStats;
}
