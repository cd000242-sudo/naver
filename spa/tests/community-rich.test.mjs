// Rich post body (forum contract 1114 §3): JSON blocks, limits, the safe reader, plain text and excerpts.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    RICH_LIMITS, safeHref, normalizeLinkInput, validateRichDoc, parseRichBody, serializeRichDoc, richPlainText, richTextLength,
    richExcerpt, richImageIds, checkRichDraft,
} from '../src/lib/communityRich.mjs';

const p = (...runs) => ({ t: 'p', c: runs });
const run = (x, extra = {}) => ({ x, ...extra });
const doc = (...blocks) => ({ v: 1, blocks });

test('limits are the contract numbers', () => {
    assert.deepEqual(RICH_LIMITS, { text: 5000, json: 30000, blocks: 200, images: 6, listItems: 50, href: 500 });
});

test('safeHref keeps https addresses up to 500 characters and nothing else', () => {
    assert.equal(safeHref('https://example.com/a?b=1'), 'https://example.com/a?b=1');
    for (const bad of ['http://example.com', 'javascript:alert(1)', 'data:text/html,hi', '//example.com', 'example.com', '', undefined, 5]) assert.equal(safeHref(bad), '', String(bad));
    assert.equal(safeHref(`https://example.com/${'a'.repeat(500)}`), '', 'longer than 500');
});

test('normalizeLinkInput is what a writer typed made into a safe https address', () => {
    assert.equal(normalizeLinkInput('https://naver.com/x'), 'https://naver.com/x');
    assert.equal(normalizeLinkInput('  naver.com  '), 'https://naver.com/');
    assert.equal(normalizeLinkInput('www.naver.com/a b'), 'https://www.naver.com/a%20b');
    assert.equal(normalizeLinkInput('http://a.com/p?q=1'), 'https://a.com/p?q=1', 'http is raised to https');
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'ftp://a.com/x', 'localhost', 'a b', '', '   ']) assert.equal(normalizeLinkInput(bad), '', bad);
});

test('a good document passes validation', () => {
    const good = doc(
        { t: 'h', l: 2, c: [run('소제목')] }, p(run('굵게', { b: 1 }), run(' 기울임', { i: 1 }), run(' 링크', { href: 'https://a.com/x' })),
        { t: 'quote', c: [run('인용')] }, { t: 'ul', items: [[run('가')], [run('나')]] }, { t: 'ol', items: [[run('하나')]] },
        { t: 'img', id: 'i1', alt: '사진 1' }, { t: 'hr' },
    );
    assert.deepEqual(validateRichDoc(good), { ok: true });
});

test('validation refuses every shape outside the allowlist', () => {
    const bad = (value, pattern) => {
        const result = validateRichDoc(value);
        assert.equal(result.ok, false, JSON.stringify(value).slice(0, 80));
        assert.match(result.message, pattern);
    };
    bad(null, /내용/);
    bad({ v: 2, blocks: [] }, /내용/);
    bad({ v: 1, blocks: 'x' }, /내용/);
    bad(doc({ t: 'script', c: [] }), /내용/);
    bad(doc({ t: 'p', c: [run('a')], extra: 1 }), /내용/);
    bad(doc({ t: 'h', l: 4, c: [run('a')] }), /내용/);
    bad(doc({ t: 'h', l: 1, c: [run('a')] }), /내용/);
    bad(doc(p(run('a', { onclick: 'x' }))), /내용/);
    bad(doc(p(run('a', { b: 2 }))), /내용/);
    bad(doc(p(run('a', { href: 'javascript:alert(1)' }))), /내용/);
    bad(doc(p(run('a', { href: 'http://a.com' }))), /내용/);
    bad(doc(p({ x: 5 })), /내용/);
    bad(doc({ t: 'img', id: 'bad id!', alt: '' }), /내용/);
    bad(doc({ t: 'img', id: 'ok', alt: 'a', src: 'https://x' }), /내용/);
    bad(doc({ t: 'hr', c: [] }), /내용/);
    bad(doc({ t: 'ul', items: [] }), /내용/);
});

test('validation enforces the size limits with words a writer understands', () => {
    assert.match(validateRichDoc(doc(p(run('가'.repeat(5001))))).message, /5,000자/);
    assert.equal(validateRichDoc(doc(p(run('가'.repeat(5000))))).ok, true);
    assert.match(validateRichDoc(doc(...Array.from({ length: 201 }, () => p(run('a'))))).message, /너무 길/);
    const images = Array.from({ length: 7 }, (_, index) => ({ t: 'img', id: `i${index}`, alt: 'a' }));
    assert.match(validateRichDoc(doc(...images)).message, /6장/);
    assert.match(validateRichDoc(doc({ t: 'ul', items: Array.from({ length: 51 }, () => [run('a')]) })).message, /목록/);
    const heavy = Array.from({ length: 150 }, () => p(...Array.from({ length: 20 }, (_, index) => run('a', index % 2 ? { b: 1 } : {}))));
    assert.match(validateRichDoc(doc(...heavy)).message, /너무 길/);
});

