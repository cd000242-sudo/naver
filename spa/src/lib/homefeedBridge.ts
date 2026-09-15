/**
 * 홈판 신호 브리지 클라이언트 — /v1/bridge/homefeed/* (사장님 명령서 STORY RADAR v2.0, 2026-09-16).
 *
 * 수집 · 판정은 사용자 PC 의 LEWORD 앱이 켜 둔 동안 10분마다 쌓은 스냅샷으로 하고, 사이트는 그리기만 한다.
 * 제목 · 원고 · 이미지는 누를 때만 앱이 내 구독 에이전트로 만든다 — 사이트는 재료(스토리 id · 고른 id)만 보낸다.
 * 404 는 '앱이 구버전'이다(bridgeCall 규칙). 지금 계산본에 없는 스토리는 앱이 410 으로 따로 알린다.
 */
import { BRIDGE_BASE, bridgeCall, type BridgeCallResult } from './bridge';

const ROUTE = '/v1/bridge/homefeed/';
const jsonPost = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

export type HfWindowState = 'OPENING' | 'OPEN' | 'NARROWING' | 'CLOSED' | 'UNKNOWN';
export type HfStatusState = 'NOW' | 'EARLY' | 'WATCH' | 'LATE' | 'DROP';
export type HfDecision<T extends string> = { state: T; reasons: string[] };
export type HfEvidence = { title: string; url: string; press: string | null; publishedAt: string | null };
export type HfCheck = { id: string; passed: boolean; reason: string };
export type HfImageRef = { kind: 'real' | 'ai' | 'none'; guideId: string | null; imageUrl: string | null };

export type HfSignals = {
    ageMinutes: number | null;
    firstSeenAt: string | null;
    firstSeenCensored: boolean;
    sourceCountNow: number | null;
    sourceNames: string[];
    sourceDelta30m: number | null;
    sourceDelta60m: number | null;
    pressCountNow: number;
    rankNow: number | null;
    rankSource: string | null;
    rankDelta30m: number | null;
    rankDelta60m: number | null;
    newsTotalNow: number | null;
    newsDelta30m: number | null;
    blogDocNow: number | null;
    docDelta10m: number | null;
    docDelta30m: number | null;
    docDelta60m: number | null;
    docVelocity30m: number | null;
    docAcceleration: number | null;
    persistenceStreak: number;
    presence60m: { seen: number; total: number };
    sampleN: number;
    cloneN: number | null;
    cloneRatio: number | null;
    cloneRatioPrev30m: number | null;
    visualCandidateCount: number;
};

export type HfDelta = { text: string; newTokens: string[]; evidence: HfEvidence; comparedWith: string };

export type HfStorySummary = {
    id: string;
    issueKey: string;
    keyword: string;
    category: string;
    capturedAt: string;
    window: HfDecision<HfWindowState>;
    status: HfDecision<HfStatusState>;
    anchor: { text: string; category: string };
    delta: HfDelta | null;
    deltaReason: string | null;
    signals: HfSignals;
    tensions: Array<{ type: string; matched: string }>;
    funGap: Array<{ flag: string; note: string }>;
    alternativeAngles: string[];
    payoffCount: number;
    noSearchPassed: boolean;
    tellable: string | null;
    firstCard: { headline1: string; headline2: string | null; hook: string | null; possible: boolean };
    visualStrategy: string;
    thumbnail: { type: string; readiness: string; heroImageUrl: string | null };
    risks: string[];
    progress: { titles: boolean; selected: boolean; drafts: number; images: number };
};

export type HfSourceStatus = {
    name: string;
    lastSuccessAt: string | null;
    lastErrorAt: string | null;
    lastError: string | null;
    consecutiveFailures: number;
    lastCount: number;
    skipped: boolean;
};

export type HfRuntime = { running: boolean; lastRunAt: string | null; lastError: string | null; lastDurationMs: number | null; nextRunAt: string | null };

export type HfStoriesResult = {
    settings: { enabled: boolean; snapshotIntervalMinutes: number; imageProvider: string; ai: Record<string, boolean> };
    runtime: HfRuntime;
    computedAt: string | null;
    snapshotAt: string | null;
    historySnapshots: number;
    storedSnapshots: number;
    sources: HfSourceStatus[];
    counts: { status: Record<string, number>; window: Record<string, number> };
    stories: HfStorySummary[];
};

