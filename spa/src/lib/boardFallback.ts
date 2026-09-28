/** Select saved results without spending an AI call or promoting unverified content. */
export type BoardKind = 'topic-briefs' | 'issue-niche' | 'brief-titles';
export type BoardRecord = Record<string, any>;
export type BoardSource = 'site' | 'app';
export interface BoardChoice { board: BoardRecord | null; source: BoardSource | null; generatedAt: string | null; supplementedIssues?: number }
const record = (value: unknown): value is BoardRecord => !!value && typeof value === 'object' && !Array.isArray(value);
const items = (value: unknown): BoardRecord[] => Array.isArray(value) ? value.filter(record) : [];
export function boardStamp(kind: BoardKind, value: unknown): string {
    if (!record(value)) return '';
    return String(value[kind === 'issue-niche' ? 'publishedAt' : kind === 'brief-titles' ? 'generatedAt' : 'builtAt'] || '');
}
const recordArrays = (value: BoardRecord, keys: string[]) => keys.every(key => value[key] === undefined || (Array.isArray(value[key]) && value[key].every(record)));
function usable(kind: BoardKind, value: unknown, now: number): value is BoardRecord {
    if (!record(value)) return false;
    const at = Date.parse(boardStamp(kind, value));
    if (!Number.isFinite(at) || at > now + 300000) return false;
    if (kind === 'topic-briefs') {
        if (!recordArrays(value, ['briefs', 'rounds']) || items(value.rounds).some(round =>
            !recordArrays(round, ['briefs']) || (round.slot !== undefined && !['아침','오후','저녁'].includes(round.slot)))) return false;
        const briefs = [...items(value.briefs), ...items(value.rounds).flatMap(round => items(round.briefs))];
        return briefs.some(brief => typeof brief.title === 'string' && brief.title.trim());
    }
    if (kind === 'issue-niche') {
        if (!recordArrays(value, ['rows', 'observations', 'issues']) || items(value.issues).some(issue =>
            typeof issue.issue !== 'string' || !recordArrays(issue, ['headlines', 'concentrated', 'nextWave'])
            || items(issue.headlines).some(headline => typeof headline.title !== 'string')
            || [...items(issue.concentrated), ...items(issue.nextWave)].some(item => typeof item.keyword !== 'string'))) return false;
        return now - at <= 48 * 3600000
        && (items(value.rows).some(row => typeof row.keyword === 'string' && row.keyword.trim())
            || items(value.observations).some(row => typeof row.keyword === 'string' && row.keyword.trim())
            || items(value.issues).some(issue => typeof issue.issue === 'string' && items(issue.headlines).length > 0));
    }
    return mergeBriefTitles(value, null, now).length > 0;
}
export function chooseBoard(kind: BoardKind, site: unknown, app: unknown, now = Date.now()): BoardChoice {
    const publicBoard = usable(kind, site, now) ? site : null;
    const localBoard = usable(kind, app, now) ? app : null;
    const appHasBrief = kind !== 'issue-niche' || items(localBoard?.issues).some(issue => items(issue.headlines).length > 0
        && ((typeof issue.why === 'string' && issue.why.trim()) || items(issue.nextWave).length > 0));
    const useApp = !!localBoard && (!publicBoard || (appHasBrief && Date.parse(boardStamp(kind, localBoard)) > Date.parse(boardStamp(kind, publicBoard))));
    const supplementation = kind === 'issue-niche' && !useApp && publicBoard && localBoard ? supplementIssueBriefs(publicBoard, localBoard) : null;
    const board = supplementation?.board || (useApp ? localBoard : publicBoard);
    return {board, ...(supplementation?.count ? {supplementedIssues:supplementation.count} : {}), source: board ? useApp ? 'app' : 'site' : null, generatedAt: board ? boardStamp(kind, board) : null};
}
/** Preserve public measurements; only fill missing AI fields for the exact same evidenced event. */
function supplementIssueBriefs(site: BoardRecord, app: BoardRecord): {board: BoardRecord; count: number} {
    const key = (value: unknown) => typeof value === 'string' ? value.replace(/\s+/g, '').toLowerCase() : '';
    const local = new Map(items(app.issues).map(issue => [key(issue.issue), issue]));
    let count = 0;
    const publicIssues = items(site.issues);
    const seen = new Set(publicIssues.map(issue => key(issue.issue)));
    const anchored = [...publicIssues];
    for (const row of [...items(site.rows), ...items(site.observations)]) {
        const issueKey = key(row.issue);
        const saved = local.get(issueKey);
        if (issueKey.length < 2 || seen.has(issueKey) || !saved) continue;
        if (!(typeof saved.why === 'string' && saved.why.trim()) && !items(saved.nextWave).length) continue;
        if (!items(saved.headlines).some(headline => typeof headline.title === 'string' && headline.title.trim())) continue;
        seen.add(issueKey);
        anchored.push({issue:row.issue, issueType:row.issueType || saved.issueType, lane:row.lane || saved.lane,
            issueStatus:row.issueStatus || saved.issueStatus, isHot:row.isHot === true,
            why:null, headlines:[], concentrated:[], nextWave:[]});
    }
    const issues = anchored.map(issue => {
        const saved = local.get(key(issue.issue));
        if (!saved || key(issue.issue).length < 2 || (!(typeof saved.why === 'string' && saved.why.trim()) && !items(saved.nextWave).length)) return issue;
        const evidence = items(saved.headlines).filter(headline => typeof headline.title === 'string' && headline.title.trim());
        if (!evidence.length) return issue;
        const publicEvidence = items(issue.headlines);
        // An entity can have several unrelated stories in one day. Shared evidence anchors the event.
        if (publicEvidence.length && !publicEvidence.some(headline => evidence.some(other =>
            key(headline.title) === key(other.title) || (typeof headline.link === 'string' && headline.link && headline.link === other.link)))) return issue;
        const patch: BoardRecord = {};
        if (!(typeof issue.why === 'string' && issue.why.trim()) && typeof saved.why === 'string' && saved.why.trim()) patch.why = saved.why;
        if (!publicEvidence.length) patch.headlines = evidence;
        if (!items(issue.nextWave).length && items(saved.nextWave).length) patch.nextWave = saved.nextWave;
        if (!Object.keys(patch).length) return issue;
        count++;
        return {...issue, ...patch, briefSource:'app', briefGeneratedAt:app.publishedAt};
    });
    return {board:count ? {...site, issues} : site, count};
}
export interface SavedBriefTitle { keyword: string; seo?: string; home?: string; summary?: string; at: string; source: BoardSource }
export function mergeBriefTitles(site: unknown, app: unknown, now = Date.now()): SavedBriefTitle[] {
    const found = new Map<string, SavedBriefTitle>();
    for (const [input, source] of [[site, 'site'], [app, 'app']] as const) {
        if (!record(input)) continue;
        for (const entry of items(input.titles)) {
            const keyword = typeof entry.keyword === 'string' ? entry.keyword.trim() : '';
            const at = typeof entry.at === 'string' ? entry.at : String(input.generatedAt || '');
            const stamp = Date.parse(at);
            const clean = (key: string) => typeof entry[key] === 'string' ? entry[key].trim().slice(0, key === 'summary' ? 600 : 150) : '';
            const seo = clean('seo'), home = clean('home'), summary = clean('summary');
            if (!keyword || keyword.length > 100 || (!seo && !home) || !Number.isFinite(stamp)
                || stamp > now + 300000 || now - stamp > 24 * 3600000) continue;
            const key = keyword.replace(/\s+/g, '').toLowerCase();
            const previous = found.get(key);
            if (!previous || stamp > Date.parse(previous.at)) found.set(key, {keyword, seo, home, summary, at, source});
        }
    }
    return [...found.values()];
}
