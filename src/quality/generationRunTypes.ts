// Type definitions for the per-generation run snapshot store.
// See generationRunStore.ts for the store implementation and usage.

export interface GenerationRunMeta {
  runId: string;
  keyword: string;
  mode: string;
  selectedProvider: string;
  selectedModel: string;
  actualModelsUsed: Array<{ stage: string; provider: string; model: string }>;
  startedAt: string;
  finishedAt?: string;
  sourceCounts: Record<string, number>; // e.g. { news: 4, blog: 6, snippet: 30 }
  searchFailures: Array<{ source: string; status: string; detail?: string }>;
  searchStatus?: string; // overall: SEARCH_OK | SEARCH_EMPTY | SEARCH_RATE_LIMITED | ...
  groundingRequested: boolean;
  groundingActuallyUsed: boolean;
  inputChars: number;
  sourceChars: number;
  instructionChars: number;
  outputChars: number;
  sourceRetention?: {
    rawChars: number;
    cleanChars: number;
    removedChars: number;
    removedRatio: number;
    acceptedSources: number;
    rejectedSources: number;
    unknownDateSources: number;
  };
  postProcessSteps: number;
  outputTruncated?: boolean;
  jsonComplete?: boolean;
  publishDecision?: string; // e.g. 'AUTO_PUBLISH' | 'MANUAL_REVIEW' | 'DRAFT'
  integrity?: Record<string, string>; // gate flags, e.g. { SOURCE_PIPELINE_OK: 'pass', ... }
  extra?: Record<string, unknown>;
}

export interface PostProcessStepRecord {
  stepName: string;
  beforeChars: number;
  afterChars: number;
  deletedChars: number;
  changedSections?: string[];
  reason?: string;
  modelUsed?: string;
  deletedSentences?: string[]; // sentences removed by this step (for audit)
  at: string;
}
