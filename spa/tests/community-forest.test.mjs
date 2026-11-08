// Forum contract 1115 §D: 숲 also needs likes received from others and a number of different weekly-top posts that each
// got enough likes. The grade guide says so under 숲 (short line, details folded), and /me shows the progress once the
// member is 나무 or higher. Every number comes from the server; the site holds none. No live server is touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { createLoader, fakeBrowser, restoreBrowser } from './helpers/load-ts.mjs';
import { GRADE_TABLE, gradeGuide, pickGrades } from '../src/lib/communityGrades.mjs';
import { forestGuideDetail, forestGuideLine, forestProgress, pickForest } from '../src/lib/communityForest.mjs';
import { pickConfig } from '../src/lib/communityFeedModel.mjs';

const require = createRequire(import.meta.url);

function render(file, props, path = '/community') {
    fakeBrowser();
    try {
        const Component = createLoader()(file).default;
        const { MemoryRouter } = require('react-router-dom');
        return renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(Component, props)));
    } finally { restoreBrowser(); }
}
const text = (html) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');

const FOREST = { likes: 120, likesMin: 300, tops: 2, topsMin: 5, topLikesMin: 5 };
const profile = (extra = {}) => ({
    userId: 'leader01', role: 'community', nickname: '나무늘보', avatarKey: '', needsNickname: false, canWriteNews: false, isOperator: false, score: 6200,
    activity: { posts: 4, comments: 9, visits: 21, likes: 120 }, grade: { key: 'tree', label: '나무', min: 5000, nextAt: 15000, nextLabel: '숲' },
    linked: false, rewards: [], level: 'member', levelUp: { post: false, comment: false }, forest: FOREST, ...extra,
});
const card = (member) => render('../../src/components/account/ProfileCard.tsx', { profile: member, detail: null, onChanged() {}, onDetail() {} }, '/me');
const serverGrades = (extra) => [
    { key: 'sprout', label: '새싹', min: 0 }, { key: 'leaf', label: '잎새', min: 300 }, { key: 'fruit', label: '열매', min: 1500 },
    { key: 'tree', label: '나무', min: 5000 }, { key: 'forest', label: '숲', min: 15000, ...(extra ? { extra } : {}) },
];
const forestRow = (grades) => grades.find((grade) => grade.key === 'forest');

test('the forest numbers of a profile: whole numbers, positive minimums; anything else is no data', () => {
    assert.deepEqual(pickForest(FOREST), FOREST);
    assert.deepEqual(pickForest({ likes: '120', likesMin: '300', tops: 2.9, topsMin: 5, topLikesMin: '7' }), { likes: 120, likesMin: 300, tops: 2, topsMin: 5, topLikesMin: 7 });
    assert.deepEqual(pickForest({ likes: -4, likesMin: 300, tops: 'x', topsMin: 5, topLikesMin: 5 }), { likes: 0, likesMin: 300, tops: 0, topsMin: 5, topLikesMin: 5 });
    assert.equal(pickForest({ likes: 1, likesMin: 300, tops: 1, topsMin: 5 }).topLikesMin, 0, 'a server that does not say how many likes a post needs');
    for (const bad of [null, undefined, 'x', {}, { likes: 1, tops: 1 }, { likes: 1, likesMin: 0, tops: 1, topsMin: 5 }, { likes: 1, likesMin: 300, tops: 1, topsMin: -1 }]) {
        assert.equal(pickForest(bad), null, JSON.stringify(bad));
    }
});

test('the guide line under 숲 and its folded explanation come from the server minimums only', () => {
    assert.equal(forestGuideLine(15000, { likesMin: 300, topsMin: 5, topLikesMin: 5 }), '15,000점 + 받은 좋아요 300 + 인기글 5편');
    assert.equal(forestGuideLine(20000, { likesMin: 500, topsMin: 8, topLikesMin: 12 }), '20,000점 + 받은 좋아요 500 + 인기글 8편');
    assert.equal(forestGuideDetail({ likesMin: 300, topsMin: 5, topLikesMin: 5 }), '주간 인기글 중 좋아요를 5개 이상 받은 서로 다른 글 5편이 필요해요.');
    assert.equal(forestGuideDetail({ likesMin: 500, topsMin: 8, topLikesMin: 12 }), '주간 인기글 중 좋아요를 12개 이상 받은 서로 다른 글 8편이 필요해요.');
    assert.equal(forestGuideDetail({ likesMin: 300, topsMin: 5 }), '', 'no like count from the server, no sentence about it');
    for (const bad of [null, { likesMin: 0, topsMin: 5 }, { likesMin: 300 }]) {
        assert.equal(forestGuideLine(15000, bad), '');
        assert.equal(forestGuideDetail(bad), '');
    }
});

