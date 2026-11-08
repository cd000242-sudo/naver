// Grades with 숲 and the rewards (2026-11-08): the five-step table, server grades first, the owner is always 숲,
// my reward state on /me, the owner's reward desk, and the "nickname taken" sentence. No live server is touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { createLoader, fakeBrowser, restoreBrowser } from './helpers/load-ts.mjs';
import { GRADE_TABLE, SCORE_RULES, gradeGuide, normalizeRewards, rewardRows, pickGrades, pickScoreRules, scoreRulesText, rewardText } from '../src/lib/communityGrades.mjs';
import { GRADE_GUIDE, gradeProgress } from '../src/lib/communityModel.mjs';
import { pickConfig } from '../src/lib/communityFeedModel.mjs';
import { describeNicknameFailure, describeRewardFailure, isRewardsView, REWARDS_PATH } from '../src/lib/accountModel.mjs';
import { COMMUNITY_ACTIONS, COMMUNITY_CODES, REWARD_DECISION } from '../src/lib/communityContract.mjs';

const require = createRequire(import.meta.url);

function render(file, props) {
    fakeBrowser();
    try {
        const Component = createLoader()(file).default;
        const { MemoryRouter } = require('react-router-dom');
        return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/community'] }, createElement(Component, props)));
    } finally { restoreBrowser(); }
}
const text = (html) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');

const profile = (extra = {}) => ({
    userId: 'leader01', role: 'community', nickname: '새싹이', needsNickname: false, canWriteNews: false, isOperator: false, score: 150,
    activity: { posts: 4, comments: 9, visits: 21 }, grade: { key: 'leaf', label: '잎새', min: 100, nextAt: 500, nextLabel: '열매' }, linked: false, rewards: [], ...extra,
});

test('the grade table: 새싹 0 · 잎새 300 · 열매 1,500 · 나무 5,000 · 숲 15,000, with one reward line each (no coupon words)', () => {
    assert.deepEqual(GRADE_TABLE.map((grade) => [grade.key, grade.label, grade.range, grade.reward]), [
        ['sprout', '새싹', '0~299점', ''], ['leaf', '잎새', '300~1,499점', '올인원 3일'], ['fruit', '열매', '1,500~4,999점', '올인원 7일'],
        ['tree', '나무', '5,000~14,999점', '올인원 30일(확인 후 지급)'], ['forest', '숲', '15,000점~', '올인원 1년(확인 후 지급)'],
    ]);
    assert.equal(GRADE_GUIDE, GRADE_TABLE, 'one table for the whole site');
    assert.equal(SCORE_RULES, '글 10점 · 댓글 2점 · 들르기 1점 · 내 글 좋아요 1점 · 하루 최대 50점');
    assert.ok(!/쿠폰|할인/.test(JSON.stringify(GRADE_TABLE) + SCORE_RULES));
});

