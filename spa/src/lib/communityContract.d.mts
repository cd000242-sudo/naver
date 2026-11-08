export const COMMUNITY_ACTIONS: Readonly<{
    signupSendCode: string; signup: string; profile: string; myPosts: string; changePassword: string;
    resetSendCode: string; resetConfirm: string; verifyPhoneSend: string; verifyPhoneConfirm: string;
    adminHide: string; adminPin: string; adminDelete: string; adminStatus: string; adminReports: string;
    adminReportResolve: string; adminPosts: string; adminBoards: string; adminRewards: string; adminRewardDecide: string; feed: string;
}>;
export const COMMUNITY_CODES: Readonly<Record<
    'PHONE_INVALID' | 'PHONE_TAKEN' | 'PHONE_REQUIRED' | 'PHONE_CODE_INVALID' | 'PHONE_CODE_EXPIRED' | 'TOO_MANY'
    | 'SMS_UNAVAILABLE' | 'INVALID_CREDENTIALS' | 'INVALID_PASSWORD' | 'INVALID_CURRENT_PASSWORD' | 'TOO_MANY_ATTEMPTS'
    | 'USE_LICENSE_RESET' | 'PHONE_ALREADY_VERIFIED' | 'USE_LICENSE_PHONE' | 'NICKNAME_TAKEN' | 'NOTICE_MANAGED_IN_ADMIN' | 'NOTICE_NOT_REPORTABLE'
    | 'UNAUTHORIZED' | 'LOGIN_REQUIRED',
    string
>>;
export const NOTICE_ID_PREFIX: string;
export const NOTICE_BOARD: 'notice';
export const REWARD_DECISION: Readonly<{ approve: 'approve'; reject: 'reject' }>;
export const REPORT_RESOLUTION: Readonly<{ dismissed: 'dismissed'; actioned: 'actioned' }>;
