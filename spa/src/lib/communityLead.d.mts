export const LEAD_BOARD: 'news';
/** The first server post of the 최근 소식 board (page 1) is the lead card; every other post stays a row. */
export function splitLead<T extends { id: string; pinned?: boolean; delivery?: string }>(input: {
    boardId: string | undefined;
    page: number | undefined;
    posts: readonly T[] | null | undefined;
}): { lead: T | null; rest: T[] };