test('the reader keeps what is safe and drops the rest, never throwing', () => {
    const text = JSON.stringify(doc(
        p(run('안녕')), { t: 'script', c: [] }, p(run('링크', { href: 'javascript:alert(1)' }), run('굵게', { b: 1, onclick: 'x' })),
        { t: 'img', id: 'ok_1-a', alt: '설명' }, { t: 'img', id: '<bad>', alt: 'x' }, { t: 'ul', items: [[run('가')], 'x', [run('나')]] }, { t: 'h', l: 9, c: [run('큰')] }, { t: 'hr' },
    ));
    const parsed = parseRichBody(text);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.blocks, [
        p(run('안녕')),
        p(run('링크'), run('굵게', { b: 1 })),
        { t: 'img', id: 'ok_1-a', alt: '설명' },
        { t: 'ul', items: [[run('가')], [run('나')]] },
        { t: 'h', l: 2, c: [run('큰')] },
        { t: 'hr' },
    ]);
    for (const broken of ['', 'plain text', '{"v":1}', '{"v":2,"blocks":[]}', '[]', 'null', '{"v":1,"blocks":5}']) assert.deepEqual(parseRichBody(broken), { ok: false, blocks: [] }, broken);
    assert.equal(parseRichBody(undefined).ok, false);
});

test('the reader caps what it draws: 200 blocks, 6 images, 50 list items', () => {
    const many = JSON.stringify(doc(...Array.from({ length: 260 }, (_, index) => p(run(`줄 ${index}`)))));
    assert.equal(parseRichBody(many).blocks.length, 200);
    const images = JSON.stringify(doc(...Array.from({ length: 9 }, (_, index) => ({ t: 'img', id: `i${index}`, alt: 'a' }))));
    assert.equal(parseRichBody(images).blocks.length, 6);
    const items = JSON.stringify(doc({ t: 'ol', items: Array.from({ length: 80 }, () => [run('a')]) }));
    assert.equal(parseRichBody(items).blocks[0].items.length, 50);
});

test('plain text: one line per block or list item, nothing for pictures and rules', () => {
    const blocks = [{ t: 'h', l: 2, c: [run('제목')] }, p(run('가'), run('나', { b: 1 })), { t: 'img', id: 'a', alt: 'x' }, { t: 'ul', items: [[run('하나')], [run('둘')]] }, { t: 'hr' }, { t: 'quote', c: [run('인용')] }];
    assert.equal(richPlainText(blocks), '제목\n가나\n하나\n둘\n인용');
    assert.equal(richTextLength(blocks), '제목가나하나둘인용'.length);
    assert.equal(richPlainText([]), '');
    assert.equal(richPlainText(undefined), '');
});

test('image ids in the order the document uses them', () => {
    assert.deepEqual(richImageIds([p(run('a')), { t: 'img', id: 'b', alt: '' }, { t: 'img', id: 'a', alt: '' }]), ['b', 'a']);
    assert.deepEqual(richImageIds([]), []);
});

test('an excerpt is plain text from the document, one line, cut with an ellipsis; JSON never leaks', () => {
    const body = serializeRichDoc([p(run('첫 줄 '), run('굵은 글', { b: 1 })), p(run('둘째 줄'))]);
    assert.equal(richExcerpt(body, 100), '첫 줄 굵은 글 둘째 줄');
    assert.equal(richExcerpt(body, 5), '첫 줄 굵…');
    assert.ok(!richExcerpt(body, 100).includes('{'));
    assert.equal(richExcerpt('not json at all', 100), 'not json at all', 'a plain body is kept as text');
    assert.equal(richExcerpt('', 100), '');
});

test('serialize writes exactly {"v":1,"blocks":[...]} and reads back the same', () => {
    const blocks = [p(run('a', { b: 1 })), { t: 'hr' }];
    const text = serializeRichDoc(blocks);
    assert.equal(text, '{"v":1,"blocks":[{"t":"p","c":[{"x":"a","b":1}]},{"t":"hr"}]}');
    assert.deepEqual(parseRichBody(text).blocks, blocks);
});

test('the draft check says one plain sentence, or nothing', () => {
    assert.equal(checkRichDraft([p(run('안녕하세요'))]), '');
    assert.match(checkRichDraft([]), /내용/);
    assert.match(checkRichDraft([{ t: 'hr' }, { t: 'img', id: 'a', alt: '' }]), /글자/, 'pictures alone are not a post');
    assert.match(checkRichDraft([p(run('가'.repeat(5001)))]), /5,000자/);
    assert.match(checkRichDraft([p(run('a')), ...Array.from({ length: 7 }, (_, index) => ({ t: 'img', id: `i${index}`, alt: '' }))]), /6장/);
});

// Server rule (GAS 1114): a link address with @, a quote, < >, or a backslash is refused, so the page keeps it out too.
test('addresses with @ quotes < > or a backslash are never a link', () => {
    for (const bad of ['https://a.com/@user', 'https://a.com/"x', "https://a.com/'x", 'https://a.com/<b>', 'https://a.com/a\\b', 'https://user@a.com/', 'a.com/@x', 'a.com/"x']) {
        assert.equal(normalizeLinkInput(bad), '', bad);
        assert.equal(safeHref(bad), '', bad);
    }
    assert.equal(normalizeLinkInput('https://a.com/p?q=가나다&r=1#top'), 'https://a.com/p?q=%EA%B0%80%EB%82%98%EB%8B%A4&r=1#top', 'plain Korean in a query is encoded, not refused');
    const result = validateRichDoc({ v: 1, blocks: [{ t: 'p', c: [{ x: 'a', href: 'https://a.com/@x' }] }] });
    assert.equal(result.ok, false);
    assert.equal(parseRichBody(JSON.stringify({ v: 1, blocks: [{ t: 'p', c: [{ x: 'a', href: 'https://a.com/@x' }] }] })).blocks[0].c[0].href, undefined);
});
