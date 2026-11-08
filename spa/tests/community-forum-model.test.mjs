// Forum stage on the board model (contract 1114): promo platform in the address and saved-list key, platform-aware
// draft checks, what an associate may write, and who sees [신고].
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    boardList, canWriteBoard, writableBoards, validatePostDraft, platformLabel, communityPath, parseCommunityQuery, showWriteButton,
} from '../src/lib/communityModel.mjs';
import { feedViewKey } from '../src/lib/communityFeedModel.mjs';
import { reportAction } from '../src/lib/communityReport.mjs';

const boards = boardList(null);
const associate = (levelUp = { post: false, comment: false }) => ({ role: 'community', level: 'associate', levelUp, canWriteNews: false });
const member = { role: 'community', level: 'member', canWriteNews: false };

test('the promo address carries the platform; naver is the default and is left out', () => {
    assert.equal(communityPath({ board: 'promo', platform: 'google' }), '/community?board=promo&platform=google');
    assert.equal(communityPath({ board: 'promo', platform: 'naver' }), '/community?board=promo');
    assert.equal(communityPath({ board: 'promo' }), '/community?board=promo');
    assert.equal(communityPath({ board: 'promo', platform: 'google', sort: 'popular', page: 2 }), '/community?board=promo&platform=google&sort=popular&page=2');
    assert.equal(communityPath({ board: 'promo', platform: 'google', write: true }), '/community?board=promo&platform=google&write=1');
    assert.equal(communityPath({ board: 'free', platform: 'google' }), '/community?board=free', 'only the promo board has a platform');
    assert.equal(communityPath({ platform: 'google' }), '/community');
});

test('the platform is read from the address with the default everywhere else', () => {
    assert.equal(parseCommunityQuery('?board=promo&platform=google').platform, 'google');
    assert.equal(parseCommunityQuery('?board=promo&platform=naver').platform, 'naver');
    assert.equal(parseCommunityQuery('?board=promo').platform, 'naver');
    assert.equal(parseCommunityQuery('?board=promo&platform=hax').platform, 'naver');
    assert.equal(parseCommunityQuery('?board=free&platform=google').platform, 'naver', 'ignored outside the promo board');
    assert.equal(parseCommunityQuery('').platform, 'naver');
});

test('a saved list is told apart by platform on the promo board only', () => {
    assert.equal(feedViewKey({ board: 'promo', sort: 'latest', page: 1, platform: 'google' }), 'promo:latest:1:google');
    assert.equal(feedViewKey({ board: 'promo', sort: 'latest', page: 1, platform: 'naver' }), 'promo:latest:1:naver');
    assert.equal(feedViewKey({ board: 'promo', sort: 'latest', page: 1 }), 'promo:latest:1:naver');
    assert.equal(feedViewKey({ board: 'free', sort: 'popular', page: 2, platform: 'google' }), 'free:popular:2');
    assert.equal(feedViewKey({ board: 'all', sort: 'latest', page: 1 }), 'all:latest:1');
});

test('a promo draft is checked against the platform the writer chose', () => {
    const draft = (extra) => validatePostDraft({ boards, board: 'promo', title: 't', body: 's', ...extra });
    assert.equal(draft({ url: 'https://blog.naver.com/a/1', platform: 'naver' }), '');
    assert.equal(draft({ url: 'https://abc.blogspot.com/2026/1/x.html', platform: 'google' }), '');
    assert.match(draft({ url: 'https://abc.blogspot.com/1', platform: 'naver' }), /blog\.naver\.com/);
    assert.match(draft({ url: 'https://blog.naver.com/a/1', platform: 'google' }), /네이버/);
    assert.match(draft({ url: 'http://blog.naver.com/a/1', platform: 'naver' }), /blog\.naver\.com/);
    assert.match(draft({ url: '', platform: 'naver' }), /주소/);
    assert.equal(draft({ url: 'https://blog.naver.com/a/1' }), '', 'a draft without a platform is checked as before');
});

test('platformLabel knows google', () => {
    assert.equal(platformLabel('google'), '구글');
    assert.equal(platformLabel('naver'), '네이버');
});

test('an associate may write on 자유게시판 only; members and the owner write wherever the board allows', () => {
    const byId = (id) => boards.find((board) => board.id === id);
    assert.equal(canWriteBoard(byId('free'), associate()), true);
    for (const id of ['request', 'inquiry', 'promo', 'news', 'qna']) assert.equal(canWriteBoard(byId(id), associate()), false, id);
    assert.deepEqual(writableBoards(boards, associate()).map((board) => board.id), ['free']);
    assert.deepEqual(writableBoards(boards, member).map((board) => board.id), ['qna', 'request', 'inquiry', 'free', 'promo']);
    assert.equal(canWriteBoard(byId('promo'), { role: 'owner', level: 'associate', canWriteNews: true }), true, 'the owner is never an associate');
    assert.equal(canWriteBoard(byId('promo'), { role: 'community' }), true, 'no level at all = a grandfathered member');
});

test('the write button stays for the boards a person can open', () => {
    assert.equal(showWriteButton('free', boards), true);
    assert.equal(showWriteButton('notice', boards), false);
});

test('[신고]: not on my own posts, notices or unsent rows; logged-out readers are sent to login', () => {
    const post = { id: 'p_1', mine: false, notice: false };
    assert.equal(reportAction(post, member), 'report');
    assert.equal(reportAction(post, associate()), 'report', 'an associate may report');
    assert.equal(reportAction({ ...post, mine: true }, member), 'hidden');
    assert.equal(reportAction({ ...post, notice: true }, member), 'hidden');
    assert.equal(reportAction({ ...post, delivery: 'sending' }, member), 'hidden');
    assert.equal(reportAction({ ...post, delivery: 'failed' }, member), 'hidden');
    assert.equal(reportAction(post, null), 'login');
    assert.equal(reportAction({ ...post, mine: true }, null), 'hidden', 'my own post is never reported, logged in or not');
    assert.equal(reportAction(null, member), 'hidden');
});

import { gradeProgress } from '../src/lib/communityModel.mjs';

test('an associate has no score bar: the text points at the application', () => {
    const progress = gradeProgress({ ...associate(), score: 4000, grade: { key: 'associate', label: '준회원', min: 0, nextAt: null, nextLabel: null } });
    assert.deepEqual([progress.percent, progress.nextLabel], [0, '새싹']);
    assert.match(progress.text, /등업/);
    assert.match(gradeProgress({ role: 'community', level: 'member', score: 0, grade: { key: 'sprout', label: '새싹', min: 0, nextAt: 300, nextLabel: '잎새' } }).text, /잎새까지/);
});