export type HfRealImage = {
    id: string;
    role: 'hero' | 'proof' | 'secondary' | 'context';
    sourceName: string | null;
    sourceUrl: string;
    imageUrl: string | null;
    pageLocation: string;
    caption: string | null;
    watermark: 'yes' | 'no' | 'unknown';
    rightsStatus: string;
    whyThisImage: string;
    cropFocus: string;
    avoidCrop: string;
    mobileReadability: string;
    thumbnailSuitability: { label: 'good' | 'check' | 'weak'; basis: string };
};

export type HfPromptPlan = {
    id: string;
    purpose: string;
    placement: string;
    aspectRatio: string;
    composition: string;
    subject: string;
    background: string;
    lighting: string;
    camera: string;
    realism: string;
    koreanContext: string;
    textSpace: string;
    negativePrompt: string;
    finalPromptKo: string;
    finalPromptEn: string;
    realPersonSafe: boolean;
    label: string;
    refinedBy: string | null;
};

export type HfThumbnail = {
    type: string;
    goal: string;
    heroImage: HfImageRef;
    crop: { position: string; margin: string; gaze: string; removeBackground: boolean; identifiableIn1s: string };
    textOverlay: string[];
    textPosition: string;
    copyVariants: string[];
    visualHierarchy: string;
    doNotUse: string[];
    evaluation: HfCheck[];
    readiness: string;
    readinessReasons: string[];
};

export type HfCardVariant = { id: 'A' | 'B' | 'C'; label: string; image: HfImageRef; line1: string; line2: string | null };

export type HfFirstCard = {
    possible: boolean;
    imageStrategy: string;
    image: HfImageRef;
    cropGuidance: string;
    headline1: string;
    headline2: string | null;
    hook: string | null;
    secondHook: string | null;
    reason: string;
    checks: HfCheck[];
    variants: HfCardVariant[];
};

export type HfStory = {
    id: string;
    issueKey: string;
    keyword: string;
    category: string;
    capturedAt: string;
    evidenceHash: string;
    signals: HfSignals;
    anchor: { text: string; category: string };
    delta: HfDelta | null;
    deltaReason: string | null;
    tensions: Array<{ type: string; matched: string; evidence: HfEvidence }>;
    dominantAngle: { label: string; tokens: string[]; evidence: HfEvidence[] } | null;
    alternativeAngles: Array<{ label: string; tokens: string[]; evidence: HfEvidence[] }>;
    angleConfidence: 'high' | 'medium' | 'low';
    funGap: Array<{ flag: string; note: string; evidence: HfEvidence }>;
    payoffLayers: Array<{ kind: 'number' | 'quote' | 'event'; value: string; evidence: HfEvidence }>;
    noSearch: {
        situationIn1s: boolean; immediateWhy: boolean; answerWanted: boolean; imageIncreasesCuriosity: boolean; payoffBeyondAnswer: boolean;
        passed: boolean; checks: HfCheck[];
    };
    tellability: { passed: boolean; sentence: string | null; evidence: HfEvidence | null; reason: string };
    firstCard: HfFirstCard;
    visual: { strategy: string; reason: string; whyReal: string; whyAi: string; evidenceImageRequired: boolean };
    realImages: HfRealImage[];
    aiPrompts: HfPromptPlan[];
    thumbnail: HfThumbnail;
    window: HfDecision<HfWindowState>;
    status: HfDecision<HfStatusState>;
    risks: string[];
    boardWhy: string | null;
    evidence: Array<HfEvidence & { image: string | null; origin: string }>;
};

export type HfTimelinePoint = {
    capturedAt: string;
    present: boolean;
    rank: number | null;
    sourceCount: number | null;
    newsTotal: number | null;
    blogDocCount: number | null;
    sampleN: number | null;
};

export type HfTitleCandidate = {
    id: string;
    title: string;
    firstHook: string;
    secondHook: string;
    triggerType: string | null;
    verdict: 'STOP' | 'FLAT' | 'OVER';
    reasons: string[];
    aiVerdict: string | null;
    overlapWithSample: number | null;
    overclaim: { unsupportedNumbers: string[]; hypeWords: string[] };
    bestVisualPair: 'real' | 'ai' | 'hybrid' | null;
    thumbCopy: string | null;
};

export type HfPair = { id: string; titleId: string; title: string; visualStrategy: string; heroImage: HfImageRef; thumbnailCopy: string[]; why: string };

