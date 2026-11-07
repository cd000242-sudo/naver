/**
 * Reads the real title of a blog post address (promo board). The title is never typed by hand: a typed title
 * lets people list one page and show another, which is how a promotion board dies. The reader is the same
 * worker the old "내 글 홍보" panel used.
 */
const WORKER_URL = 'https://leword-keyword-api.leword.workers.dev/';

export type PromoTitle =
    | { ok: true; title: string; platform: string; description: string }
    | { ok: false; message: string };

export async function readPromoTitle(url: string): Promise<PromoTitle> {
    const target = url.trim();
    if (!/^https?:\/\/\S+$/i.test(target)) return { ok: false, message: '글 주소(http:// 또는 https://)를 정확히 넣어 주세요.' };
    try {
        const response = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'community-post-title', url: target }),
        });
        const data = await response.json() as Record<string, unknown>;
        const title = typeof data.title === 'string' ? data.title.trim() : '';
        if (data.ok === true && title) {
            return {
                ok: true,
                title,
                platform: typeof data.platform === 'string' ? data.platform : 'etc',
                description: typeof data.description === 'string' ? data.description : '',
            };
        }
        return { ok: false, message: typeof data.message === 'string' && data.message ? data.message : '제목을 읽지 못했어요.' };
    } catch {
        return { ok: false, message: '글을 열지 못했어요. 주소를 확인해 주세요.' };
    }
}
