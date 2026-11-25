export type SharePostSource = { id: string; board: string; title: string; body: string; format: '' | 'rich' };
export type SharePayload = { title: string; text: string; url: string };
export type ShareOutcome = 'shared' | 'cancelled' | 'copied' | 'failed';
export type ShareEnv = {
    share?: (data: { title: string; text: string }) => Promise<void>;
    copy?: (text: string) => Promise<void>;
    /** Older synchronous copy, tried when `copy` is missing, refuses or never answers. */
    copyLegacy?: (text: string) => boolean;
    /** How long `copy` may take before `copyLegacy` is tried (default 1200). */
    timeoutMs?: number;
};

export function shareSummaryLines(post: SharePostSource): string[];
export function buildShareText(post: SharePostSource, origin: string): SharePayload;
export function sharePost(payload: SharePayload, env?: ShareEnv): Promise<ShareOutcome>;