test('server grades come first (ranges follow their `min`, rewards their `reward`); no usable server grades means the table above', () => {
    assert.equal(gradeGuide(null), GRADE_TABLE);
    assert.equal(gradeGuide({ grades: [] }), GRADE_TABLE);
    assert.equal(gradeGuide({ grades: [{ key: 'sprout', label: '새싹', min: 0 }] }), GRADE_TABLE, 'one entry is not a scale');
    const server = gradeGuide({ grades: [
        { key: 'leaf', label: '잎', min: 200, reward: { days: 3, mode: 'auto' } }, { key: 'sprout', label: '새싹', min: 0, reward: null },
        { key: 'forest', label: '숲', min: 9000, reward: { days: 365, mode: 'approval' } }, { key: 'tree', label: '나무', min: 3000, reward: { days: 30, mode: 'approval' } },
        { key: '<b>', label: 'x', min: 'nope' },
    ] });
    assert.deepEqual(server.map((grade) => [grade.key, grade.label, grade.range, grade.reward]), [
        ['sprout', '새싹', '0~199점', ''], ['leaf', '잎', '200~2,999점', '올인원 3일'], ['tree', '나무', '3,000~8,999점', '올인원 30일(확인 후 지급)'], ['forest', '숲', '9,000점~', '올인원 1년(확인 후 지급)'],
    ]);
    assert.equal(rewardText({ days: 7, mode: 'auto' }), '올인원 7일');
    assert.equal(rewardText({ days: 365, mode: 'approval' }), '올인원 1년(확인 후 지급)');
    assert.equal(rewardText(null), '');
    assert.equal(rewardText({ days: 0, mode: 'auto' }), '');
    // An old server that stops at 나무 keeps its own four steps.
    const old = gradeGuide({ grades: [{ key: 'sprout', label: '새싹', min: 0 }, { key: 'leaf', label: '잎새', min: 100 }, { key: 'fruit', label: '열매', min: 500 }, { key: 'tree', label: '나무', min: 1500 }] });
    assert.deepEqual(old.map((grade) => grade.range), ['0~99점', '100~499점', '500~1,499점', '1,500점~']);
    assert.deepEqual(old.map((grade) => grade.reward), ['', '', '', ''], 'a server that sends no reward has no reward to show');
});

test('score rules are drawn from the server numbers; without them the agreed sentence', () => {
    const rules = { post: 10, comment: 2, visit: 1, likeReceived: 1, dailyCap: 50 };
    assert.deepEqual(pickScoreRules(rules), rules);
    assert.equal(scoreRulesText(rules), '글 10점 · 댓글 2점 · 들르기 1점 · 내 글 좋아요 1점 · 하루 최대 50점');
    assert.equal(scoreRulesText({ ...rules, post: 12, dailyCap: 80 }), '글 12점 · 댓글 2점 · 들르기 1점 · 내 글 좋아요 1점 · 하루 최대 80점');
    for (const bad of [null, undefined, 'x', {}, { post: 'a', comment: 2, visit: 1, likeReceived: 1, dailyCap: 50 }, { ...rules, dailyCap: -1 }]) {
        assert.equal(scoreRulesText(bad), SCORE_RULES, JSON.stringify(bad));
    }
});

test('the feed answer carries the server grades into the screen config (and none when it does not)', () => {
    const grades = [{ key: 'sprout', label: '새싹', min: 0, reward: null }, { key: 'leaf', label: '잎새', min: 100, reward: { days: 3, mode: 'auto' } }];
    const config = pickConfig({ boards: [{ id: 'free' }], reportReasons: [], grades, scoreRules: { post: 10, comment: 2, visit: 1, likeReceived: 1, dailyCap: 50 } });
    assert.deepEqual(config.grades, grades);
    assert.equal(config.scoreRules.dailyCap, 50);
    assert.deepEqual(pickConfig({ boards: [{ id: 'free' }] }).grades, []);
    assert.equal(pickConfig({ boards: [{ id: 'free' }] }).scoreRules, null);
    assert.deepEqual(pickGrades('x'), []);
});

test('the owner is always 숲: no bar and no next grade, whatever an old server sent', () => {
    const owner = profile({ role: 'owner', score: 0, grade: { key: 'sprout', label: '새싹', min: 0, nextAt: 100, nextLabel: '잎새' } });
    const progress = gradeProgress(owner);
    assert.deepEqual([progress.percent, progress.remain, progress.nextLabel], [100, 0, null]);
    assert.equal(progress.text, '숲 · 최고 등급(관리자)');
    assert.match(gradeProgress(profile()).text, /열매까지 350점/, 'members keep their bar');
});

test('the stored login of an owner is 숲 even when the server said 새싹', () => {
    const session = createLoader()('../../src/lib/communitySession.ts');
    const owner = session.normalizeProfile({ userId: 'boss', role: 'owner', score: 0, grade: { key: 'sprout', label: '새싹', min: 0, nextAt: 100, nextLabel: '잎새' } });
    assert.deepEqual([owner.grade.key, owner.grade.label, owner.grade.nextAt, owner.grade.nextLabel], ['forest', '숲', null, null]);
    const member = session.normalizeProfile({ userId: 'm', role: 'community', grade: { key: 'leaf', label: '잎새', min: 100, nextAt: 500, nextLabel: '열매' } });
    assert.equal(member.grade.key, 'leaf');
});

