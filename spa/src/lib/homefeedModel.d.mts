export declare const UNMEASURED: '미측정';
export declare const WINDOW_LABEL: Readonly<Record<string, string>>;
export declare const STATUS_LABEL: Readonly<Record<string, string>>;
export declare const CATEGORY_LABEL: Readonly<Record<string, string>>;
export declare const TENSION_LABEL: Readonly<Record<string, string>>;
export declare const FUN_GAP_LABEL: Readonly<Record<string, string>>;
export declare const STRATEGY_LABEL: Readonly<Record<string, string>>;
export declare const READINESS_LABEL: Readonly<Record<string, string>>;
export declare const VERDICT_LABEL: Readonly<Record<string, string>>;
export declare const TRIGGER_LABEL: Readonly<Record<string, string>>;
export declare const SOURCE_LABEL: Readonly<Record<string, string>>;
export declare const RIGHTS_LABEL: Readonly<Record<string, string>>;
export declare const WATERMARK_LABEL: Readonly<Record<string, string>>;

export declare function reasonLabel(code: string): string;
export declare function formatCount(value: number | null | undefined, unit?: string): string;
export declare function formatSigned(value: number | null | undefined, unit?: string): string;
export declare function formatRankDelta(value: number | null | undefined): string;
export declare function formatDuration(minutes: number | null | undefined): string;
export declare function formatAge(minutes: number | null | undefined, censored: boolean): string;
export declare function formatSaturation(sampleN: number | null | undefined, cloneN: number | null | undefined): string;
export declare function formatPresence(presence: { seen: number; total: number } | null | undefined): string;
export declare function formatVelocity(value: number | null | undefined): string;
export declare function formatTime(iso: string | null | undefined): string;

export type HomefeedFilters = {
    status: string;
    category: string;
    window: string;
    period: string;
    funGap: boolean;
    noSearch: boolean;
    payoff2: boolean;
    visualReady: boolean;
    query: string;
};
export declare const DEFAULT_FILTERS: Readonly<HomefeedFilters>;

export type HomefeedStoryLike = {
    keyword: string;
    category: string;
    anchor?: { text: string };
    window: { state: string };
    status: { state: string };
    signals: {
        ageMinutes: number | null;
        firstSeenCensored: boolean;
        docAcceleration: number | null;
        sourceCountNow: number | null;
    };
    funGap: readonly unknown[];
    noSearchPassed: boolean;
    payoffCount: number;
    thumbnail: { readiness: string };
};

export declare function filterStories<T extends HomefeedStoryLike>(stories: readonly T[], filters?: HomefeedFilters): T[];
export declare const SORT_OPTIONS: ReadonlyArray<{ id: string; label: string }>;
export declare function sortStories<T extends HomefeedStoryLike>(stories: readonly T[], key?: string): T[];
export declare function countBy<T>(stories: readonly T[], pick: (story: T) => string): Record<string, number>;

export type HomefeedSourceHealthRow = {
    name: string;
    label: string;
    state: 'ok' | 'error' | 'skipped';
    lastSuccessAt: string | null;
    lastError: string | null;
    consecutiveFailures: number;
};
export declare function sourceHealth(sources: ReadonlyArray<{ name: string; skipped: boolean; consecutiveFailures: number; lastSuccessAt: string | null; lastError: string | null }>): {
    rows: HomefeedSourceHealthRow[];
    ok: number;
    error: number;
    skipped: number;
};

export declare function calibrationText(group: {
    display: 'sample_short' | 'counts' | 'rates';
    n: number;
    entered: number | null;
    medianRecommend24h: number | null;
    p25: number | null;
    p75: number | null;
    entryRate: number | null;
} | null | undefined): string;

export declare const CHECK_LABEL: Readonly<Record<string, string>>;
export declare const DRAFT_PROBLEM_LABEL: Readonly<Record<string, string>>;
export declare const DIMENSION_LABEL: Readonly<Record<string, string>>;
export declare const IMAGE_ROLE_LABEL: Readonly<Record<string, string>>;
export declare const SUITABILITY_LABEL: Readonly<Record<string, string>>;
export declare const ANGLE_CONFIDENCE_LABEL: Readonly<Record<string, string>>;
export declare function dimensionValueLabel(dimension: string, value: string): string;

export declare const PROVIDERS: ReadonlyArray<{ id: string; label: string }>;
