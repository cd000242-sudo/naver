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
    /** One call for a whole community screen: list, board settings, weekly top, counts and the profile. */
    feed: 'community-feed',
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
    NOTICE_MANAGED_IN_ADMIN: 'NOTICE_MANAGED_IN_ADMIN',
    NOTICE_NOT_REPORTABLE: 'NOTICE_NOT_REPORTABLE',
    UNAUTHORIZED: 'Unauthorized',
    LOGIN_REQUIRED: 'LOGIN_REQUIRED',
});

/** A post whose id starts with this came from the home-operations notice list, not from a member. */
export const NOTICE_ID_PREFIX = 'nt_';

/** Report resolution words the server accepts. */
export const REPORT_RESOLUTION = Object.freeze({ dismissed: 'dismissed', actioned: 'actioned' });
