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
}

/** Result of the AI body analysis + query fanout. */
export interface IssueQueryPlan {
  /** Core subject (person/team) extracted from title+body */
  mainSubject: string;
  /** Romanized subject for overseas searches ("손흥민" → "Son Heung-min") */
  romanizedSubject: string;
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
