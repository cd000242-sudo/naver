/**
 * The site login (community token) as the browser keeps it.
 *
 * Stored in localStorage like the LEWORD login (same lifetime, readable by every tab). It holds the profile the
 * server sent and the community token — never a password. Everything read back is coerced to plain text and a
 * known role, because the screen draws these values.
 */

export const COMMUNITY_SESSION_KEY = 'leaderspro.community.session.v1';
/** Fired on window after the stored login changes, so the menu and the pages (separate React trees) follow. */
export const COMMUNITY_SESSION_EVENT = 'community:session-changed';

export type CommunityRole = 'owner' | 'licensed' | 'community';

export type CommunityGrade = {
    key: string;
    label: string;
    min: number;
    nextAt: number | null;
    nextLabel: string | null;
};

export type CommunityProfile = {
    userId: string;
    role: CommunityRole;
    nickname: string;
    needsNickname: boolean;
    /** True only for the operator account (owner). */
    canWriteNews: boolean;
    /** The server calls this account an operator. Only decides which buttons are drawn; the server re-checks every call. */
    isOperator: boolean;
    score: number;
    activity: { posts: number; comments: number; visits: number };
    grade: CommunityGrade;
    linked: boolean;
};

export type CommunitySession = CommunityProfile & {
    communityToken: string;
    /** ISO time the server stops honouring the token, or null when it did not say. */
    sessionExpiresAt: string | null;
    savedAt: string;
};

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const count = (value: unknown): number => {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : 0;
};

function toGrade(raw: unknown): CommunityGrade {
    const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const nextAt = Number(source.nextAt);
    return {
        key: text(source.key) || 'sprout',
        label: text(source.label) || '새싹',
        min: count(source.min),
        nextAt: source.nextAt === null || source.nextAt === undefined || !Number.isFinite(nextAt) ? null : nextAt,
        nextLabel: text(source.nextLabel) || null,
    };
}

/** The profile block that signup / login / session / set-nickname all return, made safe to draw. */
export function normalizeProfile(payload: Record<string, unknown>): CommunityProfile {
    const activity = (payload.activity && typeof payload.activity === 'object' ? payload.activity : {}) as Record<string, unknown>;
    const role = payload.role === 'owner' || payload.role === 'licensed' ? payload.role : 'community';
    return {
        userId: text(payload.userId),
        role,
        nickname: text(payload.nickname),
        needsNickname: payload.needsNickname === true,
        canWriteNews: payload.canWriteNews === true,
        isOperator: payload.isOperator === true,
        score: count(payload.score),
        activity: { posts: count(activity.posts), comments: count(activity.comments), visits: count(activity.visits) },
        grade: toGrade(payload.grade),
        linked: payload.linked === true,
    };
}

/** A login answer as a stored session; null when it has no user or no token. */
export function toCommunitySession(payload: Record<string, unknown>): CommunitySession | null {
    const profile = normalizeProfile(payload);
    const communityToken = text(payload.communityToken).trim();
    if (!profile.userId || !communityToken) return null;
    return {
        ...profile,
        communityToken,
        sessionExpiresAt: text(payload.sessionExpiresAt) || null,
        savedAt: new Date().toISOString(),
    };
}

function announce(): void {
    if (typeof window === 'undefined') return;
    try {
        window.dispatchEvent(new Event(COMMUNITY_SESSION_EVENT));
    } catch {
        // A listener must never break login or logout.
    }
}

/** The stored login; an expired or damaged one counts as logged out and is removed. */
export function loadCommunitySession(): CommunitySession | null {
    try {
        const raw = localStorage.getItem(COMMUNITY_SESSION_KEY);
        if (!raw) return null;
        const stored = JSON.parse(raw) as Record<string, unknown>;
        const session = toCommunitySession(stored);
        const expiresAt = session?.sessionExpiresAt ? new Date(session.sessionExpiresAt).getTime() : NaN;
        if (!session || (Number.isFinite(expiresAt) && expiresAt <= Date.now())) {
            localStorage.removeItem(COMMUNITY_SESSION_KEY);
            return null;
        }
        return { ...session, savedAt: text(stored.savedAt) || session.savedAt };
    } catch {
        return null;
    }
}

export function saveCommunitySession(session: CommunitySession): void {
    try {
        localStorage.setItem(COMMUNITY_SESSION_KEY, JSON.stringify(session));
    } catch {
        // Storage may be blocked (private mode); this tab still works from the returned session.
    }
    announce();
}

export function clearCommunitySession(): void {
    try {
        localStorage.removeItem(COMMUNITY_SESSION_KEY);
    } catch {
        // Nothing more to do.
    }
    announce();
}
