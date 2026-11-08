// 준회원 → 새싹 등업 rules (forum contract 1114 §1): level, done flags, where an associate may write, failure words.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ASSOCIATE_GRADE, normalizeLevel, normalizeLevelUp, isAssociate, levelUpSteps, levelUpReady, associateWriteState,
    levelUpFromNeed, describeLevelUpFailure,
} from '../src/lib/communityLevel.mjs';

const associate = (levelUp = { post: false, comment: false }) => ({ role: 'community', level: 'associate', levelUp });

test('level is associate only when the server says so; everything else (old rows, old servers) is a member', () => {
    assert.equal(normalizeLevel('associate'), 'associate');
    for (const other of ['member', '', undefined, null, 'ASSOCIATE', 3]) assert.equal(normalizeLevel(other), 'member');
});

test('done flags are real booleans, false when missing', () => {
    assert.deepEqual(normalizeLevelUp({ post: true, comment: false }), { post: true, comment: false });
    assert.deepEqual(normalizeLevelUp({ post: 'yes', comment: 1 }), { post: false, comment: false });
    assert.deepEqual(normalizeLevelUp(undefined), { post: false, comment: false });
    assert.deepEqual(normalizeLevelUp(null), { post: false, comment: false });
});

test('the associate grade is 준회원 whatever the score', () => {
    assert.deepEqual(ASSOCIATE_GRADE, { key: 'associate', label: '준회원', min: 0, nextAt: null, nextLabel: null });
});

test('isAssociate: members, the owner and a missing profile are not associates', () => {
    assert.equal(isAssociate(associate()), true);
    assert.equal(isAssociate({ role: 'community', level: 'member' }), false);
    assert.equal(isAssociate({ role: 'owner', level: 'associate' }), false, 'the owner is always a member');
    assert.equal(isAssociate(null), false);
    assert.equal(isAssociate(undefined), false);
    assert.equal(isAssociate({ role: 'community' }), false, 'no level = grandfathered member');
});

test('the checklist has two short rows with their done marks', () => {
    assert.deepEqual(levelUpSteps(associate({ post: true, comment: false })), [
        { key: 'post', label: '자유게시판에 가입 인사 1개', done: true },
        { key: 'comment', label: '댓글 1개', done: false },
    ]);
    assert.equal(levelUpReady(associate({ post: true, comment: true })), true);
    assert.equal(levelUpReady(associate({ post: true, comment: false })), false);
    assert.equal(levelUpReady({ role: 'community', level: 'member' }), false, 'a member has nothing to apply for');
});

test('an associate writes only on 자유게시판, once; a member writes anywhere', () => {
    assert.deepEqual(associateWriteState({ role: 'community', level: 'member' }, 'promo'), { open: true, reason: '', message: '' });
    assert.deepEqual(associateWriteState(null, 'promo'), { open: true, reason: '', message: '' });
    assert.equal(associateWriteState(associate(), 'free').open, true);
    assert.equal(associateWriteState(associate(), 'all').open, true, 'the all-boards screen opens the form on 자유게시판');
    for (const board of ['notice', 'news', 'qna', 'request', 'inquiry', 'promo']) {
        const state = associateWriteState(associate(), board);
        assert.equal(state.open, false, board);
        assert.equal(state.reason, 'board');
        assert.match(state.message, /등업/);
    }
    const second = associateWriteState(associate({ post: true, comment: false }), 'free');
    assert.equal(second.open, false);
    assert.equal(second.reason, 'post-done');
    assert.match(second.message, /댓글/);
    assert.match(associateWriteState(associate({ post: true, comment: true }), 'free').message, /등업 신청/);
});

test('the server answers what is missing: true means still missing, so the done flag is the opposite', () => {
    assert.deepEqual(levelUpFromNeed({ post: false, comment: true }), { post: true, comment: false });
    assert.deepEqual(levelUpFromNeed({ post: true, comment: true }), { post: false, comment: false });
    assert.deepEqual(levelUpFromNeed({ post: false, comment: false }), { post: true, comment: true });
    assert.equal(levelUpFromNeed(undefined), null, 'no need object: nothing to learn');
    assert.equal(levelUpFromNeed('x'), null);
});

test('failure words name only what is still missing', () => {
    const both = describeLevelUpFailure({ ok: false, code: 'LEVEL_UP_NOT_READY', need: { post: true, comment: true } });
    assert.match(both, /가입 인사/);
    assert.match(both, /댓글/);
    const onlyComment = describeLevelUpFailure({ ok: false, code: 'LEVEL_UP_NOT_READY', need: { post: false, comment: true } });
    assert.match(onlyComment, /댓글/);
    assert.doesNotMatch(onlyComment, /가입 인사/);
    const onlyPost = describeLevelUpFailure({ ok: false, code: 'LEVEL_UP_NOT_READY', need: { post: true, comment: false } });
    assert.match(onlyPost, /가입 인사/);
    assert.doesNotMatch(onlyPost, /댓글/);
    assert.equal(describeLevelUpFailure({ ok: false, code: 'NETWORK', message: '연결에 실패했어요.' }), '연결에 실패했어요.');
    assert.match(describeLevelUpFailure({ ok: false, code: 'X' }), /등업/);
});
