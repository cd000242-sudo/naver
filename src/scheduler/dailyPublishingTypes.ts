export interface DailyPublishingSlot { time: string; count: number }
/**
 * ai-generated: AI only. ai-first: AI, then real photos for empty slots. collect-first: real photos, then AI.
 * The two collect modes need the owner's one-time copyright self-responsibility consent (imageCollectConsent).
 */
export type DailyImageMode = 'official-capture' | 'ai-generated' | 'ai-first' | 'collect-first';
export type DailyCaptureCategory = 'issue' | 'sports' | 'auto';
/** seo: write about the keyword itself (search/mate path). homefeed: write about recent news material. */
export type DailyContentMode = 'seo' | 'homefeed';
/** Take one recommended keyword per post from LEWORD's published "today picks" for these Naver topics (1-3). */
export interface DailyKeywordSource { type: 'leword-today-picks'; topics: string[] }
export interface DailyPublishingPlan {
  accountId: string;
  categoryId: string;
  enabled: boolean;
  mode: 'draft' | 'publish' | 'schedule';
  leadMinutes?: 60;
  slots: DailyPublishingSlot[];
  generator: string;
  imageSource?: string;
  imageMode?: DailyImageMode;
  captureCategory?: DailyCaptureCategory;
  /** The owner agreed that using collected photos is their own legal responsibility. */
  imageCollectConsent?: true;
  /** Search/mate plans, once every keyword was used: expand with related searches (default) or stop and notify. */
  keywordExhaustion?: 'expand' | 'stop';
  /** Optional; with it the free-text topic is ignored. Plans without it behave exactly as before. */
  keywordSource?: DailyKeywordSource;
  /** Optional; overrides the account's content mode for this plan only. */
  contentMode?: DailyContentMode;
  topic: string;
}
export type DailyRunStatus = 'pending' | 'inflight' | 'confirmed' | 'needs_review' | 'cancelled';
export type DailyRunReason = 'execution_uncertain' | 'unavailable' | 'interrupted' | 'stopped' | 'plan_changed' | 'deadline_missed' | 'keywords_exhausted';
export interface DailyPublishingJob {
  key: string;
  accountId: string;
  date: string;
  time: string;
  ordinal: number;
  status: DailyRunStatus;
  createdAt: string;
  updatedAt: string;
  reason?: DailyRunReason;
  publishedUrl?: string;
  scheduledFor?: string;
  prepareAt?: string;
  scheduleVerified?: boolean;
}
export interface DailyPublishingState {
  version: 1;
  revision: number;
  plans: DailyPublishingPlan[];
  runs: DailyPublishingJob[];
  /** When each enabled plan was last started or edited; missed slots are caught up only after this moment. */
  activations?: Record<string, string>;
}
export interface DailyPublishingResult {
  confirmed: boolean;
  publishedUrl?: string;
  draftSaved?: boolean;
  scheduledFor?: string;
  scheduleVerified?: boolean;
  code?: string;
  stopAll?: boolean;
  /** Only a person can clear it (login, challenge, protection, wrong account): the plan stops instead of skipping one post. */
  stopAccount?: boolean;
}
export interface DailyPublishingDependencies {
  load: () => Promise<unknown>;
  save: (state: DailyPublishingState) => Promise<void>;
  execute: (plan: DailyPublishingPlan, job: DailyPublishingJob) => Promise<DailyPublishingResult>;
  checkAvailable: (plan: DailyPublishingPlan) => Promise<{ available: boolean; reason?: string }>;
  now: () => Date;
}