test('rewards from the profile: only known statuses and real days survive; a missing field is simply none', () => {
    assert.deepEqual(normalizeRewards(undefined), []);
    assert.deepEqual(normalizeRewards('x'), []);
    const rewards = normalizeRewards([
        { tier: 'leaf', label: '잎새', days: 3, mode: 'auto', status: 'granted', createdAt: '2026-11-01T00:00:00Z', decidedAt: '2026-11-01T00:00:00Z' },
        { tier: 'tree', days: 30, mode: 'approval', status: 'pending' }, { tier: 'fruit', days: 7, status: 'approved' },
        { tier: 'forest', days: 365, status: 'rejected' }, { tier: 'leaf', days: 3, status: 'whatever' }, { tier: '', days: 3, status: 'granted' }, { tier: 'leaf', days: -1, status: 'granted' }, null,
    ]);
    assert.deepEqual(rewards.map((entry) => [entry.tier, entry.days, entry.status]), [['leaf', 3, 'granted'], ['tree', 30, 'pending'], ['fruit', 7, 'approved'], ['forest', 365, 'rejected']]);
    assert.deepEqual(rewardRows(rewards).map((row) => [row.tierLabel, row.text, row.statusLabel]), [
        ['잎새', '올인원 3일', '지급 완료'], ['나무', '올인원 30일', '확인 중'], ['열매', '올인원 7일', '승인됨 · 곧 지급'], ['숲', '올인원 1년', '지급되지 않았어요'],
    ]);
});

test('/me: a member sees the reward state; the owner sees 숲 and no reward box; no rewards field hides the box', () => {
    const detail = { phoneVerified: true, phoneMasked: '010-****-5678', createdAt: '2026-11-01T00:00:00Z' };
    const props = (p) => ({ profile: p, detail: { ...p, ...detail }, onChanged() {}, onDetail() {} });
    const withRewards = render('../../src/components/account/ProfileCard.tsx', props(profile({ rewards: [{ tier: 'leaf', days: 3, status: 'pending' }, { tier: 'fruit', days: 7, status: 'granted' }] })));
    assert.match(text(withRewards), /내 보상/);
    assert.match(text(withRewards), /잎새.*올인원 3일.*확인 중/);
    assert.match(text(withRewards), /열매.*올인원 7일.*지급 완료/);
    assert.ok(!withRewards.includes('쿠폰'));
    assert.ok(!/내 보상/.test(text(render('../../src/components/account/ProfileCard.tsx', props(profile({ rewards: [] }))))), 'no rewards, no box');
    const owner = render('../../src/components/account/ProfileCard.tsx', props(profile({ role: 'owner', score: 0, rewards: [{ tier: 'leaf', days: 3, status: 'pending' }], grade: { key: 'forest', label: '숲', min: 15000, nextAt: null, nextLabel: null } })));
    assert.match(text(owner), /숲 · 최고 등급\(관리자\)/);
    assert.ok(!/progressbar/.test(owner), 'no progress bar for the owner');
    assert.ok(!/잎새까지/.test(text(owner)));
    assert.ok(!/내 보상/.test(text(owner)), 'the reward box is hidden for the owner');
});

