// 2026-11-25: 가입인사 (greeting), 등업신청 (levelup) and the locked 시크릿 클래스 (secret) boards: the ten-board order,
// who may write where, the lock screen (members and guests), the 등업신청 head and the lifetime line of the write form.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { createLoader, fakeBrowser, restoreBrowser } from './helpers/load-ts.mjs';

const require = createRequire(import.meta.url);
const load = () => createLoader();
const model = () => load()('../../src/lib/communityModel.mjs');
const level = () => load()('../../src/lib/communityLevel.mjs');
const secret = () => load()('../../src/lib/communitySecret.mjs');

function render(file, props, path = '/community') {
    fakeBrowser();
    try {
        const Component = createLoader()(file).default;
        const { MemoryRouter } = require('react-router-dom');
        return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(Component, props)));
    } finally { restoreBrowser(); }
}
const text = (html) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');

const profile = (extra = {}) => ({
    userId: 'u1', role: 'community', nickname: '이웃', avatarKey: '', needsNickname: false, canWriteNews: false, isOperator: false, score: 42,
    activity: { posts: 0, comments: 0, visits: 0, likes: null }, grade: { key: 'sprout', label: '새싹', min: 0, nextAt: 300, nextLabel: '잎새' },
    linked: false, rewards: [], level: 'member', levelUp: { post: false, comment: false }, secretClass: { allowed: false, lifetime: false }, ...extra,
});
const associate = (levelUp = { post: false, comment: false }) => profile({ level: 'associate', levelUp, grade: { key: 'associate', label: '준회원', min: 0, nextAt: null, nextLabel: null } });
const ORDER = ['notice', 'news', 'greeting', 'levelup', 'qna', 'request', 'inquiry', 'free', 'promo', 'secret'];

test('ten boards in the agreed order with their names; only 시크릿 클래스 is locked', () => {
    const { BOARD_ORDER, boardList } = model();
    assert.deepEqual([...BOARD_ORDER], ORDER);
    const boards = boardList(null);
    assert.deepEqual(boards.map((b) => b.label), ['공지사항', '최근 소식', '가입인사', '등업신청', '질문하기', '요청사항', '버그 및 오류 신고', '자유게시판', '내 글 홍보', '시크릿 클래스']);
    assert.deepEqual(boards.filter((b) => b.locked).map((b) => b.id), ['secret']);
});

test('who may write where', () => {
    const { boardList, writableBoards, showWriteButton } = model();
    const boards = boardList(null);
    assert.deepEqual(writableBoards(boards, profile()).map((b) => b.id), ['greeting', 'qna', 'request', 'inquiry', 'free', 'promo']);
    assert.deepEqual(writableBoards(boards, profile({ secretClass: { allowed: true, lifetime: false } })).map((b) => b.id),
        ['greeting', 'qna', 'request', 'inquiry', 'free', 'promo', 'secret']);
    assert.deepEqual(writableBoards(boards, associate()).map((b) => b.id), ['greeting', 'free']);
    assert.equal(showWriteButton('levelup', boards), false, '등업신청 has no 글쓰기');
    const { associateWriteState, levelUpSteps } = level();
    assert.equal(associateWriteState(associate(), 'greeting').open, true);
    assert.equal(associateWriteState(associate(), 'secret').open, false);
    assert.equal(levelUpSteps(associate())[0].label, '가입인사 게시판에 인사 1개');
});

test('secret access comes from the profile; a missing block means no access', () => {
    const { secretAccess, normalizeSecretClass } = secret();
    assert.deepEqual(secretAccess(null), { allowed: false, lifetime: false });
    assert.deepEqual(secretAccess(profile()), { allowed: false, lifetime: false });
    assert.deepEqual(secretAccess(profile({ secretClass: { allowed: true, lifetime: true } })), { allowed: true, lifetime: true });
    assert.deepEqual(normalizeSecretClass({ allowed: 'yes', lifetime: true }), { allowed: false, lifetime: false });
    const { normalizeProfile } = load()('../../src/lib/communitySession.ts');
    assert.deepEqual(normalizeProfile({ userId: 'u', secretClass: { allowed: true, lifetime: false } }).secretClass, { allowed: true, lifetime: false });
});

