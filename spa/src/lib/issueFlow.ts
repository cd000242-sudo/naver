/**
 * 실검 틈새 보드(정적 JSON) 읽기 — 실검 틈새 탭과 홈 실시간 검색어 브리프가 같이 쓴다.
 *
 * 사장님 CI 가 하루 3회 발행하는 `/data/issue-niche-board.json` 을 그대로 읽는다.
 * 여기서 새로 만드는 판정은 없다. 회차가 실측·추론해 실어 준 값을 찾아 줄 뿐이다.
 *
 * 브리프 모달(사장님 2026-09-03: "실시간 검색어 브릿지가 너무 빈약해")은 검색어로
 * 이슈 묶음을 찾아 "왜 뜨나 · 어디에 몰렸나 · 다음 물결"을 붙인다. 못 찾으면 없다고
 * 둔다 — 비슷한 이슈를 억지로 붙이면 남의 사실이 된다.
 */

export type IssueLane = 'realtime' | 'tech' | 'policy';
export type IssueVerdict = 'niche' | 'preemption';
export type IssueOrigin = 'head' | 'next-wave' | 'autocomplete' | 'derived' | 'related';

/** 발행 행 — 황금키워드 카드(PreemptionRow)가 읽는 필드를 그대로 갖춘다. */
export type IssueBoardRow = {
    keyword: string;
    issue: string;
    topic: string;
    lane: IssueLane;
    issueType: string;
    isDerived: boolean;
    origin?: IssueOrigin;
    originReason?: string | null;
    verdict: IssueVerdict;
    documentCount: number | null;
    documentCountMeasured: boolean;
    searchVolume: number | null;
    hasLiveDemand: boolean;
    demandStatus: string;
    demandRatio: number | null;
    issueStatus: string;
    isHot: boolean;
    frontalDocCount: number | null;
    freshFrontalCount: number | null;
    reasons: string[];
    evidence: Array<{ code: string; text: string }>;
    whySearch?: { text: string; basis?: string } | null;
    intentLabel?: string;
    adsenseFit?: boolean | null;
    adsenseReason?: string;
    titles?: {
        seo?: { text: string; frame?: string; basis?: string };
        home?: { text: string; frame?: string; basis?: string };
    } | null;
    subKeywords?: { keyword: string; searchVolume: number | null; frame?: string }[];
    keywordPool?: Array<{ keyword: string; searchVolume: number | null; documentCount?: number | null; source?: string }> | null;
    trend?: { series: number[]; label?: string; recommendation?: string } | null;
    kinCount?: number | null;
    kinTop?: Array<{ title: string; link: string; views?: number | null; answers?: number | null }> | null;
    monetize?: { verdict: 'good' | 'bad' | 'mixed'; points: Array<{ text: string }>; angle?: string } | null;
    measuredAt: string;
    carried?: boolean;
};

export type IssueHeadline = { title: string; press?: string; publishedAt?: string; link?: string };

export type IssueNextWave = {
    keyword: string;
    /** 에이전트가 댄 이유 — 추론이다. 실측이 아니라고 화면이 밝힌다. */
    reason: string;
    searchVolume: number | null;
    documentCount: number | null;
    /** 보드 후보로 실측까지 갔는가. */
    onBoard: boolean;
};

/** 이슈 묶음 브리핑 — 왜 뜨나(헤드라인 검증 통과분만)·몰린 말·다음 물결. */
export type IssueBrief = {
    issue: string;
    issueType: string;
    lane: IssueLane;
    issueStatus: string;
    isHot: boolean;
    why: string | null;
    headlines: IssueHeadline[];
    concentrated: Array<{ keyword: string; searchVolume: number | null; origin?: IssueOrigin }>;
    nextWave: IssueNextWave[];
    rowCount: number;
    carried?: boolean;
};

