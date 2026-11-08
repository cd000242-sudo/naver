/**
 * Reporting a post (forum contract 1114, section 4): the reasons a reader can pick, and who is offered the [신고]
 * button at all. The server (`community-report`) stays the authority; this only decides what the screen draws.
 */

export const REPORT_REASONS = Object.freeze([
    Object.freeze({ key: 'spam', label: '스팸·도배' }),
    Object.freeze({ key: 'abuse', label: '욕설·비방' }),
    Object.freeze({ key: 'ad', label: '광고·홍보' }),
    Object.freeze({ key: 'adult', label: '음란·불쾌' }),
    Object.freeze({ key: 'illegal', label: '불법·사칭' }),
    Object.freeze({ key: 'other', label: '기타' }),
]);

/** The six known reasons, with the server's wording when it sends one; the server cannot add a reason. */
export function reportReasons(serverConfig) {
    const remote = new Map((Array.isArray(serverConfig?.reportReasons) ? serverConfig.reportReasons : []).map((entry) => [String(entry?.key), entry]));
    return REPORT_REASONS.map((reason) => {
        const label = remote.get(reason.key)?.label;
        return typeof label === 'string' && label ? Object.freeze({ key: reason.key, label }) : reason;
    });
}

/**
 * What [신고] does for this reader on this post:
 *   hidden   not drawn (my own post, a notice, a post still being sent, or nothing to report)
 *   login    drawn, and pressing it goes to the login page (nobody is logged in)
 *   report   drawn, and pressing it opens the report dialog
 */
export function reportAction(post, profile) {
    if (!post || post.mine === true || post.notice === true || post.delivery) return 'hidden';
    return profile ? 'report' : 'login';
}