test('the lock screen: the two lines, the lifetime line and [가격 보기] to /pricing', () => {
    const html = render('../../src/components/community/SecretLockCard.tsx', {});
    const words = text(html);
    assert.match(words, /시크릿 클래스/);
    assert.match(words, /올인원 1년 이상 이용자 전용/);
    // 2026-11-25 owner: diagnosis + direction and keywords; 1:1 remote from a one-year 올인원; lifetime = meeting in person
    assert.match(words, /리더남이 블로그를 진단하고 방향성과 키워드를 피드백해 드립니다/);
    assert.match(words, /1대1 원격도 올인원 1년 이상부터 가능합니다/);
    assert.match(words, /영구제 이용자는 직접 만나서 오프라인으로 꼼꼼하게 봐 드립니다/);
    assert.doesNotMatch(words, /영구제 이용자는 1대1 원격/);
    assert.match(html, /<a[^>]*href="\/pricing"[^>]*>가격 보기<\/a>/);
});

test('guests: the secret board opens the lock screen, not the login', () => {
    const guest = load()('../../src/lib/communityGuest.mjs');
    assert.equal(guest.guestScreen({ board: 'secret', sort: 'latest', page: 1 }), 'secret');
    assert.equal(guest.guestBoardHref('secret'), '/community?board=secret');
    for (const board of ['greeting', 'levelup']) assert.equal(guest.guestScreen({ board, sort: 'latest', page: 1 }), 'login', board);
    const boards = model().boardList(null);
    const feed = { status: 'ok', posts: [], pinned: [], total: 0, totalPages: 0, counts: {}, config: null, weekly: [], refreshing: false, message: '', code: '' };
    const view = { board: 'secret', sort: 'latest', page: 1, platform: '', post: '', write: false };
    const html = render('../../src/components/community/GuestCommunityView.tsx', { view, feed, boards, next: '/community?board=secret', legacy: false }, '/community?board=secret');
    assert.match(text(html), /올인원 1년 이상 이용자 전용/);
    assert.match(text(html), /시크릿 클래스/);
    assert.match(text(html), /가입인사/);
    assert.match(html, /cm-lock/, 'the board menu marks the locked board');
});

test('the 등업신청 head: the checklist for an associate, one line for a member', () => {
    const head = '../../src/components/community/LevelUpBoardHead.tsx';
    const html = render(head, { profile: associate({ post: true, comment: false }) });
    assert.match(text(html), /가입인사 게시판에 인사 1개/);
    assert.match(html, /<button[^>]*>등업 신청<\/button>/);
    assert.match(text(render(head, { profile: profile() })), /이미 등업했어요/);
});

test('the side card of an associate points to 등업신청', () => {
    const boards = model().boardList(null);
    const html = render('../../src/components/community/CommunitySidebar.tsx', { profile: associate(), boards, boardId: 'all', counts: {} });
    assert.match(html, /href="\/community\?board=levelup"[^>]*>[^<]*등업 신청하러 가기/);
});

test('write form on 시크릿 클래스: the 1:1 remote line for every member, the in-person line for a lifetime member only', () => {
    const boards = model().boardList(null);
    const base = { boards, defaultBoard: 'secret', onDone() {}, onCancel() {} };
    const life = render('../../src/components/community/PostWriteForm.tsx', { ...base, profile: profile({ secretClass: { allowed: true, lifetime: true } }) });
    assert.match(text(life), /1대1 원격을 원하시면 글에 적어 주세요/);
    assert.match(text(life), /직접 만나서 보길 원하시면 글에 적어 주세요/);
    const year = render('../../src/components/community/PostWriteForm.tsx', { ...base, profile: profile({ secretClass: { allowed: true, lifetime: false } }) });
    assert.match(text(year), /1대1 원격을 원하시면 글에 적어 주세요/);
    assert.doesNotMatch(text(year), /직접 만나서/);
});
