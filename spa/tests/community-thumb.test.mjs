// Forum contract 1115 §A: the thumbnail made in the browser (size, quality retry, which picture, what to send on edit),
// the row thumbnail choice, and the queue that keeps at most four thumbnails loading at once. Pure code only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    THUMB_LIMITS, encodeThumbWithinBudget, firstImageId, isThumbData, pickRowThumb, planThumb, thumbSize, normalizeThumbId,
} from '../src/lib/communityThumb.mjs';
import { createLimiter, createLru } from '../src/lib/communityLimiter.mjs';

const JPEG_B64 = (length) => `/9j/${'A'.repeat(length - 4)}`;

test('thumbnail size: long side 360, shape kept, never enlarged, never zero', () => {
    assert.equal(THUMB_LIMITS.side, 360);
    assert.deepEqual(thumbSize(1000, 500), { width: 360, height: 180 });
    assert.deepEqual(thumbSize(500, 1000), { width: 180, height: 360 });
    assert.deepEqual(thumbSize(1000, 1000), { width: 360, height: 360 });
    assert.deepEqual(thumbSize(200, 100), { width: 200, height: 100 }, 'a small picture is not enlarged');
    assert.deepEqual(thumbSize(4000, 10), { width: 360, height: 1 }, 'a hairline stays at least one pixel');
    assert.deepEqual(thumbSize(0, 0), { width: 1, height: 1 });
    assert.deepEqual(thumbSize('x', undefined), { width: 1, height: 1 });
});

test('thumbnail budget: 0.7 first, once more at a lower quality when over 40,000 characters, then none', async () => {
    assert.deepEqual([THUMB_LIMITS.quality, THUMB_LIMITS.maxBase64], [0.7, 40000]);
    const asked = [];
    const small = await encodeThumbWithinBudget(async (quality) => { asked.push(quality); return JPEG_B64(40000); });
    assert.deepEqual(asked, [0.7], 'exactly at the limit is fine and costs one encode');
    assert.equal(small.ok, true);
    assert.equal(small.quality, 0.7);

    const calls = [];
    const retried = await encodeThumbWithinBudget(async (quality) => { calls.push(quality); return JPEG_B64(quality === 0.7 ? 40004 : 30000); });
    assert.deepEqual(calls, [0.7, THUMB_LIMITS.retryQuality]);
    assert.equal(retried.ok, true);
    assert.equal(retried.quality, THUMB_LIMITS.retryQuality);
    assert.ok(retried.data.length <= 40000);

    const never = [];
    const refused = await encodeThumbWithinBudget(async (quality) => { never.push(quality); return JPEG_B64(60000); });
    assert.equal(never.length, 2, 'only one retry, never a loop');
    assert.deepEqual(refused, { ok: false });

    assert.deepEqual(await encodeThumbWithinBudget(async () => null), { ok: false });
    assert.deepEqual(await encodeThumbWithinBudget(async () => { throw new Error('canvas'); }), { ok: false });
    assert.deepEqual(await encodeThumbWithinBudget(async () => 'not a jpeg'), { ok: false }, 'the result is checked before it is sent');
});

test('what may be sent as a thumbnail: padded base64 of a JPEG, at most 40,000 characters', () => {
    assert.equal(isThumbData(JPEG_B64(400)), true);
    assert.equal(isThumbData(`${JPEG_B64(400).slice(0, -2)}==`), true, 'padding is allowed');
    assert.equal(isThumbData(JPEG_B64(40004)), false, 'too long');
    assert.equal(isThumbData(JPEG_B64(401)), false, 'unpadded: length is not a multiple of 4');
    assert.equal(isThumbData(`iVBO${'A'.repeat(396)}`), false, 'not a JPEG signature');
    assert.equal(isThumbData(`data:image/jpeg;base64,${JPEG_B64(400)}`), false, 'no data address prefix');
    assert.equal(isThumbData(''), false);
    assert.equal(isThumbData(null), false);
    assert.equal(isThumbData(`/9j/${'A'.repeat(395)}!`), false);
});

test('the thumbnail is made from the FIRST picture block of the post', () => {
    const blocks = [{ t: 'p', c: [{ x: 'a' }] }, { t: 'img', id: 'iFirst', alt: '' }, { t: 'img', id: 'iSecond', alt: '' }];
    assert.equal(firstImageId(blocks), 'iFirst');
    assert.equal(firstImageId([{ t: 'p', c: [] }]), '');
    assert.equal(firstImageId([]), '');
    assert.equal(firstImageId(null), '');
    assert.equal(firstImageId([{ t: 'img', id: 5 }, { t: 'img', id: 'ok' }]), 'ok', 'a block without a usable id is skipped');
});

test('a new post: thumbnail from the attached first picture; no picture, no thumbnail', () => {
    const blocks = [{ t: 'img', id: 'iA', alt: '' }, { t: 'img', id: 'iB', alt: '' }];
    assert.deepEqual(planThumb({ blocks, attachedIds: ['iA', 'iB'] }), { action: 'attached', id: 'iA' });
    assert.deepEqual(planThumb({ blocks: [{ t: 'p', c: [] }], attachedIds: [] }), { action: 'none' });
    assert.deepEqual(planThumb({ blocks, attachedIds: [] }), { action: 'none' }, 'a picture we cannot read is not guessed at');
});

