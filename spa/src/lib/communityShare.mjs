// Sharing a community post outside the site (KakaoTalk, messages, anywhere the device offers). The community is
// login-only, so the shared text carries the title, a short summary and the address: the reader gets the gist at once
// and opens the full post after logging in. Pure: the browser pieces (share sheet, clipboard) are passed in.
import { communityPath } from './communityModel.mjs';
import { parseRichBody, richExcerpt } from './communityRich.mjs';

const SUMMARY_LINES = 3;
const EXCERPT_MAX = 120;
const LOGIN_NOTE = '전체 글 보기(로그인 필요)';
/** How long the clipboard may take before the older copy is tried. */
const COPY_TIMEOUT_MS = 1200;

const runText = (runs) => runs.map((run) => run.x).join('').trim();

/** Up to three lines saying what the post is about: the list right under a "요약" heading, else its opening words. */
export function shareSummaryLines(post) {
    const parsed = post?.format === 'rich' ? parseRichBody(post.body) : { ok: false, blocks: [] };
    if (parsed.ok) {
        const heading = parsed.blocks.findIndex((block) => block.t === 'h' && runText(block.c).includes('요약'));
        const list = heading >= 0 ? parsed.blocks[heading + 1] : null;
        if (list && (list.t === 'ol' || list.t === 'ul')) {
            const lines = list.items.map(runText).filter(Boolean).slice(0, SUMMARY_LINES);
            if (lines.length > 0) return lines;
        }
    }
    const excerpt = richExcerpt(post?.body, EXCERPT_MAX);
    return excerpt ? [excerpt] : [];
}

/** `{ title, text, url }` for one post; `text` is complete on its own (it ends with the address). */
export function buildShareText(post, origin) {
    const url = `${String(origin ?? '').replace(/\/+$/, '')}${communityPath({ board: post.board, post: post.id })}`;
    const lines = shareSummaryLines(post).map((line) => `· ${line}`);
    const text = [post.title, ...(lines.length > 0 ? ['', ...lines] : []), '', `${LOGIN_NOTE}: ${url}`].join('\n');
    return { title: post.title, text, url };
}

/**
 * Hands the text to the device share sheet; where there is none (most desktops) or it fails, copies it instead.
 * `env.share` / `env.copy` are the browser functions. Answers 'shared' | 'cancelled' | 'copied' | 'failed', never throws.
 * The address is inside `text`, so no separate `url` is passed: some apps would then show it twice or drop the text.
 * The clipboard call can stay unanswered for good (seen 2026-11-25: the button looked dead), so it gets `env.timeoutMs`
 * and then `env.copyLegacy(text)` (the older, synchronous copy; answers true when it worked) is tried.
 */
export async function sharePost(payload, env = {}) {
    if (typeof env.share === 'function') {
        try {
            await env.share({ title: payload.title, text: payload.text });
            return 'shared';
        } catch (error) {
            if (error && error.name === 'AbortError') return 'cancelled';
        }
    }
    if (typeof env.copy === 'function') {
        let timer;
        const late = new Promise((resolve) => { timer = setTimeout(() => resolve('late'), env.timeoutMs ?? COPY_TIMEOUT_MS); });
        try {
            const answer = await Promise.race([Promise.resolve(env.copy(payload.text)).then(() => 'done'), late]);
            if (answer === 'done') return 'copied';
        } catch {
            // refused: the older copy below is the second try
        } finally {
            clearTimeout(timer);
        }
    }
    if (typeof env.copyLegacy !== 'function') return 'failed';
    try {
        return env.copyLegacy(payload.text) ? 'copied' : 'failed';
    } catch {
        return 'failed';
    }
}
