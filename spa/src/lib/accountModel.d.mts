import type { BoardConfig } from './communityModel.mjs';
import type { PhoneFailure } from './phoneAuthModel.mjs';

type ProfileLike = { role?: string; isOperator?: boolean } | null | undefined;
type Failure = { code?: string; message?: string; retryAfterSec?: unknown } | null | undefined;

export function canModerate(profile: ProfileLike): boolean;
export function roleLabel(profile: ProfileLike): string;
export function formatJoined(iso: unknown): string;
export function phoneStatus(detail: { phoneVerified?: boolean; phoneMasked?: string } | null | undefined): { verified: boolean; text: string };
export function isNoticeId(id: unknown): boolean;
export function noticeBadgeLabel(kind: unknown): string;
export const PHONE_PANEL_PATH: string;
export function statusChoices(board: { statuses?: readonly string[] } | undefined): string[];
export const NOTICE_HINT: string;
export const REWARDS_PATH: string;
export function isRewardsView(search: unknown): boolean;
export function describeNicknameFailure(result: Failure): string;
export function describeRewardFailure(result: Failure): string;
export function describeAvatarRemoveFailure(result: Failure): string;

export type PostModeration = {
    hide: boolean; hideLabel: string; pin: boolean; pinLabel: string; remove: boolean; noticeHint: string; statusChoices: string[];
};
export function postModeration(
    post: { id: string; board: string; hidden: boolean; pinned: boolean; mine: boolean; status: string; notice?: boolean } | null | undefined,
    profile: ProfileLike,
    boards: readonly BoardConfig[],
): PostModeration | null;
export function commentModeration(
    comment: { hidden?: boolean; gone: boolean; mine: boolean } | null | undefined,
    profile: ProfileLike,
): { hideLabel: string; remove: boolean } | null;
export function interactionAllowed(post: { commentable?: boolean; likable?: boolean } | null | undefined): { comment: boolean; like: boolean };

export function validatePasswordChange(input: { current?: string; next?: string; confirm?: string }): string;
export function validateResetRequest(input: { userId?: string; phone?: string }): string;
export function validateResetConfirm(input: { code?: string; next?: string; confirm?: string }): string;
export function describePasswordFailure(result: Failure): { message: string; license: boolean };
export function describeResetFailure(result: Failure): (PhoneFailure & { license: boolean }) | { message: string; license: boolean; kind: 'password' | 'license' };

export type ResetTab = 'community' | 'license';
export const RESET_TABS: Readonly<Record<ResetTab, Readonly<{ id: ResetTab; label: string }>>>;
export function resetTabFrom(value: unknown): ResetTab;
export function resetPasswordPath(tab?: ResetTab): string;

export function describeModerationFailure(result: Failure): string;
export const REPORTS_PATH: string;
export function isReportsView(search: unknown): boolean;
