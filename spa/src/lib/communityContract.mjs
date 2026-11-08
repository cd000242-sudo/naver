/**
 * The names the site and the server (GAS) have agreed on for phone verification, the profile page, password
 * change and the moderator actions. Kept in ONE place so a rename on the server side is a one-line change here.
 */

export const COMMUNITY_ACTIONS = Object.freeze({
    signupSendCode: 'community-signup-send-code',
    signup: 'community-signup',
    profile: 'community-profile',
    myPosts: 'community-my-posts',
    changePassword: 'community-change-password',
    resetSendCode: 'community-reset-send-code',
    resetConfirm: 'community-reset-confirm',
    verifyPhoneSend: 'community-verify-phone-send',
    verifyPhoneConfirm: 'community-verify-phone-confirm',
    adminHide: 'community-admin-hide',
    adminPin: 'community-admin-pin',
    adminDelete: 'community-admin-delete',
    adminStatus: 'community-admin-status',
    adminReports: 'community-admin-reports',
    adminReportResolve: 'community-admin-report-resolve',
    adminPosts: 'community-admin-posts',
    adminBoards: 'community-admin-boards',
    setAvatar: 'community-set-avatar',
    /** Many photos for a list of avatar keys, in one call (50 at most). */
    avatars: 'community-avatars',
    adminRemoveAvatar: 'community-admin-remove-avatar',
    adminRewards: 'community-admin-rewards',
    adminRewardDecide: 'community-admin-reward-decide',
    /** One call for a whole community screen: list, board settings, weekly top, counts and the profile. */
    feed: 'community-feed',
    /** 준회원 → 새싹: POST with the token; answers `{ ok, level }` or `LEVEL_UP_NOT_READY` with `need`. */
    levelUp: 'community-level-up',
    /** One picture of a post (GET: `?action=...&postId=..&imageId=..`) answers `{ ok, mime, data }`. */
    postImage: 'community-post-image',
});

export const COMMUNITY_CODES = Object.freeze({
    PHONE_INVALID: 'PHONE_INVALID',
    PHONE_TAKEN: 'PHONE_TAKEN',
    PHONE_REQUIRED: 'PHONE_REQUIRED',
    PHONE_CODE_INVALID: 'PHONE_CODE_INVALID',
    PHONE_CODE_EXPIRED: 'PHONE_CODE_EXPIRED',
    TOO_MANY: 'TOO_MANY',
    SMS_UNAVAILABLE: 'SMS_UNAVAILABLE',
    INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
    INVALID_PASSWORD: 'INVALID_PASSWORD',
    INVALID_CURRENT_PASSWORD: 'INVALID_CURRENT_PASSWORD',
    TOO_MANY_ATTEMPTS: 'TOO_MANY_ATTEMPTS',
    USE_LICENSE_RESET: 'USE_LICENSE_RESET',
    PHONE_ALREADY_VERIFIED: 'PHONE_ALREADY_VERIFIED',
    USE_LICENSE_PHONE: 'USE_LICENSE_PHONE',
    NICKNAME_TAKEN: 'NICKNAME_TAKEN',
    INVALID_IMAGE: 'INVALID_IMAGE',
    AVATAR_NOT_FOUND: 'AVATAR_NOT_FOUND',
    NOTICE_MANAGED_IN_ADMIN: 'NOTICE_MANAGED_IN_ADMIN',
    NOTICE_NOT_REPORTABLE: 'NOTICE_NOT_REPORTABLE',
    UNAUTHORIZED: 'Unauthorized',
    LOGIN_REQUIRED: 'LOGIN_REQUIRED',
    LEVEL_REQUIRED: 'LEVEL_REQUIRED',
    LEVEL_UP_NOT_READY: 'LEVEL_UP_NOT_READY',
    INVALID_BODY: 'INVALID_BODY',
    INVALID_URL: 'INVALID_URL',
    INVALID_PLATFORM: 'INVALID_PLATFORM',
    TOO_LONG: 'TOO_LONG',
});

/** A post whose id starts with this came from the home-operations notice list, not from a member. */
export const NOTICE_ID_PREFIX = 'nt_';

/** The board that shows only those notices. An old server files them under `news`; the screen moves them here. */
export const NOTICE_BOARD = 'notice';

/** The two answers the owner can give to a reward request (`community-admin-reward-decide`). */
export const REWARD_DECISION = Object.freeze({ approve: 'approve', reject: 'reject' });

/** Report resolution words the server accepts. */
export const REPORT_RESOLUTION = Object.freeze({ dismissed: 'dismissed', actioned: 'actioned' });
