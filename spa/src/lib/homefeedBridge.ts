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
    editorial?: EditorialView;
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
    /** 앱이 아니라 사이트가 가진 공개본으로 그린 판(2026-09-17) — 누르는 기능은 앱이 있어야 한다. */
    fromPublicFile?: boolean;
    /** 공개본이 쓰인 시각. 브리지 응답에는 없다. */
    publishedAt?: string | null;
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
export type HfDraft = { id: string; createdAt: string; provider: string; titleId: string | null; text: string; problems: string[]; retried: boolean; evidenceHash: string;
    briefRevision?: string; selectionRevision?: number; review?: { passed: boolean; issues: string[] } };
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
    editorial?: EditorialView;
    readOnly?: boolean;
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

/** 앱이 수집할 때마다 써 두는 공개본 — 앱이 꺼져 있어도 이 파일로 그린다(2026-09-17). */
export const HOMEFEED_PUBLIC_URL = '/data/homefeed-stories.json';

type PublicHomefeedPayload = {
    publishedAt?: unknown; computedAt?: unknown; snapshotAt?: unknown;
    historySnapshots?: unknown; storedSnapshots?: unknown;
    sources?: unknown; counts?: unknown; stories?: unknown;
    publicDetails?: Record<string, HfStoryDetail>;
};
let lastPublicPayload: PublicHomefeedPayload | null = null;

/** 공개본에는 내 PC 상태(runtime · settings)가 없다 — 화면이 쓰는 모양으로 채운다. */
function fromPublicFile(payload: PublicHomefeedPayload): HfStoriesResult | null {
    if (!payload || !Array.isArray(payload.stories) || payload.stories.length === 0) return null;
    const counts = (payload.counts && typeof payload.counts === 'object' ? payload.counts : {}) as { status?: unknown; window?: unknown };
    return {
        // 이 판이 공개본이라는 표시 — 화면이 '수집 꺼짐'으로 잘못 읽지 않게 한다.
        fromPublicFile: true,
        publishedAt: typeof payload.publishedAt === 'string' ? payload.publishedAt : null,
        settings: { enabled: false, snapshotIntervalMinutes: 10, imageProvider: 'none', ai: {} },
        runtime: { running: false, lastRunAt: typeof payload.publishedAt === 'string' ? payload.publishedAt : null, lastError: null, lastDurationMs: null, nextRunAt: null },
        computedAt: typeof payload.computedAt === 'string' ? payload.computedAt : null,
        snapshotAt: typeof payload.snapshotAt === 'string' ? payload.snapshotAt : null,
        historySnapshots: typeof payload.historySnapshots === 'number' ? payload.historySnapshots : 0,
        storedSnapshots: typeof payload.storedSnapshots === 'number' ? payload.storedSnapshots : 0,
        sources: Array.isArray(payload.sources) ? payload.sources as HfSourceStatus[] : [],
        counts: {
            status: (counts.status && typeof counts.status === 'object' ? counts.status : {}) as Record<string, number>,
            window: (counts.window && typeof counts.window === 'object' ? counts.window : {}) as Record<string, number>,
        },
        stories: payload.stories as HfStorySummary[],
    };
}

/**
 * 앱이 꺼져 있을 때 읽는 공개본. 없으면 null — 부르는 쪽이 원래 안내를 그대로 보여 준다.
 * 수집 · 제목 만들기 같은 누르는 기능은 여전히 앱이 있어야 한다.
 */
export async function hfPublicStories(): Promise<HfStoriesResult | null> {
    try {
        const response = await fetch(HOMEFEED_PUBLIC_URL, { cache: 'no-store' });
        if (!response.ok) return null;
        const payload = await response.json() as PublicHomefeedPayload;
        const result = fromPublicFile(payload);
        if (result) lastPublicPayload = payload;
        return result;
    } catch {
        return null;
    }
}

export async function hfStories(): Promise<BridgeCallResult<HfStoriesResult>> {
    const called = await bridgeCall<HfStoriesResult>(`${ROUTE}stories`, undefined, 12_000);
    if (called.status === 'ok') {
        // 앱 응답은 바깥 입력이다 — 목록 모양이 아니면 성공으로 넘기지 않는다.
        if (!Array.isArray(called.result.stories) || !Array.isArray(called.result.sources)) {
            return { status: 'error', message: '앱이 스토리 목록을 돌려주지 못했습니다.' };
        }
        return called;
    }
    // 앱이 꺼졌거나 구버전이면 사이트가 가진 공개본으로 그린다 — 앱을 켜지 않아도 보이게(2026-09-17).
    const publicResult = await hfPublicStories();
    if (publicResult) return { status: 'ok', result: publicResult };
    return called;
}