test('grade table: the built-in one promises nothing extra; a server table says it only when it sent `extra` for 숲', () => {
    assert.deepEqual(GRADE_TABLE.map((grade) => [grade.condition, grade.conditionDetail]), [['', ''], ['', ''], ['', ''], ['', ''], ['', '']], 'no numbers of our own');
    const withExtra = forestRow(gradeGuide({ grades: serverGrades({ likesMin: 400, topsMin: 6, topLikesMin: 9 }) }));
    assert.equal(withExtra.condition, '15,000점 + 받은 좋아요 400 + 인기글 6편');
    assert.equal(withExtra.conditionDetail, '주간 인기글 중 좋아요를 9개 이상 받은 서로 다른 글 6편이 필요해요.');
    const without = forestRow(gradeGuide({ grades: serverGrades() }));
    assert.deepEqual([without.condition, without.conditionDetail], ['', ''], 'an older server enforces nothing extra, so nothing extra is promised');
    assert.equal(forestRow(gradeGuide({ grades: serverGrades({ likesMin: 'x', topsMin: 6 }) })).condition, '');
    const tree = gradeGuide({ grades: serverGrades({ likesMin: 400, topsMin: 6, topLikesMin: 9 }) }).find((grade) => grade.key === 'tree');
    assert.deepEqual([tree.condition, tree.conditionDetail], ['', ''], 'only 숲 carries it');
    assert.deepEqual(forestRow(pickGrades(serverGrades({ likesMin: 400, topsMin: 6, topLikesMin: 9 }))).extra, { likesMin: 400, topsMin: 6, topLikesMin: 9 });
});

test('the feed answer keeps the forest minimums of the grade table', () => {
    const config = pickConfig({ boards: { boards: [{ id: 'free', label: '자유' }], grades: [
        { key: 'sprout', label: '새싹', min: 0 }, { key: 'forest', label: '숲', min: 15000, extra: { likesMin: 300, topsMin: 5, topLikesMin: 5 } },
    ] } });
    assert.deepEqual(forestRow(config.grades).extra, { likesMin: 300, topsMin: 5, topLikesMin: 5 });
});

test('the side column: the short line under 숲, the details folded behind [설명 보기]', () => {
    const grades = gradeGuide({ grades: serverGrades({ likesMin: 300, topsMin: 5, topLikesMin: 5 }) });
    const html = render('../../src/components/community/CommunitySidebar.tsx', {
        profile: profile(), boards: createLoader()('../../src/lib/communityModel.mjs').boardList(null), boardId: 'all', counts: {}, grades,
    });
    const guide = html.slice(html.indexOf('cm-guide'));
    assert.match(text(guide), /15,000점 \+ 받은 좋아요 300 \+ 인기글 5편/);
    assert.ok(guide.indexOf('lp-g-forest') < guide.indexOf('인기글 5편'), 'the line sits under 숲, not above it');
    assert.match(guide, /<details class="cm-guide-more"><summary>설명 보기<\/summary><p>주간 인기글 중 좋아요를 5개 이상 받은 서로 다른 글 5편이 필요해요\.<\/p><\/details>/);
    assert.ok(!/<details[^>]*\sopen/.test(guide), 'folded until opened');
    assert.equal((guide.match(/<details/g) || []).length, 1, 'only under 숲');
    const bare = render('../../src/components/community/CommunitySidebar.tsx', {
        profile: profile(), boards: createLoader()('../../src/lib/communityModel.mjs').boardList(null), boardId: 'all', counts: {},
    });
    assert.ok(!/인기글 \d+편|설명 보기/.test(text(bare)), 'no server table, no numbers promised');
});

test('progress text: both numbers with their minimums, 인기글 counted in 편', () => {
    const progress = forestProgress(profile());
    assert.equal(progress.text, '받은 좋아요 120/300 · 인기글 2/5편');
    assert.deepEqual([progress.likesDone, progress.topsDone], [false, false]);
    const done = forestProgress(profile({ forest: { likes: 340, likesMin: 300, tops: 5, topsMin: 5, topLikesMin: 5 } }));
    assert.equal(done.text, '받은 좋아요 340/300 · 인기글 5/5편');
    assert.deepEqual([done.likesDone, done.topsDone], [true, true]);
    assert.equal(forestProgress(profile({ forest: { likes: 1, likesMin: 500, tops: 3, topsMin: 8, topLikesMin: 12 } })).text, '받은 좋아요 1/500 · 인기글 3/8편', 'the minimums are the server\'s');
});

test('/me shows the progress only from 5,000 points on, never for the owner, never without server numbers', () => {
    assert.equal(forestProgress(profile({ score: 4999 })), null);
    assert.equal(forestProgress(profile({ score: 5000 })).text, '받은 좋아요 120/300 · 인기글 2/5편');
    assert.equal(forestProgress(profile({ role: 'owner' })), null, 'the owner stays 숲');
    assert.equal(forestProgress(profile({ forest: null })), null);
    assert.equal(forestProgress(profile({ forest: undefined })), null);

    assert.match(text(card(profile())), /받은 좋아요 120\/300 · 인기글 2\/5편/);
    assert.match(text(card(profile())), /숲 조건/);
    const leaf = { score: 800, grade: { key: 'leaf', label: '잎새', min: 300, nextAt: 1500, nextLabel: '열매' } };
    assert.doesNotMatch(text(card(profile(leaf))), /인기글 \d+\/\d+편/);
    assert.doesNotMatch(text(card(profile({ forest: null }))), /인기글 \d+\/\d+편/);
    assert.doesNotMatch(text(card(profile({ role: 'owner' }))), /인기글 \d+\/\d+편/);
});

test('the stored login keeps the forest numbers and drops a damaged block', () => {
    const { normalizeProfile } = createLoader()('../../src/lib/communitySession.ts');
    assert.deepEqual(normalizeProfile({ userId: 'a', forest: FOREST }).forest, FOREST);
    assert.equal(normalizeProfile({ userId: 'a' }).forest, null);
    assert.equal(normalizeProfile({ userId: 'a', forest: { likes: 'x' } }).forest, null);
    assert.equal(normalizeProfile({ userId: 'a', forest: '<b>' }).forest, null);
});
