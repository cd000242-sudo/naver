/**
 * Promo board platforms (forum contract 1114, section 2): a post is either a NAVER blog post or a Google (Blogger /
 * own domain) blog post. Pure rules, no browser: which address fits which platform, what to suggest while typing,
 * and how an old row without a platform is read. The server checks again; these only decide what the screen says.
 */

export const PROMO_PLATFORMS = Object.freeze([
    Object.freeze({ key: 'naver', label: '네이버 블로그', example: 'https://blog.naver.com/아이디/글번호' }),
    Object.freeze({ key: 'google', label: '구글 블로그', example: 'https://내블로그.blogspot.com/글' }),
]);

export const DEFAULT_PLATFORM = 'naver';

/** Anything but the exact word `google` is the default platform (an address cannot invent a platform). */
export const normalizePlatform = (value) => (value === 'google' ? 'google' : DEFAULT_PLATFORM);

/** Lower-case host of an http(s) address; '' for anything else. */
export function hostOf(url) {
    try {
        const parsed = new URL(String(url ?? '').trim());
        return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.hostname.toLowerCase() : '';
    } catch {
        return '';
    }
}

const isHttps = (url) => {
    try {
        return new URL(String(url ?? '').trim()).protocol === 'https:';
    } catch {
        return false;
    }
};

/** naver.com itself or any host below it (`notnaver.com` and `naver.com.evil.kr` are not). */
const isNaverHost = (host) => host === 'naver.com' || host.endsWith('.naver.com');
const isNaverBlogHost = (host) => host === 'blog.naver.com' || host === 'm.blog.naver.com';

const NAVER_ASK = '네이버 블로그 주소(https://blog.naver.com/…)를 넣어 주세요.';
const GOOGLE_ASK = '구글 블로그 주소(https://…)를 넣어 주세요.';
const GOOGLE_NOT_NAVER = '네이버 주소예요. 위에서 ‘네이버 블로그’를 골라 주세요.';

/** A message when the address does not fit the platform, '' when it does. */
export function validatePromoUrl(url, platform) {
    const host = hostOf(url);
    if (normalizePlatform(platform) === 'naver') {
        return isHttps(url) && isNaverBlogHost(host) ? '' : NAVER_ASK;
    }
    if (!isHttps(url) || !host) return GOOGLE_ASK;
    return isNaverHost(host) ? GOOGLE_NOT_NAVER : '';
}

/** The platform an address points at while the writer types: blogspot is google, blog.naver.com is naver, else ''. */
export function suggestPlatform(url) {
    const host = hostOf(url);
    if (!host) return '';
    if (isNaverBlogHost(host)) return 'naver';
    return /(^|\.)blogspot\.[a-z.]+$/.test(host) ? 'google' : '';
}

/** A naver host is naver, any other http(s) host is google, an unreadable address is ''. */
export function platformFromUrl(url) {
    const host = hostOf(url);
    if (!host) return '';
    return isNaverHost(host) ? 'naver' : 'google';
}

/** The platform of a promo row: the stored `naver` / `google`, else read from the address (old rows), else the default. */
export function promoPlatformOf(post) {
    const stored = post?.platform;
    if (stored === 'naver' || stored === 'google') return stored;
    return platformFromUrl(post?.url) || DEFAULT_PLATFORM;
}
