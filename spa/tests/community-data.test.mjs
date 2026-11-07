// Board data coming from the server is coerced before a screen draws it (2026-11-08).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from './helpers/load-ts.mjs';

const data = createLoader()('../../src/lib/communityData.ts');

test('only http(s) addresses survive', () => {
    assert.equal(data.safeHttpUrl('https://blog.naver.com/a/1'), 'https://blog.naver.com/a/1');
    assert.equal(data.safeHttpUrl('http://example.com/x'), 'http://example.com/x');
    for (const bad of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'ftp://x.example/a', '/relative', '//evil.example', '', null, undefined, 5, { href: 'https://x.example' }, `https://x.example/${'a'.repeat(2100)}`]) {
        assert.equal(data.safeHttpUrl(bad), '', JSON.stringify(bad)?.slice(0, 40));
    }
});

test('a post without an id is dropped; odd value types become safe text and numbers', () => {
    assert.equal(data.normalizePost({ title: 'no id' }), null);
    assert.equal(data.normalizePost(null), null);
    const post = data.normalizePost({
        id: 'p_1', board: { x: 1 }, title: ['a'], nickname: 42, grade: { key: 'leaf', label: '잎새' }, isOperator: 'true', views: '12', likes: -4,
        comments: 'many', pinned: 1, mine: 'yes', url: 'javascript:alert(1)', status: null,
    });
    assert.equal(post.id, 'p_1');
    assert.equal(post.board, '');
    assert.equal(post.title, '');
    assert.equal(post.nickname, '');
    assert.equal(post.isOperator, false, 'only a real true counts');
    assert.equal(post.pinned, false);
    assert.equal(post.mine, false);
    assert.deepEqual([post.views, post.likes, post.comments], [12, 0, 0]);
    assert.equal(post.url, '');
    assert.deepEqual(post.grade, { key: 'leaf', label: '잎새' });
});

test('normalizePosts keeps the good rows of a mixed list and survives a non-list', () => {
    assert.deepEqual(data.normalizePosts(undefined), []);
    assert.deepEqual(data.normalizePosts('x'), []);
    assert.deepEqual(data.normalizePosts([{ id: 'a' }, 7, null, { id: 'b' }]).map((post) => post.id), ['a', 'b']);
});

test('comments keep one level of replies; a removed comment shows no author and no text', () => {
    const [top] = data.normalizeComments([{
        id: 'c_1', postId: 'p_1', nickname: '글쓴이', body: '본문', deleted: true,
        replies: [{ id: 'c_2', parentId: 'c_1', nickname: '답글러', body: '답글', replies: [{ id: 'c_3', nickname: '너무 깊음', body: 'x' }] }],
    }]);
    assert.equal(top.gone, true);
    assert.deepEqual([top.nickname, top.body, top.grade, top.isOperator], ['', '', null, false]);
    assert.equal(top.replies.length, 1);
    assert.equal(top.replies[0].replies.length, 0, 'replies of replies are not kept');
    assert.equal(top.replies[0].nickname, '답글러');
    assert.equal(data.normalizeComment({ nickname: 'no id' }), null);
});
