import { describe, it, expect } from 'vitest';
import { normalizeUrl, upscaleUrl, isJunkUrl } from '../crawler/shopping/utils/imageUrlUtils.js';

describe('normalizeUrl', () => {
    it('strips the query string', () => {
        expect(normalizeUrl('https://x/a.jpg?type=o1000')).toBe('https://x/a.jpg');
    });

    it('leaves a URL without a query unchanged', () => {
        expect(normalizeUrl('https://x/a.jpg')).toBe('https://x/a.jpg');
    });

    it('drops every query parameter, not just the first', () => {
        expect(normalizeUrl('https://x/a.jpg?type=o1000&n=1')).toBe('https://x/a.jpg');
    });
});

describe('upscaleUrl', () => {
    it('upscales sub-500px thumbnails to o1000', () => {
        expect(upscaleUrl('https://x/a.jpg?type=f40')).toBe('https://x/a.jpg?type=o1000');
        expect(upscaleUrl('https://x/a.jpg?type=f80')).toBe('https://x/a.jpg?type=o1000');
        expect(upscaleUrl('https://x/a.jpg?type=w300')).toBe('https://x/a.jpg?type=o1000');
    });

    it('leaves images >=500px untouched', () => {
        // f860 is large enough — never narrowed by upscaleUrl (size >= 500).
        expect(upscaleUrl('https://x/a.jpg?type=f860')).toBe('https://x/a.jpg?type=f860');
        expect(upscaleUrl('https://x/a.jpg?type=o1000')).toBe('https://x/a.jpg?type=o1000');
        expect(upscaleUrl('https://x/a.jpg?type=m1000_pd')).toBe('https://x/a.jpg?type=m1000_pd');
    });

    it('leaves a URL without a type parameter unchanged', () => {
        expect(upscaleUrl('https://x/a.jpg')).toBe('https://x/a.jpg');
    });

    it('does not match a blur placeholder type', () => {
        // The regex expects digits right after the leading letter; in "blur0_8" the
        // letter 'b' is followed by 'l', so there is no match and the URL is unchanged.
        expect(upscaleUrl('https://x/a.jpg?type=blur0_8')).toBe('https://x/a.jpg?type=blur0_8');
    });

    it('preserves trailing query parameters after the type token', () => {
        expect(upscaleUrl('https://x/a.jpg?type=f40&foo=bar')).toBe('https://x/a.jpg?type=o1000&foo=bar');
    });
});

describe('isJunkUrl', () => {
    it('rejects non-http and data URIs', () => {
        expect(isJunkUrl('')).toBe(true);
        expect(isJunkUrl('ftp://x/a.jpg')).toBe(true);
        expect(isJunkUrl('data:image/png;base64,AAAA')).toBe(true);
    });

    it('rejects known UI / ad / tracking patterns', () => {
        expect(isJunkUrl('https://x/logo.png')).toBe(true);
        expect(isJunkUrl('https://x/icon_close.png')).toBe(true);
        expect(isJunkUrl('https://x/banner.jpg')).toBe(true);
        expect(isJunkUrl('https://searchad-phinf.pstatic.net/x.jpg')).toBe(true);
        expect(isJunkUrl('https://video-phinf.pstatic.net/x.jpg')).toBe(true);
    });

    it('rejects GIF and SVG assets', () => {
        expect(isJunkUrl('https://x/anim.gif')).toBe(true);
        expect(isJunkUrl('https://x/vector.svg')).toBe(true);
    });

    it('accepts a real product image URL', () => {
        expect(isJunkUrl('https://shop-phinf.pstatic.net/product_01.jpg')).toBe(false);
        expect(isJunkUrl('https://shop-phinf.pstatic.net/x.jpg?type=o1000')).toBe(false);
    });
});
