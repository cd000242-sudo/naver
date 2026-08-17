// src/crawler/docCapture/types.ts
// 공식문서 캡처 모드 (경제·지원금 글) — shared types.
// Isolated module tree; never touches the issue-harness or shopping flows.

export interface DocHeadingInput {
  title: string;
  body?: string;
}

export interface DocCapturePayload {
  title: string;
  headings: DocHeadingInput[];
  mainKeyword?: string;
}

/** AI source plan: what program/agency this post is about and where to look. */
export interface DocSourcePlan {
  /** e.g. "소상공인 전기요금 특별지원" */
  programName: string;
  /** e.g. "중소벤처기업부 / 소상공인시장진흥공단" */
  agency: string;
  /** Search queries aimed at official pages (3~5) */
  officialQueries: string[];
  /** Per-heading: what document content would fit under it (Korean) */
  headingGoals: string[];
  aiGenerated: boolean;
}

/** One discovered official page. */
export interface OfficialPage {
  url: string;
  title: string;
  /** 1 = gov.kr/korea.kr/go.kr, 2 = or.kr 준공공 */
  domainTier: 1 | 2;
}

/** One captured viewport segment of an official page. */
export interface CapturedSegment {
  /** PNG buffer of the viewport slice */
  buffer: Buffer;
  sourceUrl: string;
  pageTitle: string;
  /** 0-based scroll segment index within the page */
  segmentIndex: number;
}

/** Vision verdict for one segment. */
export interface SegmentVerdict {
  /** 1-based heading number this segment fits, 0 = none */
  headingIndex: number;
  /** Looks like an official document/notice (not nav/footer/banner) */
  isOfficial: boolean;
  /** Text is legible at blog size */
  legible: boolean;
  summary: string;
}

/** Final per-heading capture ready for renderer placement. */
export interface PlacedCapture {
  heading: string;
  filePath: string;
  previewDataUrl: string;
  sourceUrl: string;
  summary: string;
}

export interface DocProgressInfo {
  percent: number;
  message: string;
}

export interface DocCaptureOptions {
  geminiApiKey?: string;
  /** Max official pages to visit (default 3) */
  maxPages?: number;
  /** Max scroll segments per page (default 5) */
  maxSegmentsPerPage?: number;
  onProgress?: (info: DocProgressInfo) => void;
}

export interface DocCaptureResult {
  /** heading title → placed capture (base64 preview + saved file path) */
  captures: PlacedCapture[];
  /** Official pages actually visited (for 출처 logging) */
  visitedPages: OfficialPage[];
  stats: {
    aiPlanUsed: boolean;
    pagesFound: number;
    pagesVisited: number;
    segmentsCaptured: number;
    segmentsMatched: number;
  };
}
