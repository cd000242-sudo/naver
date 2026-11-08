/**
 * Moderator calls. The screen shows the buttons by role, but every call goes to the server with the community
 * token and the SERVER decides; a refusal comes back as its own sentence (see `describeModerationFailure`).
 * No admin token ever reaches the browser.
 */
import { callWithToken } from './communityApi';
import { COMMUNITY_ACTIONS, REWARD_DECISION } from './communityContract.mjs';

export type TargetType = 'post' | 'comment';
export type ReportStatus = 'open' | 'all';
export type Resolution = 'dismissed' | 'actioned';
export type RewardFilter = 'pending' | 'all';
export type RewardChoice = keyof typeof REWARD_DECISION;

export const moderationApi = {
    /** `hidden: false` shows it again. */
    hide: (targetType: TargetType, targetId: string, hidden: boolean) =>
        callWithToken(COMMUNITY_ACTIONS.adminHide, { targetType, targetId, hidden }),
    pin: (id: string, pinned: boolean) => callWithToken(COMMUNITY_ACTIONS.adminPin, { id, pinned }),
    remove: (targetType: TargetType, targetId: string) => callWithToken(COMMUNITY_ACTIONS.adminDelete, { targetType, targetId }),
    setStatus: (id: string, status: string) => callWithToken(COMMUNITY_ACTIONS.adminStatus, { id, status }),
    reports: (status: ReportStatus, page: number, pageSize = 10) =>
        callWithToken(COMMUNITY_ACTIONS.adminReports, { status, page, pageSize }),
    resolveReport: (reportId: string, status: Resolution) => callWithToken(COMMUNITY_ACTIONS.adminReportResolve, { reportId, status }),
    /** The owner's reward desk: requests waiting for a decision (or all of them). */
    rewards: (status: RewardFilter, page = 1, pageSize = 10) => callWithToken(COMMUNITY_ACTIONS.adminRewards, { status, page, pageSize }),
    /** Remove an author's photo by the avatar key on their post or comment (or by a post id). */
    removeAvatar: (target: { targetKey?: string; id?: string }) => callWithToken(COMMUNITY_ACTIONS.adminRemoveAvatar, { ...target }),
    decideReward: (rewardId: string, choice: RewardChoice) => callWithToken(COMMUNITY_ACTIONS.adminRewardDecide, { rewardId, decision: REWARD_DECISION[choice] }),
    hiddenPosts: (page: number, pageSize = 10) => callWithToken(COMMUNITY_ACTIONS.adminPosts, { filter: 'hidden', page, pageSize }),
};

export type ReportTarget = {
    missing: boolean;
    board: string;
    postId: string;
    title: string;
    excerpt: string;
    nickname: string;
    hidden: boolean;
};

export type ReportItem = {
    reportId: string;
    targetType: TargetType;
    targetId: string;
    reasonLabel: string;
    detail: string;
    reporterNickname: string;
    createdAt: string;
    status: string;
    target: ReportTarget;
};

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const record = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' ? value as Record<string, unknown> : {});

function toReport(raw: unknown): ReportItem | null {
    const source = record(raw);
    const reportId = text(source.reportId).trim();
    if (!reportId) return null;
    const target = record(source.target);
    return {
        reportId,
        targetType: source.targetType === 'comment' ? 'comment' : 'post',
        targetId: text(source.targetId),
        reasonLabel: text(source.reasonLabel),
        detail: text(source.detail),
        reporterNickname: text(source.reporterNickname),
        createdAt: text(source.createdAt),
        status: text(source.status),
        target: {
            missing: target.missing === true,
            board: text(target.board),
            postId: text(target.postId),
            title: text(target.title),
            excerpt: text(target.excerpt),
            nickname: text(target.nickname),
            hidden: target.hidden === true,
        },
    };
}

export function normalizeReports(raw: unknown): ReportItem[] {
    return (Array.isArray(raw) ? raw : []).map(toReport).filter((item): item is ReportItem => item !== null);
}

export type RewardRequest = {
    rewardId: string;
    userId: string;
    nickname: string;
    tier: string;
    tierLabel: string;
    days: number;
    mode: 'auto' | 'approval';
    status: string;
    createdAt: string;
    decidedAt: string;
    licenseCode: string;
};

/** The reward requests of the desk; a row without an id is dropped, a missing list is an empty one. */
export function normalizeRewardRequests(raw: unknown): RewardRequest[] {
    return (Array.isArray(raw) ? raw : []).flatMap((item) => {
        const source = record(item);
        const rewardId = text(source.rewardId).trim();
        if (!rewardId) return [];
        const days = Math.floor(Number(source.days));
        return [{
            rewardId, userId: text(source.userId), nickname: text(source.nickname), tier: text(source.tier), tierLabel: text(source.tierLabel),
            days: Number.isFinite(days) && days > 0 ? days : 0, mode: source.mode === 'approval' ? 'approval' as const : 'auto' as const,
            status: text(source.status), createdAt: text(source.createdAt), decidedAt: text(source.decidedAt), licenseCode: text(source.licenseCode),
        }];
    });
}

/** A report's post address inside the community, or '' when the target is gone. */
export function reportPostId(report: ReportItem): string {
    return report.target.missing ? '' : report.target.postId;
}