export type HfTitles = {
    evidenceHash: string;
    provider: string;
    createdAt: string;
    candidates: HfTitleCandidate[];
    top: string[];
    pairs: HfPair[];
    cached?: boolean;
    stale?: boolean;
};

export type HfSelection = { storyId: string; titleId: string; pairId: string | null; selectedAt: string };
export type HfDraft = { id: string; createdAt: string; provider: string; titleId: string | null; text: string; problems: string[]; retried: boolean; evidenceHash: string };
export type HfImageRecord = {
    id: string; storyId: string; promptId: string; createdAt: string; provider: string; aspectRatio: string;
    promptKo: string; promptEn: string; mime: string; bytes: number; width: number | null; height: number | null; aiGenerated: true; label: string;
};
export type HfReview = {
    provider: string;
    createdAt: string;
    evidenceHash: string;
    tensions: Array<{ type: string; evidenceIndex: number; note: string }>;
    funGap: Array<{ flag: string; evidenceIndex: number; note: string }>;
    risks: string[];
};

export type HfStoryDetail = {
    story: HfStory;
    superseded: boolean;
    timeline: HfTimelinePoint[];
    assets: {
        review: (HfReview & { stale: boolean }) | null;
        titles: (HfTitles & { stale: boolean }) | null;
        prompts: HfPromptPlan[];
        promptsRefinedBy: string | null;
        selection: HfSelection | null;
        drafts: HfDraft[];
        images: HfImageRecord[];
    };
};

export type HfVisualResult = {
    decision: HfStory['visual'];
    realImages: HfRealImage[];
    prompts: HfPromptPlan[];
    refinedBy: string | null;
    thumbnail: HfThumbnail;
    firstCard: HfFirstCard;
    imageProvider: string;
    aiLabel: string;
    images: HfImageRecord[];
};

export type HfImageResult =
    | { status: 'ok'; image: HfImageRecord }
    | { status: 'disabled'; message: string; prompt: string }
    | { status: 'failed'; code: string; message: string };

export type HfPost = {
    id: string; storyId: string; issueKey: string; keyword: string; title: string; titleId: string | null; triggerType: string | null;
    storyPattern: string | null; visualStrategy: string | null; thumbnailType: string | null; thumbnailHasText: boolean | null;
    postUrl: string; publishedAt: string; recordedAt: string;
    atPublish: { window: string; status: string; ageMinutes: number | null; sourceCountNow: number | null; cloneRatio: number | null };
};

export type HfCheckpoint = '30m' | '2h' | '6h' | '24h';
export const HF_CHECKPOINTS: readonly HfCheckpoint[] = ['30m', '2h', '6h', '24h'];

export type HfPerformanceEntry = {
    postId: string; checkpoint: HfCheckpoint; recordedAt: string;
    totalViews: number | null; searchViews: number | null; recommendViews: number | null; feedSeen: boolean | null; referrerNote: string;
};

export type HfCalibrationGroup = {
    dimension: string; value: string; n: number; display: 'sample_short' | 'counts' | 'rates';
    entered: number | null; medianRecommend24h: number | null; p25: number | null; p75: number | null; entryRate: number | null;
};

export type HfCalibration = {
    summary: { totalPosts: number; measured24h: number; thresholds: { sampleShortN: number; successRateMinN: number }; groups: HfCalibrationGroup[] };
    posts: Array<HfPost & { checkpoints: Record<HfCheckpoint, HfPerformanceEntry | null> }>;
};

export type HfSettings = {
    schemaVersion: string;
    enabled: boolean;
    snapshotIntervalMinutes: number;
    issueLimit: number;
    newsSampleSize: number;
    ogImagesPerIssue: number;
    retentionDays: number;
    cloneThreshold: number;
    window: { openingMaxAgeMinutes: number; openMinSources: number; openMaxCloneRatio: number; narrowingCloneRise: number; narrowingDocVelocity: number; closedCloneRatio: number };
    story: { payoffMin: number; minSamplesForNow: number; minPressForNow: number };
    sources: { signalBz: boolean; hotLanes: boolean; naverNews: boolean; naverBlog: boolean; siteBoard: boolean; ogImage: boolean };
    ai: { storyReview: boolean; title: boolean; visualPrompt: boolean; draft: boolean };
    imageProvider: 'none' | 'codex-builtin';
    defaultAspectRatio: string;
    thumbnailTextMaxChars: number;
    calibration: { sampleShortN: number; successRateMinN: number };
    updatedAt: string | null;
};

