/**
 * The site login (community token) as the browser keeps it.
 *
 * Stored in localStorage like the LEWORD login (same lifetime, readable by every tab). It holds the profile the
 * server sent and the community token — never a password. Everything read back is coerced to plain text and a
 * known role, because the screen draws these values.
 */

import { clearFeedCache } from './communityFeedCache';
import { isAvatarKey } from './communityAvatarModel.mjs';
import { pickForest, type Forest } from './communityForest.mjs';
import { FOREST_GRADE, normalizeRewards } from './communityGrades.mjs';
import { ASSOCIATE_GRADE, normalizeLevel, normalizeLevelUp, type LevelKey, type LevelUpFlags } from './communityLevel.mjs';

export const COMMUNITY_SESSION_KEY = 'leaderspro.community.session.v1';
/** Fired on window after the stored login changes, so the menu and the pages (separate React trees) follow. */
export const COMMUNITY_SESSION_EVENT = 'community:session-changed';

export type CommunityRole = 'owner' | 'licensed' | 'community';

export type CommunityReward = {
    tier: string;
    label: string;
    days: number;
    mode: 'auto' | 'approval';
    status: 'granted' | 'pending' | 'approved' | 'rejected';
    createdAt: string;
    decidedAt: string;
};

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
    /** Key of my profile photo ('' when none). */
    avatarKey: string;
    needsNickname: boolean;
    /** True only for the operator account (owner). */
    canWriteNews: boolean;
    /** The server calls this account an operator. Only decides which buttons are drawn; the server re-checks every call. */
    isOperator: boolean;
    score: number;
    /** `likes` (likes received) is null when the server does not send it yet. */
    activity: { posts: number; comments: number; visits: number; likes: number | null };
    grade: CommunityGrade;
    linked: boolean;
    /** My rewards (잎새 3일 ...); empty when the server sends none. */
    rewards: CommunityReward[];
    /** 준회원 / 정회원. A server that sends no level (or an old row) means a member. */
    level: LevelKey;
    /** Done flags of the two conditions for [등업 신청] (an associate's checklist). */
    levelUp: LevelUpFlags;
    /** Progress toward 숲 (likes received, weeks in the weekly top); null when the server sends none. */
    forest: Forest | null;
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
    // The owner is always a member; an associate wears 준회원 whatever the score is.
    const level = role === 'owner' ? 'member' : normalizeLevel(payload.level);
    return {
        userId: text(payload.userId),
        role,
        nickname: text(payload.nickname),
        avatarKey: isAvatarKey(payload.avatarKey) ? payload.avatarKey : '',
        needsNickname: payload.needsNickname === true,
        canWriteNews: payload.canWriteNews === true,
        isOperator: payload.isOperator === true,
        score: count(payload.score),
        activity: {
            posts: count(activity.posts), comments: count(activity.comments), visits: count(activity.visits),
            likes: activity.likes === undefined || activity.likes === null ? null : count(activity.likes),
        },
        // The owner account is always 숲, even when an older server still sends a lower grade.
        grade: role === 'owner' ? { ...FOREST_GRADE } : level === 'associate' ? { ...ASSOCIATE_GRADE } : toGrade(payload.grade),
        linked: payload.linked === true,
        rewards: normalizeRewards(payload.rewards) as CommunityReward[],
        level,
        levelUp: normalizeLevelUp(payload.levelUp),
        forest: pickForest(payload.forest),
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
            clearFeedCache();
            return null;
        }
        return { ...session, savedAt: text(stored.savedAt) || session.savedAt };
    } catch {
        return null;
    }
}

/** The user id of the stored login without any side effect ('' when none or damaged). */
function storedUserId(): string {
    try {
        const stored = JSON.parse(localStorage.getItem(COMMUNITY_SESSION_KEY) || 'null') as { userId?: unknown } | null;
        return text(stored?.userId);
    } catch {
        return '';
    }
}

export function saveCommunitySession(session: CommunitySession): void {
    // Another person logging in must not inherit the list the previous person saved.
    if (storedUserId() !== session.userId) clearFeedCache();
    try {
        localStorage.setItem(COMMUNITY_SESSION_KEY, JSON.stringify(session));
    } catch {
        // Storage may be blocked (private mode); this tab still works from the returned session.
    }
    announce();
}

export function clearCommunitySession(): void {
    clearFeedCache();
    try {
        localStorage.removeItem(COMMUNITY_SESSION_KEY);
    } catch {
        // Nothing more to do.
    }
    announce();
}
