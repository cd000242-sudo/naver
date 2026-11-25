// [2026-11-25 사장님] 오른쪽 아래 떠 있는 '단톡방 바로가기' — 누르면 옆에 선택 상자가 열리고 1번 · 2번 방으로 간다. 단추 칸 수는 그대로.
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createLoader, fakeBrowser, restoreBrowser } from './helpers/load-ts.mjs';

const require = createRequire(import.meta.url);
const ROOM_1 = 'https://open.kakao.com/o/gQ1jRBwh';
const ROOM_2 = 'https://open.kakao.com/o/gajymeSi';

/** Render the real FloatStack; `menuOpen` forces the picker's one boolean state (open) to true. */
function render({ open = true, menuOpen = false } = {}) {
    fakeBrowser();
    try {
        const hooks = menuOpen ? { ...React, useState: (init) => React.useState(init === false ? true : init) } : undefined;
        const { default: FloatStack } = createLoader(hooks)('../../src/components/FloatStack.tsx');
        const { MemoryRouter } = require('react-router-dom');
        return renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(FloatStack, { open, onToggle() {} })));
    } finally { restoreBrowser(); }
}
const tagsOf = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map((match) => match[0]);
const attr = (tag, name) => (tag.match(new RegExp(`\\s${name}="([^"]*)"`)) || [])[1];

test('the two room addresses live in one constant, in order, each with its own name', () => {
    const { CHAT_ROOMS } = createLoader()('../../src/lib/floatRooms.ts');
    assert.deepEqual(CHAT_ROOMS.map((room) => [room.label, room.href]), [['단톡방 1번', ROOM_1], ['단톡방 2번', ROOM_2]]);
    const src = path.resolve(import.meta.dirname, '../src');
    const holders = [];
    (function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (/\.(tsx?|mjs)$/.test(entry.name) && fs.readFileSync(full, 'utf8').includes('gajymeSi')) holders.push(entry.name);
        }
    })(src);
    assert.deepEqual(holders, ['floatRooms.ts'], 'the address is written once');
});

test('keyboard inside the box: arrows wrap around, Home/End jump, other keys are left alone', () => {
    const { roomMenuTarget } = createLoader()('../../src/lib/floatRooms.ts');
    assert.equal(roomMenuTarget(0, 'ArrowDown', 2), 1);
    assert.equal(roomMenuTarget(1, 'ArrowDown', 2), 0);
    assert.equal(roomMenuTarget(0, 'ArrowUp', 2), 1);
    assert.equal(roomMenuTarget(1, 'ArrowUp', 2), 0);
    assert.equal(roomMenuTarget(1, 'Home', 2), 0);
    assert.equal(roomMenuTarget(0, 'End', 2), 1);
    assert.equal(roomMenuTarget(0, 'Tab', 2), null);
    assert.equal(roomMenuTarget(0, 'a', 2), null);
});

test('closed: 단톡방 바로가기 is a button that announces a popup (collapsed); the room links are not reachable', () => {
    const html = render();
    const trigger = tagsOf(html, 'button').find((tag) => attr(tag, 'aria-label') === '단톡방 바로가기');
    assert.ok(trigger, 'the button keeps its name');
    assert.deepEqual([attr(trigger, 'aria-haspopup'), attr(trigger, 'aria-expanded'), attr(trigger, 'type')], ['menu', 'false', 'button']);
    const menu = tagsOf(html, 'div').find((tag) => attr(tag, 'id') === attr(trigger, 'aria-controls'));
    assert.ok(menu && /\shidden=""/.test(menu), 'the controlled box exists and is hidden');
    assert.match(html, /단톡방 바로가기<\/span>/, 'the visible label is unchanged');
});

test('open: two menu rows, each a new-tab link to its own room', () => {
    const html = render({ menuOpen: true });
    const trigger = tagsOf(html, 'button').find((tag) => attr(tag, 'aria-label') === '단톡방 바로가기');
    assert.equal(attr(trigger, 'aria-expanded'), 'true');
    const menu = tagsOf(html, 'div').find((tag) => attr(tag, 'id') === attr(trigger, 'aria-controls'));
    assert.doesNotMatch(menu, /\shidden=""/);
    assert.equal(attr(menu, 'role'), 'menu');
    const rows = tagsOf(html, 'a').filter((tag) => attr(tag, 'role') === 'menuitem');
    assert.deepEqual(rows.map((tag) => attr(tag, 'href')), [ROOM_1, ROOM_2]);
    for (const row of rows) { assert.equal(attr(row, 'target'), '_blank'); assert.match(attr(row, 'rel'), /noopener/); }
    assert.match(html, /단톡방 1번[\s\S]*단톡방 2번/);
});

test('the number of floating slots is unchanged: 1:1, rooms, YouTube, (music slot left free), fold button', () => {
    const bottoms = [...render().matchAll(/bottom:calc\((\d+)px/g)].map((match) => Number(match[1]));
    assert.deepEqual([...new Set(bottoms)].sort((a, b) => a - b), [20, 72, 124, 228]);
    assert.ok(!bottoms.includes(176), 'slot 3 belongs to the music player');
});

test('phone width: the box opens to the left of the button and never wider than the screen', () => {
    const picker = fs.readFileSync(new URL('../src/components/FloatRoomPicker.tsx', import.meta.url), 'utf8');
    assert.match(picker, /right:\s*calc\(100% \+ 8px\)/, 'beside the button, on its left');
    assert.match(picker, /max-width:\s*calc\(100vw - /, 'cannot run off the screen');
    assert.match(picker, /@media \(max-width: 768px\)/);
    for (const file of ['FloatStack.tsx', 'FloatRoomPicker.tsx']) assert.ok(fs.readFileSync(new URL(`../src/components/${file}`, import.meta.url), 'utf8').split('\n').length <= 300, file);
});
