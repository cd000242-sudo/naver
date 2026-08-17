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
export interface IssueQueryPlan {
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
  geminiApiKey?: string;
  /** Called at each pipeline stage — wired to the renderer progress modal. */
  onProgress?: (info: IssueProgressInfo) => void;
}

export interface IssueHarnessStats {
  totalCandidates: number;
  afterFilter: number;
  perSource: Record<string, number>;
  aiPlanUsed: boolean;
  /** R3 funnel stats */
  visionUsed?: boolean;
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
