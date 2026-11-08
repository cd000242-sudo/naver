// Forum contract 1115 §B: where each ranked post goes in the "인기글" grid (desktop and phone), the rank badges and the
// board colours of a card without a picture. Pure code only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TOP_MAX, boardTone, orderTop, placeTopGrid, rankBadge, topLayoutFor } from '../src/lib/communityTopGrid.mjs';

const item = (id, rank) => ({ id, ...(rank === undefined ? {} : { rank }), title: `글 ${id}` });
const ranked = (count) => Array.from({ length: count }, (_, index) => item(`p${index + 1}`, index + 1));
const spot = (cell) => [cell.rank, cell.col, cell.row, cell.colSpan, cell.rowSpan];

test('the order is the server rank; ties and gaps are settled by position; at most ten; no post twice', () => {
    assert.equal(TOP_MAX, 10);
    const shuffled = [item('c', 3), item('a', 1), item('b', 2)];
    assert.deepEqual(orderTop(shuffled).map((entry) => [entry.id, entry.rank]), [['a', 1], ['b', 2], ['c', 3]]);
    assert.deepEqual(orderTop([item('x'), item('y'), item('z')]).map((entry) => [entry.id, entry.rank]), [['x', 1], ['y', 2], ['z', 3]], 'no rank sent: the list order is the rank');
    assert.deepEqual(orderTop([item('a', 5), item('b', 9)]).map((entry) => entry.rank), [1, 2], 'gaps are closed');
    assert.deepEqual(orderTop([item('a', 1), item('a', 2), item('b', 3)]).map((entry) => entry.id), ['a', 'b']);
    assert.equal(orderTop(ranked(14)).length, 10);
    assert.deepEqual(orderTop(null), []);
    assert.deepEqual(orderTop([null, {}, { id: '' }, item('ok', 1)]).map((entry) => entry.id), ['ok'], 'rows without an id are dropped');
});

test('desktop: rank 1 is 2 columns x 2 rows, ranks 2-5 sit around it, ranks 6-10 are a numbered list', () => {
    const grid = placeTopGrid(ranked(10), 'wide');
    assert.deepEqual(grid.cards.map(spot), [
        [1, 1, 1, 2, 2],
        [2, 3, 1, 1, 1], [3, 4, 1, 1, 1],
        [4, 3, 2, 1, 1], [5, 4, 2, 1, 1],
    ]);
    assert.deepEqual(grid.cards.map((cell) => cell.zone), ['hero', 'card', 'card', 'card', 'card']);
    assert.deepEqual(grid.list.map((entry) => [entry.rank, entry.item.id]), [[6, 'p6'], [7, 'p7'], [8, 'p8'], [9, 'p9'], [10, 'p10']]);
    assert.equal(grid.columns, 4);
});

test('phone: rank 1 full width, ranks 2-5 two by two, ranks 6-10 a list', () => {
    const grid = placeTopGrid(ranked(10), 'narrow');
    assert.deepEqual(grid.cards.map(spot), [
        [1, 1, 1, 2, 1],
        [2, 1, 2, 1, 1], [3, 2, 2, 1, 1],
        [4, 1, 3, 1, 1], [5, 2, 3, 1, 1],
    ]);
    assert.equal(grid.columns, 2);
    assert.deepEqual(grid.list.map((entry) => entry.rank), [6, 7, 8, 9, 10]);
});

test('few posts: the grid shrinks instead of leaving holes (a fresh week has only a few)', () => {
    assert.deepEqual(placeTopGrid([], 'wide'), { cards: [], list: [], columns: 4 });
    assert.deepEqual(placeTopGrid([], 'narrow'), { cards: [], list: [], columns: 2 });
    const one = placeTopGrid(ranked(1), 'wide');
    assert.deepEqual(one.cards.map(spot), [[1, 1, 1, 4, 1]], 'a lone post takes the whole width, one row');
    const two = placeTopGrid(ranked(2), 'wide');
    assert.deepEqual(two.cards.map(spot), [[1, 1, 1, 3, 1], [2, 4, 1, 1, 1]], 'one small card: the picture takes the rest of the row');
    const three = placeTopGrid(ranked(3), 'wide');
    assert.deepEqual(three.cards.map(spot), [[1, 1, 1, 2, 1], [2, 3, 1, 1, 1], [3, 4, 1, 1, 1]], 'two small cards: one row only');
    const four = placeTopGrid(ranked(4), 'wide');
    assert.deepEqual(four.cards.map(spot), [[1, 1, 1, 2, 2], [2, 3, 1, 1, 1], [3, 4, 1, 1, 1], [4, 3, 2, 2, 1]], 'three small cards need the second row; the last one fills it');
    assert.deepEqual(placeTopGrid(ranked(5), 'wide').list, []);
    assert.deepEqual(placeTopGrid(ranked(7), 'narrow').list.map((entry) => entry.rank), [6, 7]);
    assert.deepEqual(placeTopGrid(ranked(2), 'narrow').cards.map(spot), [[1, 1, 1, 2, 1], [2, 1, 2, 2, 1]], 'a card alone in its row fills it');
    assert.deepEqual(placeTopGrid(ranked(4), 'narrow').cards.map(spot), [[1, 1, 1, 2, 1], [2, 1, 2, 1, 1], [3, 2, 2, 1, 1], [4, 1, 3, 2, 1]]);
});

test('every post lands in exactly one place, in rank order', () => {
    for (const layout of ['wide', 'narrow']) {
        for (let count = 0; count <= 12; count += 1) {
            const grid = placeTopGrid(ranked(count), layout);
            const seen = [...grid.cards.map((cell) => cell.item.id), ...grid.list.map((entry) => entry.item.id)];
            assert.deepEqual(seen, ranked(Math.min(count, 10)).map((entry) => entry.id), `${layout} ${count}`);
        }
    }
    assert.deepEqual(placeTopGrid(ranked(3), 'sideways').cards.map(spot), placeTopGrid(ranked(3), 'wide').cards.map(spot), 'an unknown layout is the desktop one');
});

test('the layout follows the width: 720 and below is the phone grid', () => {
    assert.equal(topLayoutFor(1280), 'wide');
    assert.equal(topLayoutFor(721), 'wide');
    assert.equal(topLayoutFor(720), 'narrow');
    assert.equal(topLayoutFor(390), 'narrow');
    assert.equal(topLayoutFor(undefined), 'wide');
});

test('rank badges: gold, silver, bronze, then plain', () => {
    assert.deepEqual([1, 2, 3, 4, 10].map(rankBadge), ['gold', 'silver', 'bronze', 'plain', 'plain']);
    assert.equal(rankBadge(0), 'plain');
    assert.equal(rankBadge('x'), 'plain');
});

test('a card without a picture is a tile in its board colour; an unknown board gets the plain one', () => {
    assert.deepEqual(['notice', 'news', 'request', 'inquiry', 'free', 'promo'].map(boardTone), ['notice', 'news', 'request', 'inquiry', 'free', 'promo']);
    assert.equal(boardTone('<script>'), 'other');
    assert.equal(boardTone(''), 'other');
    assert.equal(boardTone(undefined), 'other');
});