export async function hfStories(): Promise<BridgeCallResult<HfStoriesResult>> {
    const called = await bridgeCall<HfStoriesResult>(`${ROUTE}stories`, undefined, 12_000);
    if (called.status !== 'ok') return called;
    // 앱 응답은 바깥 입력이다 — 목록 모양이 아니면 성공으로 넘기지 않는다.
    if (!Array.isArray(called.result.stories) || !Array.isArray(called.result.sources)) {
        return { status: 'error', message: '앱이 스토리 목록을 돌려주지 못했습니다.' };
    }
    return called;
}

export const hfStory = (id: string) => bridgeCall<HfStoryDetail>(`${ROUTE}story`, jsonPost({ id }), 20_000);

export const hfCollect = () => bridgeCall<{ ok: boolean; skipped?: boolean; error?: string; stories?: number; issues?: number }>(`${ROUTE}collect`, jsonPost({}), 240_000);

export const hfReview = (id: string, provider = '', force = false) =>
    bridgeCall<{ review: HfReview; cached: boolean }>(`${ROUTE}review`, jsonPost({ id, provider, force }), 200_000);

export const hfTitles = (id: string, provider = '', force = false) =>
    bridgeCall<HfTitles>(`${ROUTE}titles`, jsonPost({ id, provider, force }), 260_000);

export const hfVisual = (id: string, provider = '', refine = false) =>
    bridgeCall<HfVisualResult>(`${ROUTE}visual`, jsonPost({ id, provider, refine }), 200_000);

export const hfSelect = (id: string, titleId: string, pairId = '') =>
    bridgeCall<{ selection: HfSelection; title: string; verdict: string; pair: HfPair | null }>(`${ROUTE}select`, jsonPost({ id, titleId, pairId }), 15_000);

/** 원고는 검사에 걸리면 한 번 다시 쓴다 — 최악 두 번의 생성 시간을 기다린다. */
export const hfDraft = (id: string, provider = '') =>
    bridgeCall<{ draft: HfDraft; problemLabels: string[] }>(`${ROUTE}draft`, jsonPost({ id, provider }), 560_000);

export const hfImage = (id: string, promptId: string, prompt: string, aspectRatio: string) =>
    bridgeCall<HfImageResult>(`${ROUTE}image`, jsonPost({ id, promptId, prompt, aspectRatio }), 340_000);

/** 생성 이미지를 받아 이 페이지 안에서만 쓰는 주소로 만든다. 못 받으면 null. */
export async function hfImageObjectUrl(id: string): Promise<string | null> {
    try {
        const response = await fetch(`${BRIDGE_BASE}${ROUTE}image-file?id=${encodeURIComponent(id)}`);
        if (!response.ok) return null;
        const blob = await response.blob();
        return blob.type.startsWith('image/') ? URL.createObjectURL(blob) : null;
    } catch {
        return null;
    }
}

export const hfPublish = (id: string, postUrl: string, publishedAt: string, titleId = '') =>
    bridgeCall<{ post: HfPost }>(`${ROUTE}publish`, jsonPost({ id, postUrl, publishedAt, titleId }), 15_000);

export const hfPerformance = (input: {
    postId: string; checkpoint: HfCheckpoint; totalViews: number | null; searchViews: number | null; recommendViews: number | null; feedSeen: boolean | null; referrerNote: string;
}) => bridgeCall<{ entry: HfPerformanceEntry }>(`${ROUTE}performance`, jsonPost(input), 15_000);

export const hfCalibration = () => bridgeCall<HfCalibration>(`${ROUTE}calibration`, undefined, 15_000);

export function hfSettings(): Promise<BridgeCallResult<{ settings: HfSettings }>>;
export function hfSettings(patch: Record<string, unknown>): Promise<BridgeCallResult<{ settings: HfSettings; startedCollection: boolean }>>;
export function hfSettings(patch?: Record<string, unknown>) {
    return patch
        ? bridgeCall<{ settings: HfSettings; startedCollection: boolean }>(`${ROUTE}settings`, jsonPost({ patch }), 20_000)
        : bridgeCall<{ settings: HfSettings }>(`${ROUTE}settings`, undefined, 12_000);
}