test('sidebar guide: five grades, each reward on its own line; the score rules line; server grades are used when given', () => {
    const props = (extra = {}) => ({ profile: profile(), boards: [], boardId: 'all', counts: {}, ...extra });
    const html = render('../../src/components/community/CommunitySidebar.tsx', props());
    for (const range of ['0~299점', '300~1,499점', '1,500~4,999점', '5,000~14,999점', '15,000점~']) assert.match(text(html), new RegExp(range));
    for (const reward of ['올인원 3일', '올인원 7일', '올인원 30일\\(확인 후 지급\\)', '올인원 1년\\(확인 후 지급\\)']) assert.match(text(html), new RegExp(reward));
    assert.match(text(html), /글 10점 · 댓글 2점 · 들르기 1점 · 내 글 좋아요 1점 · 하루 최대 50점/);
    const owner = render('../../src/components/community/CommunitySidebar.tsx', props({ profile: profile({ role: 'owner', score: 0 }) }));
    assert.match(owner, /lp-g-forest[^>]*>숲</);
    assert.match(text(owner), /숲 · 최고 등급\(관리자\)/);
    const server = render('../../src/components/community/CommunitySidebar.tsx', props({
        grades: gradeGuide({ grades: [{ key: 'sprout', label: '새싹', min: 0, reward: null }, { key: 'leaf', label: '잎새', min: 100, reward: { days: 3, mode: 'auto' } }] }),
        scoreRules: scoreRulesText({ post: 10, comment: 2, visit: 1, likeReceived: 1, dailyCap: 70 }),
    }));
    assert.match(text(server), /100점~/);
    assert.match(text(server), /하루 최대 70점/);
    assert.ok(!/15,000점~/.test(text(server)));
});

test('author badge: an operator post shows 숲 (and the staff mark), a member shows the grade as before', () => {
    const badge = (props) => render('../../src/components/community/Badges.tsx', props);
    fakeBrowser();
    try {
        const { GradeBadge } = createLoader()('../../src/components/community/Badges.tsx');
        const html = renderToStaticMarkup(createElement(GradeBadge, { grade: null, isOperator: true }));
        assert.match(html, /lp-g-forest[^>]*>숲</);
        assert.match(html, /lp-g-staff[^>]*>운영진</);
        assert.match(renderToStaticMarkup(createElement(GradeBadge, { grade: { key: 'forest', label: '숲' }, isOperator: false })), /lp-g-forest[^>]*>숲</);
        assert.match(renderToStaticMarkup(createElement(GradeBadge, { grade: { key: 'leaf', label: '잎새' }, isOperator: false })), /lp-g-leaf[^>]*>잎새</);
    } finally { restoreBrowser(); }
    void badge;
});

test('reward desk API: the two actions are named in one place and sent with the token', async () => {
    assert.equal(COMMUNITY_ACTIONS.adminRewards, 'community-admin-rewards');
    assert.equal(COMMUNITY_ACTIONS.adminRewardDecide, 'community-admin-reward-decide');
    assert.deepEqual({ ...REWARD_DECISION }, { approve: 'approve', reject: 'reject' });
    assert.equal(REWARDS_PATH, '/community?rewards=1');
    assert.equal(isRewardsView('?rewards=1'), true);
    assert.equal(isRewardsView('?reports=1'), false);
    const browser = fakeBrowser({ 'community-admin-rewards': { ok: true, rewards: [] }, 'community-admin-reward-decide': { ok: true } });
    try {
        const load = createLoader();
        const session = load('../../src/lib/communitySession.ts');
        session.saveCommunitySession(session.toCommunitySession({ userId: 'boss', role: 'owner', nickname: '관리자', communityToken: 'ct_boss' }));
        const api = load('../../src/lib/communityModeration.ts').moderationApi;
        await api.rewards('pending');
        await api.decideReward('rw_1', 'approve');
        assert.deepEqual(browser.calls.map((call) => [call.action, call.communityToken, call.status, call.rewardId, call.decision]), [
            ['community-admin-rewards', 'ct_boss', 'pending', undefined, undefined], ['community-admin-reward-decide', 'ct_boss', undefined, 'rw_1', 'approve'],
        ]);
    } finally { restoreBrowser(); }
});

