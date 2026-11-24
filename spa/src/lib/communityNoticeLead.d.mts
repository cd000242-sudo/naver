export const NOTICE_LEAD_BOARD: 'notice';
/** Page 1 of 공지사항, newest first: the first ordinary post is the open card; every other post stays a row. */
export function splitNoticeLead<T extends { id: string; pinned?: boolean; delivery?: string }>(input: {
    boardId: string | undefined;
    page: number | undefined;
    sort: string | undefined;
    posts: readonly T[] | null | undefined;
}): { lead: T | null; rest: T[] };
export type NoticeBodyDetail = { body: string; format: '' | 'rich' };
export function bodyFromReply(reply: unknown): NoticeBodyDetail | null;
export function createNoticeBodyStore(fetchPost: (id: string) => Promise<unknown> | unknown): {
    peek(id: string): NoticeBodyDetail | null;
    load(id: string): Promise<NoticeBodyDetail | null>;
};
