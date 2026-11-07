/**
 * Talks to the site server (GAS) for the community. Every call is a POST with a JSON body `{ action, ... }`;
 * failures come back as `{ ok: false, code, message }` — this module never throws, so a screen can always show
 * the message. A reply that says the community token is gone also makes the browser forget it.
 */
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

export type PostsQuery = { board: string; sort: string; page: number; pageSize?: number };
export type PostDraft = { board: string; title: string; body: string; url?: string };
export type ReportInput = { targetType: 'post' | 'comment'; targetId: string; reason: string; detail?: string };

export const boardApi = {
    boards: () => callCommunity('community-boards'),
    posts: (query: PostsQuery) => callWithToken('community-posts', { pageSize: 20, ...query }),
    post: (id: string) => callWithToken('community-post', { id }),
    weeklyTop: (limit = 6) => callWithToken('community-weekly-top', { limit }),
    writePost: (draft: PostDraft) => callWithToken('community-post-write', {
        board: draft.board,
        title: draft.title,
        ...(draft.board === 'promo' ? { url: draft.url, summary: draft.body } : { body: draft.body }),
        requestId: newRequestId(),
    }),
    updatePost: (id: string, draft: { title: string; body: string; promo: boolean }) => callWithToken('community-post-update', {
        id, title: draft.title, ...(draft.promo ? { summary: draft.body } : { body: draft.body }),
    }),
    deletePost: (id: string) => callWithToken('community-post-delete', { id }),
    writeComment: (postId: string, body: string, parentId?: string) => callWithToken('community-comment-write', {
        postId, body, ...(parentId ? { parentId } : {}), requestId: newRequestId(),
    }),
    deleteComment: (id: string) => callWithToken('community-comment-delete', { id }),
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