test('reward desk screen: pending requests with approve / reject buttons; an empty or missing list says so quietly', () => {
    const { normalizeRewardRequests } = createLoader()('../../src/lib/communityModeration.ts');
    const requests = normalizeRewardRequests([
        { rewardId: 'rw_1', userId: 'leader01', nickname: '새싹이', tier: 'tree', tierLabel: '나무', days: 30, mode: 'approval', status: 'pending', createdAt: '2026-11-08T01:00:00+09:00', decidedAt: null, licenseCode: 'LIC-1234' }, { nope: true }, 'x',
    ]);
    assert.equal(requests.length, 1);
    assert.deepEqual(normalizeRewardRequests(undefined), []);
    const props = { requests, status: 'pending', loading: false, error: '', busyId: '', onStatus() {}, onDecide() {}, onRetry() {}, now: Date.parse('2026-11-08T12:00:00+09:00') };
    const html = render('../../src/components/community/RewardList.tsx', props);
    assert.match(text(html), /보상 승인/);
    assert.match(text(html), /새싹이/);
    assert.match(text(html), /나무.*올인원 30일/);
    assert.match(html, />승인</);
    assert.match(html, />거절</);
    assert.match(text(render('../../src/components/community/RewardList.tsx', { ...props, requests: [] })), /승인할 보상이 없어요/);
    const hostile = render('../../src/components/community/RewardList.tsx', { ...props, requests: normalizeRewardRequests([{ rewardId: 'r', nickname: '<img src=x onerror=alert(1)>', tier: 'leaf', days: 3, status: 'pending' }]) });
    assert.ok(!/<img\b/.test(hostile));
});

test('reward desk failures get one Korean sentence each', () => {
    assert.equal(describeRewardFailure({ code: 'ALREADY_DECIDED', message: 'x' }), '이미 처리한 보상이에요.');
    assert.equal(describeRewardFailure({ code: 'REWARD_NOT_FOUND' }), '보상 신청을 찾을 수 없어요.');
    assert.equal(describeRewardFailure({ code: 'GRANT_FAILED' }), '올인원 기간을 늘리지 못했어요. 잠시 뒤 다시 해 주세요.');
    assert.equal(describeRewardFailure({ code: 'INVALID_DECISION' }), '처리 방법을 알 수 없어요.');
    assert.equal(describeRewardFailure({ code: 'Unauthorized', message: 'Unauthorized' }), '운영자 권한이 확인되지 않아요.');
    assert.equal(describeRewardFailure({ code: 'X', message: '서버 문장' }), '서버 문장');
});

test('"nickname taken" has one sentence on signup and on the nickname form', async () => {
    assert.equal(COMMUNITY_CODES.NICKNAME_TAKEN, 'NICKNAME_TAKEN');
    assert.equal(describeNicknameFailure({ code: 'NICKNAME_TAKEN', message: 'This nickname is already used' }), '이미 쓰는 닉네임이에요.');
    assert.equal(describeNicknameFailure({ code: 'OTHER', message: '서버 문장' }), '서버 문장');
    assert.equal(describeNicknameFailure({ code: 'OTHER' }), '닉네임을 저장하지 못했어요. 잠시 뒤 다시 해 주세요.');
    const taken = { ok: false, code: 'NICKNAME_TAKEN', message: 'taken' };
    const browser = fakeBrowser({ 'community-signup': taken, 'community-set-nickname': taken });
    try {
        const load = createLoader();
        const auth = load('../../src/lib/communityAuth.ts');
        const signup = await auth.signupCommunity({ userId: 'abc', password: 'secret1', nickname: '새싹이', phone: '01012345678', code: '123456' });
        assert.deepEqual([signup.ok, signup.code, signup.message], [false, 'NICKNAME_TAKEN', '이미 쓰는 닉네임이에요.']);
        const session = load('../../src/lib/communitySession.ts');
        session.saveCommunitySession(session.toCommunitySession({ userId: 'abc', role: 'community', nickname: 'a', communityToken: 'ct_a' }));
        const change = await auth.setCommunityNickname('새싹이');
        assert.deepEqual([change.ok, change.message], [false, '이미 쓰는 닉네임이에요.']);
        assert.equal(browser.calls.length, 2);
    } finally { restoreBrowser(); }
});
