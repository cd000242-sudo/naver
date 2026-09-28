import { bridgeCall, type BridgeFailure } from './bridge';
import { chooseBoard, mergeBriefTitles, type BoardChoice, type BoardKind, type BoardRecord, type SavedBriefTitle } from './boardFallback';
export interface SavedBoardResult { board: BoardRecord | null; source: 'app'; generatedAt: string | null; state: 'ready' | 'empty' }
export interface BoardLoad extends BoardChoice { appFailure: BridgeFailure | null }
const PUBLIC_PATH: Record<BoardKind, string> = {'topic-briefs':'/data/topic-briefs.json','issue-niche':'/data/issue-niche-board.json','brief-titles':'/data/brief-titles.json'};
async function publicBoard(kind: BoardKind): Promise<unknown> {
    try {
        const response = await fetch(PUBLIC_PATH[kind], {cache:'no-store',signal:AbortSignal.timeout(10000)});
        return response.ok ? await response.json() : null;
    } catch { return null; }
}
const lastGood = new Map<BoardKind, BoardChoice>();
export async function loadSavedBoard(kind: BoardKind): Promise<BoardLoad> {
    const [site, app] = await Promise.all([publicBoard(kind), bridgeCall<SavedBoardResult>(`/v1/bridge/boards/${kind}`, undefined, 3500)]);
    const current = chooseBoard(kind, site, app.status === 'ok' && app.result.state === 'ready' ? app.result.board : null);
    const previous = lastGood.get(kind);
    // Re-read validity (including the issue TTL); an offline retry must not replace a newer saved result.
    const supplementsFresh = kind !== 'issue-niche' || !previous?.supplementedIssues || (previous.board?.issues || []).every((issue: BoardRecord) =>
        issue.briefSource !== 'app' || (Number.isFinite(Date.parse(issue.briefGeneratedAt)) && Date.now() - Date.parse(issue.briefGeneratedAt) <= 48 * 3600000));
    const previousAt = Date.parse(previous?.generatedAt || '');
    const currentAt = Date.parse(current.generatedAt || '');
    const keepPrevious = previous && supplementsFresh && chooseBoard(kind, previous.board, null).board
        && (!current.board || previousAt > currentAt || (previousAt === currentAt && (previous.supplementedIssues || 0) > (current.supplementedIssues || 0)));
    const selected = keepPrevious ? previous : current;
    if (selected.board) lastGood.set(kind, selected);
    return {...selected, appFailure:app.status === 'ok' ? null : app};
}
let titleRequest: Promise<SavedBriefTitle[]> | null = null;
let titleExpires = 0;
export function loadSavedBriefTitles(): Promise<SavedBriefTitle[]> {
    if (!titleRequest || Date.now() >= titleExpires) {
        titleExpires = Date.now() + 30000;
        titleRequest = Promise.all([publicBoard('brief-titles'), bridgeCall<SavedBoardResult>('/v1/bridge/boards/brief-titles', undefined, 3500)])
            .then(([site, app]) => {
                const titles = mergeBriefTitles(site, app.status === 'ok' && app.result.state === 'ready' ? app.result.board : null);
                if (!titles.length) titleExpires = 0;
                return titles;
            }).catch(() => { titleExpires = 0; return []; });
    }
    return titleRequest;
}
export async function createAppBriefTitle(keyword: string) {
    const result = await bridgeCall<SavedBoardResult>('/v1/bridge/brief-titles', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({keyword})}, 300000);
    titleRequest = null;
    return result;
}
export function boardSourceNote(result: BoardChoice): string {
    if (!result.source) return '공개 자료와 앱 저장 결과를 불러오지 못했습니다. 앱을 켠 뒤 다시 확인하세요.';
    const at = result.generatedAt ? new Date(result.generatedAt).toLocaleString('ko-KR', {timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
    return result.source === 'app' ? `앱에서 가져온 결과 · ${at} 생성 · 이 PC에서 확인 중` : `사이트 공개 결과 · ${at} 생성${result.supplementedIssues ? ` · 누락된 이슈 브리프 ${result.supplementedIssues}건은 앱 저장본으로 보강` : ''}`;
}
