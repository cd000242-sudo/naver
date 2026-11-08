// Picture rules for posts (forum contract 1114 §3): 1000px long side, JPEG, 160 KB each, 6 at most.
import test from 'node:test';
import assert from 'node:assert/strict';
import { IMAGE_LIMITS, fitWithin, base64Length, encodeWithinBudget, planImageAdd, isJpegDataUrl } from '../src/lib/communityImage.mjs';

test('limits are the contract numbers, and a full-size picture fits the server cell', () => {
    assert.deepEqual(IMAGE_LIMITS, { maxSide: 1000, quality: 0.72, retryQuality: 0.55, maxBytes: 160 * 1024, maxCount: 6, maxBase64: 220000 });
    assert.ok(base64Length(IMAGE_LIMITS.maxBytes) <= IMAGE_LIMITS.maxBase64);
});

test('base64Length is 4 characters per 3 bytes, rounded up', () => {
    assert.equal(base64Length(0), 0);
    assert.equal(base64Length(1), 4);
    assert.equal(base64Length(3), 4);
    assert.equal(base64Length(4), 8);
});

test('the long side is cut to 1000, the shape is kept and a small picture is never enlarged', () => {
    assert.deepEqual(fitWithin(4000, 3000), { width: 1000, height: 750 });
    assert.deepEqual(fitWithin(3000, 4000), { width: 750, height: 1000 });
    assert.deepEqual(fitWithin(1000, 1000), { width: 1000, height: 1000 });
    assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 });
    assert.deepEqual(fitWithin(10000, 10), { width: 1000, height: 1 });
    assert.deepEqual(fitWithin(0, 0), { width: 1, height: 1 });
    assert.deepEqual(fitWithin(2000, 1333, 500), { width: 500, height: 333 });
});

test('encoding tries 0.72 first, then 0.55 once, then gives up', async () => {
    const tried = [];
    const sized = (...sizes) => async (quality) => { tried.push(quality); return { size: sizes[tried.length - 1] }; };
    const small = await encodeWithinBudget(sized(100 * 1024));
    assert.deepEqual(tried, [0.72]);
    assert.equal(small.ok, true);
    assert.equal(small.quality, 0.72);
    tried.length = 0;
    const retried = await encodeWithinBudget(sized(200 * 1024, 150 * 1024));
    assert.deepEqual(tried, [0.72, 0.55]);
    assert.equal(retried.ok, true);
    assert.equal(retried.quality, 0.55);
    tried.length = 0;
    const refused = await encodeWithinBudget(sized(200 * 1024, 190 * 1024));
    assert.deepEqual(tried, [0.72, 0.55]);
    assert.equal(refused.ok, false);
    assert.match(refused.message, /큰|커요/);
});

test('a picture the browser cannot encode is refused with a plain sentence', async () => {
    const none = await encodeWithinBudget(async () => null);
    assert.equal(none.ok, false);
    assert.match(none.message, /사진/);
    const broken = await encodeWithinBudget(async () => { throw new Error('boom'); });
    assert.equal(broken.ok, false);
    assert.match(broken.message, /사진/);
});

test('adding pictures: only images, only up to six in all', () => {
    const file = (type, name = 'a') => ({ type, name });
    const room = planImageAdd(2, [file('image/jpeg'), file('image/png')]);
    assert.equal(room.accept.length, 2);
    assert.equal(room.message, '');
    const over = planImageAdd(5, [file('image/jpeg'), file('image/png'), file('image/webp')]);
    assert.equal(over.accept.length, 1);
    assert.match(over.message, /6장/);
    const text = planImageAdd(0, [file('application/pdf'), file('image/gif')]);
    assert.equal(text.accept.length, 1);
    assert.match(text.message, /사진/);
    const full = planImageAdd(6, [file('image/jpeg')]);
    assert.equal(full.accept.length, 0);
    assert.match(full.message, /6장/);
    assert.equal(planImageAdd(0, []).accept.length, 0);
    assert.equal(planImageAdd(0, undefined).accept.length, 0);
});

test('a picture shown from the server must be a jpeg data address', () => {
    assert.equal(isJpegDataUrl('data:image/jpeg;base64,/9j/4AAQ'), true);
    for (const bad of ['data:text/html;base64,PGI+', 'data:image/svg+xml;base64,PHN2Zz4=', 'https://x.example/a.jpg', 'javascript:alert(1)', '', undefined, 'data:image/jpeg;base64,<script>']) assert.equal(isJpegDataUrl(bad), false, String(bad));
});