export async function hfStory(id: string, publicOnly = false): Promise<BridgeCallResult<HfStoryDetail>> {
    if (!publicOnly) {
        const called = await bridgeCall<HfStoryDetail>(`${ROUTE}story`, jsonPost({ id }), 20_000);
        if (called.status === 'ok') return called;
        // 앱 연결이 끊겨도 공개된 근거는 계속 읽을 수 있다.
        if (called.status !== 'offline' && called.status !== 'outdated') return called;
    }
    // 상세 새로 읽기는 공개파일도 다시 확인한다. 실패하면 직전에 읽은 공개본을 유지한다.
    await hfPublicStories();
    const detail = lastPublicPayload?.publicDetails?.[id];
    if (!detail || detail.story?.id !== id || !Array.isArray(detail.story.evidence)) {
        return { status: 'error', message: '이 발행분에는 공개 상세가 없습니다. 목록을 새로 고치거나 PC의 LEWORD 앱을 연결하세요.' };
    }
    return { status: 'ok', result: {
        ...detail, readOnly: true, superseded: false,
        editorial: detail.editorial ? { ...detail.editorial, public: true, selection: null } : undefined,
        assets: { review: null, titles: null, prompts: [], promptsRefinedBy: null, selection: null, drafts: [], images: [] },
    } };
}

export const hfBrief = (id: string, provider = '', force = false, evidenceRevision?: string) =>
    bridgeCall<{ editorial: EditorialView; cached: boolean; storyId: string }>(`${ROUTE}brief`, jsonPost({ id, provider, force, evidenceRevision }), 500_000);

export const hfSelectEditorial = (input: EditorialSelectInput) =>
    bridgeCall<{ editorial: EditorialView; selection: EditorialSelection }>(`${ROUTE}select-editorial`, jsonPost(input), 20_000);

export const hfShareEditorial = (id: string, briefRevision: string, share: boolean) =>
    bridgeCall<{ editorial: EditorialView; shared: boolean; publishResult?: { written: string | null; reason: string | null } }>(`${ROUTE}share-editorial`, jsonPost({ id, briefRevision, share }), 20_000);

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
export const hfDraft = (id: string, provider = '', briefRevision?: string, selectionRevision?: number) =>
    bridgeCall<{ draft: HfDraft; problemLabels: string[] }>(`${ROUTE}draft`, jsonPost({ id, provider, briefRevision, selectionRevision }), 620_000);

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
/** 근거와 편집 제안은 구분한다. v1 저장 데이터에 추가되는 선택적 계약이다. */
export const EDITORIAL_VERSION = 'homefeed-editorial-1';

export interface EditorialSource {
  id: string;
  url: string;
  title: string;
  press: string | null;
  publishedAt: string | null;
  level: 'headline' | 'description' | 'body';
  text: string;
  contentHash: string;
  fetchStatus: 'not_requested' | 'ok' | 'unavailable';
  imageUrl: string | null;
}

export interface EditorialFact {
  id: string;
  text: string;
  supports: Array<{ sourceId: string; excerpt: string }>;
}

export interface EditorialSection {
  id: string;
  question: string;
  answer: string;
  factIds: string[];
}

export interface EditorialAngle {
  id: string;
  label: string;
  readerQuestion: string;
  difference: string;
  sectionIds: string[];
  suggestedTitle: string;
  firstCard: { line1: string; line2: string };
}

export interface EditorialContent {
  summary: string;
  summaryFactIds: string[];
  whyNow: string;
  whyNowFactIds: string[];
  audience: string;
  facts: EditorialFact[];
  recommendedAngleId: string;
  angles: EditorialAngle[];
  sections: EditorialSection[];
  unresolved: string[];
}

export interface EditorialBrief extends EditorialContent {
  id: string;
  version: typeof EDITORIAL_VERSION;
  revision: string;
  evidenceRevision: string;
  sourceRevision: string;
  createdAt: string;
  provider: string;
  sources: EditorialSource[];
  readiness: 'ready' | 'needs_evidence';
  problems: string[];
  review: { passed: boolean; issues: string[] };
}

export interface EditorialSelection {
  revision: number;
  briefRevision: string;
  evidenceRevision: string;
  angleId: string;
  title: string;
  card: { line1: string; line2: string };
  /** source id or generated image id, never an array offset. */
  imageId: string | null;
  selectedAt: string;
}

export interface EditorialFailure { at: string; evidenceRevision: string; message: string }

export interface EditorialView {
  shared?: boolean;
  state: 'unprepared' | 'ready' | 'needs_evidence' | 'stale' | 'failed';
  evidenceRevision: string;
  summary: string;
  sourceTitle: string;
  sourceUrl: string | null;
  brief: EditorialBrief | null;
  selection: EditorialSelection | null;
  error: string | null;
  public?: boolean;
}

export interface EditorialBriefInput { id: string; provider?: string; force?: boolean; evidenceRevision?: string }
export interface EditorialSelectInput {
  id: string;
  briefRevision: string;
  evidenceRevision: string;
  expectedRevision: number;
  angleId: string;
  title: string;
  card: { line1: string; line2: string };
  imageId: string | null;
}