test('an edit: keep the stored thumbnail when the first picture did not change, otherwise make a new one', () => {
    const same = [{ t: 'img', id: 'iOld', alt: '' }, { t: 'img', id: 'iTwo', alt: '' }];
    const edit = { editingPostId: 'p1', originalFirstId: 'iOld', hadThumb: true };
    assert.deepEqual(planThumb({ blocks: same, attachedIds: [], ...edit }), { action: 'none' }, 'unchanged first picture keeps the server thumbnail');
    const swapped = [{ t: 'img', id: 'iTwo', alt: '' }];
    assert.deepEqual(planThumb({ blocks: swapped, attachedIds: [], ...edit }), { action: 'server', id: 'iTwo' }, 'the old second picture became the first');
    const added = [{ t: 'img', id: 'iNew', alt: '' }, { t: 'img', id: 'iOld', alt: '' }];
    assert.deepEqual(planThumb({ blocks: added, attachedIds: ['iNew'], ...edit }), { action: 'attached', id: 'iNew' });
    assert.deepEqual(planThumb({ blocks: same, attachedIds: [], ...edit, hadThumb: false }), { action: 'server', id: 'iOld' }, 'an old post gets its thumbnail on the next edit');
    assert.deepEqual(planThumb({ blocks: [{ t: 'p', c: [] }], attachedIds: [], ...edit }), { action: 'none' }, 'no picture left: the server deletes the thumbnail itself');
    assert.deepEqual(planThumb({ blocks: swapped, attachedIds: [], originalFirstId: 'iOld', hadThumb: true }), { action: 'none' }, 'without a post id nothing can be fetched');
});

test('a row shows a thumbnail only when the server gave an id or an https address', () => {
    assert.deepEqual(pickRowThumb({ thumbId: '_thumb', thumbUrl: '' }), { has: true, id: '_thumb', url: '' });
    assert.deepEqual(pickRowThumb({ thumbId: 'iab12', thumbUrl: 'https://x.test/a.jpg' }), { has: true, id: 'iab12', url: '' }, 'our own picture wins');
    assert.deepEqual(pickRowThumb({ thumbId: '', thumbUrl: 'https://x.test/a.jpg' }), { has: true, id: '', url: 'https://x.test/a.jpg' });
    assert.deepEqual(pickRowThumb({ thumbId: '', thumbUrl: '' }), { has: false, id: '', url: '' });
    assert.deepEqual(pickRowThumb({ thumbId: '', thumbUrl: 'http://x.test/a.jpg' }), { has: false, id: '', url: '' }, 'http is not shown');
    assert.deepEqual(pickRowThumb(null), { has: false, id: '', url: '' });
    assert.equal(normalizeThumbId('_thumb'), '_thumb');
    assert.equal(normalizeThumbId('../x'), '');
    assert.equal(normalizeThumbId('a'.repeat(41)), '');
    assert.equal(normalizeThumbId(7), '');
});

const deferred = () => {
    let resolve; let reject;
    const promise = new Promise((ok, no) => { resolve = ok; reject = no; });
    return { promise, resolve, reject };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('the queue runs four loads at once, the rest wait their turn in order', async () => {
    const limiter = createLimiter(4);
    const gates = Array.from({ length: 10 }, deferred);
    const started = [];
    let running = 0;
    let peak = 0;
    const results = gates.map((gate, index) => limiter.run(async () => {
        started.push(index);
        running += 1;
        peak = Math.max(peak, running);
        const value = await gate.promise;
        running -= 1;
        return value;
    }));
    await tick();
    assert.deepEqual(started, [0, 1, 2, 3]);
    assert.deepEqual([limiter.active(), limiter.waiting()], [4, 6]);
    gates[1].resolve('b');
    await tick();
    assert.deepEqual(started, [0, 1, 2, 3, 4], 'the next one starts as soon as a place is free');
    gates.forEach((gate, index) => gate.resolve(`v${index}`));
    const all = await Promise.all(results);
    assert.equal(all[1], 'b');
    assert.equal(all[9], 'v9');
    assert.equal(peak, 4, 'never more than four at a time');
    assert.deepEqual(started, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.deepEqual([limiter.active(), limiter.waiting()], [0, 0]);
});

test('a load that fails gives its place back and does not stop the others', async () => {
    const limiter = createLimiter(1);
    const first = limiter.run(async () => { throw new Error('network'); });
    const second = limiter.run(async () => 'fine');
    await assert.rejects(first, /network/);
    assert.equal(await second, 'fine');
    assert.equal(limiter.active(), 0);
    const sync = limiter.run(() => { throw new Error('sync'); });
    await assert.rejects(sync, /sync/);
    assert.equal(await limiter.run(async () => 'after'), 'after');
    assert.equal(createLimiter(0).run.length, 1, 'a limit below one still works as one');
    assert.equal(await createLimiter(0).run(async () => 'one'), 'one');
});

test('the in-memory thumbnail store keeps the most recently used ones', () => {
    const store = createLru(3);
    store.set('a', 1); store.set('b', 2); store.set('c', 3);
    assert.equal(store.get('a'), 1, 'reading refreshes');
    store.set('d', 4);
    assert.equal(store.has('b'), false, 'the least recently used goes');
    assert.deepEqual(['a', 'c', 'd'].map((key) => store.get(key)), [1, 3, 4]);
    assert.equal(store.size(), 3);
    assert.deepEqual(store.keys(), ['a', 'c', 'd'], 'oldest first (the reads above made d the freshest)');
    assert.equal(store.delete('c'), true);
    assert.equal(store.has('c'), false);
    store.clear();
    assert.equal(store.size(), 0);
    assert.equal(store.get('a'), undefined);
});
