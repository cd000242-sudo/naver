// Promo board platform rules (forum contract 1114 §2): naver | google, host checks, suggestions, old rows.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    PROMO_PLATFORMS, DEFAULT_PLATFORM, normalizePlatform, hostOf, suggestPlatform, validatePromoUrl, promoPlatformOf, platformFromUrl,
} from '../src/lib/communityPlatform.mjs';

test('two platforms, naver first and the default', () => {
    assert.deepEqual(PROMO_PLATFORMS.map((entry) => [entry.key, entry.label]), [['naver', '네이버 블로그'], ['google', '구글 블로그']]);
    assert.equal(DEFAULT_PLATFORM, 'naver');
    assert.equal(normalizePlatform('google'), 'google');
    assert.equal(normalizePlatform('naver'), 'naver');
    for (const odd of ['', undefined, null, 'tistory', 'GOOGLE', 5]) assert.equal(normalizePlatform(odd), 'naver');
});

test('hostOf reads the lower-case host of an https address and nothing else', () => {
    assert.equal(hostOf('https://Blog.Naver.com/abc/1'), 'blog.naver.com');
    assert.equal(hostOf('http://blog.naver.com/abc'), 'blog.naver.com');
    assert.equal(hostOf('javascript:alert(1)'), '');
    assert.equal(hostOf('not a url'), '');
    assert.equal(hostOf(undefined), '');
});

test('naver needs https on blog.naver.com or m.blog.naver.com', () => {
    assert.equal(validatePromoUrl('https://blog.naver.com/abc/223', 'naver'), '');
    assert.equal(validatePromoUrl('https://m.blog.naver.com/abc/223', 'naver'), '');
    for (const bad of ['http://blog.naver.com/abc/223', 'https://cafe.naver.com/abc', 'https://naver.com/abc', 'https://evil-blog.naver.com.example.com/a', 'https://x.tistory.com/1']) {
        assert.match(validatePromoUrl(bad, 'naver'), /blog\.naver\.com/, bad);
    }
});

test('google takes any https address that is not on naver.com, Blogger custom domains included', () => {
    assert.equal(validatePromoUrl('https://myblog.blogspot.com/2026/11/post.html', 'google'), '');
    assert.equal(validatePromoUrl('https://www.my-own-domain.kr/post/1', 'google'), '');
    assert.match(validatePromoUrl('https://blog.naver.com/abc/1', 'google'), /네이버/);
    assert.match(validatePromoUrl('https://m.blog.naver.com/abc/1', 'google'), /네이버/);
    assert.match(validatePromoUrl('https://naver.com/x', 'google'), /네이버/);
    assert.match(validatePromoUrl('http://myblog.blogspot.com/1', 'google'), /https/);
    assert.match(validatePromoUrl('', 'google'), /https/);
    assert.equal(validatePromoUrl('https://notnaver.com/x', 'google'), '', 'only naver.com itself and its sub-hosts count as naver');
});

test('an address picks its platform: blogspot suggests google, blog.naver.com suggests naver, others suggest nothing', () => {
    assert.equal(suggestPlatform('https://abc.blogspot.com/2026/01/x.html'), 'google');
    assert.equal(suggestPlatform('https://abc.blogspot.kr/2026/01/x.html'), 'google');
    assert.equal(suggestPlatform('https://blog.naver.com/abc/1'), 'naver');
    assert.equal(suggestPlatform('https://m.blog.naver.com/abc/1'), 'naver');
    assert.equal(suggestPlatform('https://www.my-own-domain.kr/post/1'), '');
    assert.equal(suggestPlatform('abc'), '');
});

test('platformFromUrl: a naver host is naver, any other https host is google, a bad address is empty', () => {
    assert.equal(platformFromUrl('https://blog.naver.com/a/1'), 'naver');
    assert.equal(platformFromUrl('https://cafe.naver.com/a'), 'naver');
    assert.equal(platformFromUrl('https://abc.tistory.com/1'), 'google');
    assert.equal(platformFromUrl('nonsense'), '');
});

test('a promo row without a known platform takes it from its address (old rows)', () => {
    assert.equal(promoPlatformOf({ platform: 'google', url: 'https://blog.naver.com/a/1' }), 'google', 'the stored value wins');
    assert.equal(promoPlatformOf({ platform: 'naver', url: 'https://x.blogspot.com/1' }), 'naver');
    assert.equal(promoPlatformOf({ platform: '', url: 'https://blog.naver.com/a/1' }), 'naver');
    assert.equal(promoPlatformOf({ platform: 'tistory', url: 'https://abc.tistory.com/1' }), 'google', 'an older wording is read from the address');
    assert.equal(promoPlatformOf({ url: '' }), 'naver', 'nothing to go on: the default');
});
