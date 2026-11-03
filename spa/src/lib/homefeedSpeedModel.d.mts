export type SpeedLeadStatus = 'ahead' | 'behind' | 'unmeasured';
export type SpeedLeadReason = 'censored' | 'no_first_seen' | 'sample_capped' | 'no_news_sample' | 'within_one_minute';

export type SpeedBuckets = {
    endAt: string;
    bucketMinutes: number;
    counts: number[];
    counted: number;
    undated: number;
    outOfRange: number;
};

export type SpeedLead = {
    status: SpeedLeadStatus;
    minutes: number | null;
    reason: SpeedLeadReason | null;
    resolutionMinutes: number;
    firstSeenAt: string | null;
    firstNewsAt: string | null;
};

export type SpeedScoreboard = {
    windowDays: number;
    measuredDays: number;
    ready: boolean;
    total: number;
    ahead: number;
    behind: number;
    unmeasured: number;
    unmeasuredReasons: Partial<Record<SpeedLeadReason, number>>;
    resolutionMinutes: number;
};

export type SpeedCard = {
    id: string;
    keyword: string;
    category: string;
    buckets: SpeedBuckets | null;
    lead: SpeedLead | null;
};

export type SpeedBoard = {
    publishedAt: string | null;
    snapshotAt: string | null;
    scoreboard: SpeedScoreboard | null;
    cards: SpeedCard[];
};

export type LeadBadge = { tone: SpeedLeadStatus; text: string; detail: string; note: string };
export type ScoreboardLine = { ready: boolean; text: string; detail: string };
export type BarGeometry = {
    width: number;
    height: number;
    max: number;
    bars: Array<{ index: number; count: number; x: number; y: number; width: number; height: number }>;
};

export declare const SPEED_REASON_LABEL: Readonly<Record<SpeedLeadReason, string>>;
export declare function normalizeBuckets(raw: unknown): SpeedBuckets | null;
export declare function normalizeLead(raw: unknown): SpeedLead | null;
export declare function normalizeScoreboard(raw: unknown): SpeedScoreboard | null;
export declare function normalizeSpeedBoard(raw: unknown): SpeedBoard | null;
export declare function formatMinutes(minutes: number): string;
export declare function leadBadge(lead: SpeedLead | null | undefined): LeadBadge;
export declare function scoreboardLine(scoreboard: SpeedScoreboard | null | undefined): ScoreboardLine | null;
export declare function kstClock(iso: string): string;
export declare function barGeometry(buckets: SpeedBuckets, options?: { width?: number; height?: number; gap?: number }): BarGeometry;
export declare function bucketCaption(buckets: SpeedBuckets): string;
export declare function bucketAxis(buckets: SpeedBuckets): { left: string; right: string };
