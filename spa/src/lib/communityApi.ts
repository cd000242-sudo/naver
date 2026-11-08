/**
 * Talks to the site server (GAS) for the community. Every call is a POST with a JSON body `{ action, ... }`;
 * failures come back as `{ ok: false, code, message }` — this module never throws, so a screen can always show
 * the message. A reply that says the community token is gone also makes the browser forget it.
 */
import { COMMUNITY_ACTIONS, COMMUNITY_CODES, NOTICE_BOARD } from './communityContract.mjs';
import { NOTICE_WRITE_HINT } from './communityModel.mjs';
import { normalizePlatform } from './communityPlatform.mjs';
import { GAS_URL } from './siteOps';
import { isSessionFailure } from './siteAuthModel.mjs';
import { clearCommunitySession, loadCommunitySession } from './communitySession';

const TIMEOUT_MS = 20000;

export type ApiFailure = { ok: false; code: string; message: string; [extra: string]: unknown };
export type ApiResult<T = Record<string, unknown>> = ({ ok: true } & T) | ApiFailure;

const failure = (code: string, message: string): ApiFailure => ({ ok: false, code, message });

/** GAS answers a busy or over-quota moment with 200 + HTML; `.json()` on that would show "Unexpected token '<'". */
export async function callCommunity<T = Record<string, unknown>>(action: string, body: Record<string, unknown> = {}): Promise<ApiResult<T>> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const response = await fetch(GAS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ ...body, action }),
            cache: 'no-store',
            signal: controller.signal,
        });
        const raw = await response.text();
        let payload: Record<string, unknown>;
        try {
            payload = JSON.parse(raw) as Record<string, unknown>;
        } catch {
            return failure('BUSY', '서버가 잠시 붐빕니다. 몇 초 뒤 다시 시도해 주세요.');
        }
        // The old promo actions (post-visit) answer { success: true } instead of { ok: true }.
        if (payload.ok === true || payload.success === true) return { ...payload, ok: true } as ApiResult<T>;
        const code = String(payload.code || payload.error || 'UNKNOWN');
        if (body.communityToken && isSessionFailure(code)) clearCommunitySession();
        return { ...payload, ok: false, code, message: String(payload.message || payload.error || '처리하지 못했어요.') };
    } catch (error) {
        const aborted = error instanceof Error && error.name === 'AbortError';
        return failure('NETWORK', aborted ? '서버 응답이 늦어요. 잠시 뒤 다시 시도해 주세요.' : '연결에 실패했어요. 인터넷을 확인해 주세요.');
    } finally {
        window.clearTimeout(timer);
    }
}

/** A call that needs the login: no stored token means no request at all. */
export async function callWithToken<T = Record<string, unknown>>(action: string, body: Record<string, unknown> = {}): Promise<ApiResult<T>> {
    const session = loadCommunitySession();
    if (!session) return failure('LOGIN_REQUIRED', '로그인이 필요해요.');
    return callCommunity<T>(action, { ...body, communityToken: session.communityToken });
}

/** Same request id twice = the server answers with the first post, so a double click cannot post twice. */
export function newRequestId(): string {
    const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID().replace(/-/g, '')
        : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
    return `w${random}`.slice(0, 40);
}

/** A picture that goes up with a post: the page's own JPEG, base64 (forum contract 1114 §3). */
export type UploadImage = { id: string; mime: 'image/jpeg'; data: string };

export type PostsQuery = { board: string; sort: string; page: number; pageSize?: number; platform?: string };
export type PostDraft = {
    board: string; title: string; body: string; url?: string;
    /** Promo board: 'naver' | 'google'. */
    platform?: string;
    /** 'rich' = `body` is the block JSON of the new editor. */
    format?: 'rich';
    images?: UploadImage[];
    /** Thumbnail of the first picture: base64 JPEG (forum contract 1115 section A). */
    thumb?: string;
};