export type IssueBoard = {
    publishedAt?: string;
    generator?: string;
    schedule?: string;
    measured?: { issues?: number; candidates?: number; niche?: number; preemption?: number };
    freeSample?: { day: string; keywords: string[] };
    rows: IssueBoardRow[];
    issues: IssueBrief[];
};

export const ISSUE_BOARD_URL = '/data/issue-niche-board.json';

/** 이슈 유형 표기 — 실검 틈새 탭과 홈 브리프 모달이 같은 말을 쓴다. */
export const ISSUE_TYPE_LABEL: Record<string, string> = {
    policy: '정책', incident: '사건', entertainment: '연예', fresh: '이슈',
};

/**
 * 행의 배열 필드를 배열로 맞춘다 — 카드(BoardCardHead)는 `row.evidence.map` 을 그대로
 * 부른다. 발행 스키마가 바뀌기 전 회차의 행이 48시간 이월로 섞여 오면(2026-09-03
 * 실사고: 28행에 evidence 없음) 탭 전체가 죽었다. 읽는 쪽 경계에서 막는다.
 */
function normalizeRow(row: IssueBoardRow): IssueBoardRow {
    return {
        ...row,
        reasons: Array.isArray(row.reasons) ? row.reasons : [],
        evidence: Array.isArray(row.evidence) ? row.evidence : [],
    };
}

/** 발행본을 읽는다. 없거나 깨졌으면 null — 화면이 '아직 없음'으로 적는다. */
export async function fetchIssueBoard(): Promise<IssueBoard | null> {
    try {
        const response = await fetch(ISSUE_BOARD_URL, { cache: 'no-store' });
        if (!response.ok) return null;
        const data = await response.json();
        return {
            ...data,
            rows: Array.isArray(data?.rows) ? data.rows.map(normalizeRow) : [],
            issues: Array.isArray(data?.issues) ? data.issues : [],
        };
    } catch {
        return null;
    }
}

let boardOnce: Promise<IssueBoard | null> | null = null;

/** 브리프 모달용 — 페이지 한 번에 한 번만 읽는다(카드마다 열 때마다 받지 않게). */
export function loadIssueBoardOnce(): Promise<IssueBoard | null> {
    if (!boardOnce) boardOnce = fetchIssueBoard();
    return boardOnce;
}

/** 공백·대소문자를 지운 비교 키. "김종철 경찰청장 대행" 과 "김종철경찰청장대행" 은 같은 말이다. */
export function compactKey(value: string): string {
    return String(value || '').replace(/\s+/g, '').toLowerCase();
}

/**
 * 검색어로 이슈 묶음을 찾는다. 이슈명 일치 → 그 이슈의 행 키워드 일치 → 한쪽이 다른
 * 쪽을 통째로 담는 경우(4자 이상) 순. 그 밖은 null — 비슷하다고 붙이지 않는다.
 */
export function findIssueBrief(board: IssueBoard | null | undefined, keyword: string): IssueBrief | null {
    if (!board) return null;
    const key = compactKey(keyword);
    if (key.length < 2) return null;
    const exact = board.issues.find((issue) => compactKey(issue.issue) === key);
    if (exact) return exact;
    const row = board.rows.find((item) => compactKey(item.keyword) === key);
    if (row) {
        const byRow = board.issues.find((issue) => compactKey(issue.issue) === compactKey(row.issue));
        if (byRow) return byRow;
    }
    if (key.length < 4) return null;
    return board.issues.find((issue) => {
        const issueKey = compactKey(issue.issue);
        return issueKey.length >= 4 && (issueKey.includes(key) || key.includes(issueKey));
    }) || null;
}

/** 이슈에 속한 발행 행 — 브리프 옆에 "이미 실측된 카드"로 잇는다. */
export function rowsOfIssue(board: IssueBoard | null | undefined, issue: IssueBrief): IssueBoardRow[] {
    if (!board) return [];
    const key = compactKey(issue.issue);
    return board.rows.filter((row) => compactKey(row.issue) === key);
}
