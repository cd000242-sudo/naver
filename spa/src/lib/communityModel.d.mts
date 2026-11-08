export type BoardId = 'notice' | 'news' | 'request' | 'inquiry' | 'free' | 'promo';
export type BoardConfig = Readonly<{
    id: BoardId;
    label: string;
    writeRole: 'member' | 'operator' | 'admin';
    dailyLimit: number;
    statuses: readonly string[];
    defaultStatus: string;
    note: string;
}>;
export type SortKey = 'latest' | 'popular' | 'comments';
export type GradeInfo = { key: string; label: string; min?: number; nextAt?: number | null; nextLabel?: string | null };
export type ProfileLike = { role?: string; canWriteNews?: boolean; score?: number; grade?: GradeInfo; level?: unknown; levelUp?: unknown } | null | undefined;

export const BOARD_ORDER: readonly BoardId[];
export const SORTS: readonly Readonly<{ key: SortKey; label: string }>[];
export const GRADE_GUIDE: readonly Readonly<{ key: string; label: string; min: number; range: string; reward: string; condition: string; conditionDetail: string }>[];
export const SCORE_RULES: string;
export const NOTICE_WRITE_HINT: string;
export const TITLE_MAX: number;
export const BODY_MAX: number;
export const COMMENT_MAX: number;

export function boardList(serverConfig?: { boards?: Array<Record<string, unknown>> } | null): BoardConfig[];
export function boardLabel(id: string, boards?: readonly BoardConfig[]): string;
export function normalizeSort(value: unknown): SortKey;
export function statusBadge(boardId: string, status: unknown): { tone: 'wait' | 'done' | 'review'; label: string } | null;
export function canWriteBoard(target: BoardConfig | undefined, profile: ProfileLike): boolean;
export function showWriteButton(boardId: string, boards: readonly BoardConfig[]): boolean;
export function isNoticePost(post: unknown): boolean;
export function splitNoticePosts<T>(posts: readonly T[] | null | undefined): { notice: T[]; rest: T[] };
export function writeBlockedHint(boardId: string, profile: ProfileLike): string;
export function writableBoards(boards: readonly BoardConfig[], profile: ProfileLike): BoardConfig[];
export function gradeProgress(profile: ProfileLike): { percent: number; remain: number; nextLabel: string | null; text: string };
export function pageNumbers(page: number, totalPages: number, span?: number): number[];
export function formatPostDate(iso: unknown, now?: number): string;
export function countComments(tree: unknown): number;
export function validatePostDraft(input: { boards?: readonly BoardConfig[]; board: string; title?: string; body?: string; url?: string; platform?: string }): string;
export function validateCommentDraft(text: unknown): string;
export function platformLabel(key: unknown): string;

export const ALL_BOARD: 'all';
export const REPORT_REASONS: readonly Readonly<{ key: string; label: string }>[];
export function reportReasons(serverConfig?: { reportReasons?: Array<Record<string, unknown>> } | null): Array<{ key: string; label: string }>;

export type CommunityView = { board: BoardId | 'all'; platform: 'naver' | 'google'; sort: SortKey; page: number; post: string; write: boolean };
export function communityPath(view?: { board?: string; platform?: string; sort?: string; page?: number; post?: string; write?: boolean }): string;
export function parseCommunityQuery(search: string): CommunityView;

export type BoardReply = { posts?: any[]; pinned?: any[]; total?: number } | null | undefined;
export function mergeBoardPages<T extends { id: string; createdAt: string; likes: number; views: number; comments: number }>(
    replies: Array<{ posts?: T[]; pinned?: T[]; total?: number } | null | undefined>,
    options?: { sort?: SortKey; page?: number; pageSize?: number },
): { pinned: T[]; posts: T[]; total: number; totalPages: number };

export function describeVisit(result: { ok?: boolean; scored?: boolean; scoreReason?: string; message?: string } | null | undefined): { tone: 'ok' | 'info'; text: string };