/** The promo board lists one platform at a time; every other board has no platform. */
const platformField = (board: string, platform?: string): Record<string, string> => (board === 'promo' ? { platform: normalizePlatform(platform) } : {});

/** Rich fields of a send: the format, the pictures and the thumbnail (each left out when there is none). */
const richFields = (draft: { format?: 'rich'; images?: UploadImage[]; thumb?: string }): Record<string, unknown> => ({
    ...(draft.format === 'rich' ? { format: 'rich' } : {}),
    ...(draft.images && draft.images.length > 0 ? { images: draft.images } : {}),
    ...(draft.thumb ? { thumb: draft.thumb } : {}),
});
export type ReportInput = { targetType: 'post' | 'comment'; targetId: string; reason: string; detail?: string };

export const boardApi = {
    boards: () => callCommunity('community-boards'),
    posts: (query: PostsQuery) => {
        const { platform, ...rest } = query;
        return callWithToken('community-posts', { pageSize: 20, ...rest, ...platformField(query.board, platform) });
    },
    post: (id: string) => callWithToken('community-post', { id }),
    weeklyTop: (limit = 10) => callWithToken('community-weekly-top', { limit }),
    /** Pass the same `requestId` when sending again: the server then answers with the first post instead of making a twin. */
    writePost: (draft: PostDraft, requestId: string = newRequestId()): Promise<ApiResult> => (draft.board === NOTICE_BOARD
        // Notices are written in the admin home; nothing is sent from here.
        ? Promise.resolve(failure(COMMUNITY_CODES.NOTICE_MANAGED_IN_ADMIN, NOTICE_WRITE_HINT))
        : callWithToken('community-post-write', {
            board: draft.board,
            title: draft.title,
            ...(draft.board === 'promo'
                ? { url: draft.url, ...platformField('promo', draft.platform), summary: draft.body }
                : { body: draft.body, ...richFields({ ...draft, thumb: draft.format === 'rich' ? draft.thumb : undefined }) }),
            requestId,
        })),
    updatePost: (id: string, draft: { title: string; body: string; promo: boolean; images?: UploadImage[]; thumb?: string }) => callWithToken('community-post-update', {
        id, title: draft.title, ...(draft.promo ? { summary: draft.body } : { body: draft.body, ...richFields({ images: draft.images, thumb: draft.thumb }) }),
    }),
    /** 준회원 → 새싹. The answer is `{ ok, level }`, or `LEVEL_UP_NOT_READY` with `need` (true = still missing). */
    levelUp: () => callWithToken(COMMUNITY_ACTIONS.levelUp),
    deletePost: (id: string) => callWithToken('community-post-delete', { id }),
    writeComment: (postId: string, body: string, parentId?: string, requestId: string = newRequestId()) => callWithToken('community-comment-write', {
        postId, body, ...(parentId ? { parentId } : {}), requestId,
    }),
    deleteComment: (id: string) => callWithToken('community-comment-delete', { id }),
    /** 질문하기: the asker takes `commentId` as the answer; '' takes the accepted answer back (contract 1116). */
    acceptAnswer: (postId: string, commentId: string) => callWithToken(COMMUNITY_ACTIONS.acceptAnswer, { postId, commentId }),
    like: (targetType: 'post' | 'comment', targetId: string) => callWithToken('community-like', { targetType, targetId }),
    report: (input: ReportInput) => callWithToken('community-report', { ...input }),
    /**
     * The old "visit" counter of the promo board; with the token it also counts toward the visitor's score.
     * The server adds `scored`, `memberVisits` and `scoreReason` (ALREADY_VISITED_TODAY / OWN_POST / SESSION_INVALID ...).
     * A dead token is dropped here so the screen asks for a new login.
     */
    visitPromo: async (url: string) => {
        const result = await callWithToken('post-visit', { url });
        if (result.ok && result.scoreReason === 'SESSION_INVALID') clearCommunitySession();
        return result;
    },
};
