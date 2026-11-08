// 질문하기 (contract 1116, Site): the qna board in the board model, the question state chip, who may accept an answer,
// the accepted-first order, the optimistic accept, the data fields and the API call. Pure rules plus the thin data layer.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    QNA_BOARD, QNA_EMPTY_TEXT, QNA_OPEN, QNA_SOLVED,
    acceptAction, acceptedFirst, acceptedIdOf, acceptedPost, describeAcceptFailure, isQnaPost, markAccepted, qnaState,
} from '../src/lib/communityQna.mjs';
import {
    BOARD_ORDER, boardList, canWriteBoard, communityPath, parseCommunityQuery, showWriteButton, statusBadge, validatePostDraft,
} from '../src/lib/communityModel.mjs';
import { pickCounts } from '../src/lib/communityFeedModel.mjs';
import { pickScoreRules, scoreRulesText, SCORE_RULES } from '../src/lib/communityGrades.mjs';
import { boardTone } from '../src/lib/communityTopGrid.mjs';
import { COMMUNITY_ACTIONS, COMMUNITY_CODES } from '../src/lib/communityContract.mjs';
import { createLoader, fakeBrowser, restoreBrowser } from './helpers/load-ts.mjs';

const member = { id: 'm', level: 'member', role: 'community', nickname: '회원' };
const associate = { id: 'a', level: 'associate', role: 'community', nickname: '준회원' };
const byId = (id) => boardList(null).find((board) => board.id === id);

test('qna is the third board, right after 최근 소식, with the contract settings', () => {
    assert.equal(QNA_BOARD, 'qna');
    assert.deepEqual(BOARD_ORDER, ['notice', 'news', 'qna', 'request', 'inquiry', 'free', 'promo']);
    const qna = byId('qna');
    assert.equal(qna.label, '질문하기');
    assert.equal(qna.writeRole, 'member');
    assert.equal(qna.dailyLimit, 5);
    assert.deepEqual([...qna.statuses], ['답변 대기', '해결됨']);
    assert.equal(qna.defaultStatus, '답변 대기');
    assert.deepEqual(boardList(null).map((board) => board.id), [...BOARD_ORDER], 'the screen lists the boards in the same order');
});

test('qna: members write, associates are blocked like on the other boards, the write button is shown', () => {
    assert.equal(canWriteBoard(byId('qna'), member), true);
    assert.equal(canWriteBoard(byId('qna'), associate), false, '준회원 rule is unchanged: free board only');
    assert.equal(showWriteButton('qna', boardList(null)), true);
    assert.equal(validatePostDraft({ board: 'qna', title: '질문이에요', body: '이게 안 돼요' }), '');
    assert.notEqual(validatePostDraft({ board: 'qna', title: '', body: '내용' }), '');
});

test('qna address, counts and top-grid colour', () => {
    assert.equal(communityPath({ board: 'qna' }), '/community?board=qna');
    assert.equal(parseCommunityQuery('?board=qna').board, 'qna');
    assert.deepEqual(pickCounts({ qna: 4, free: 2, bogus: 9 }), { qna: 4, free: 2 });
    assert.equal(boardTone('qna'), 'qna');
});

test('status chip words: 답변 대기 is amber (wait), 해결됨 is green (done)', () => {
    assert.deepEqual(statusBadge('qna', '답변 대기'), { tone: 'wait', label: '답변 대기' });
    assert.deepEqual(statusBadge('qna', '해결됨'), { tone: 'done', label: '해결됨' });
    assert.equal(statusBadge('qna', ''), null);
});

test('qnaState: a question is solved by its status word, the solved flag or an accepted comment id; otherwise it waits', () => {
    assert.equal(qnaState({ board: 'free', status: '해결됨' }), null, 'only qna posts have a state');
    assert.deepEqual(qnaState({ board: 'qna', status: '' }), { key: 'open', label: QNA_OPEN, tone: 'wait' });
    assert.deepEqual(qnaState({ board: 'qna', status: '답변 대기' }), { key: 'open', label: '답변 대기', tone: 'wait' });
    for (const post of [{ status: '해결됨' }, { status: '답변 대기', solved: true }, { status: '', acceptedCommentId: 'c_1' }]) {
        assert.deepEqual(qnaState({ board: 'qna', ...post }), { key: 'solved', label: QNA_SOLVED, tone: 'done' }, JSON.stringify(post));
    }
    assert.equal(isQnaPost({ board: 'qna' }), true);
    assert.equal(isQnaPost({ board: 'free' }), false);
    assert.equal(isQnaPost(null), false);
});

const comment = (id, extra = {}) => ({ id, parentId: '', mine: false, gone: false, hidden: false, accepted: false, replies: [], ...extra });

test('acceptAction: only the asker, only another person\'s live top-level comment; the accepted one offers the cancel', () => {
    assert.equal(acceptAction(true, comment('c_1')), 'accept');
    assert.equal(acceptAction(false, comment('c_1')), '', 'not the asker: no button');
    assert.equal(acceptAction(true, comment('c_2', { mine: true })), '', 'the asker cannot accept their own comment');
    assert.equal(acceptAction(true, comment('c_3', { parentId: 'c_1' })), '', 'a reply is not an answer');
    assert.equal(acceptAction(true, comment('c_4', { gone: true })), '');
    assert.equal(acceptAction(true, comment('c_5', { hidden: true, gone: true })), '');
    assert.equal(acceptAction(true, comment('pending_w1', { delivery: 'sending' })), '', 'a comment still being sent');
    assert.equal(acceptAction(true, comment('c_6', { accepted: true })), 'cancel');
    assert.equal(acceptAction(false, comment('c_6', { accepted: true })), '');
});

test('acceptedFirst: the accepted top-level comment moves to the front, the others keep their order; nothing is mutated', () => {
    const list = Object.freeze([comment('c_1'), comment('c_2', { accepted: true }), comment('c_3')]);
    assert.deepEqual(acceptedFirst(list).map((entry) => entry.id), ['c_2', 'c_1', 'c_3']);
    assert.deepEqual(acceptedFirst([comment('c_1'), comment('c_2')]).map((entry) => entry.id), ['c_1', 'c_2']);
    assert.deepEqual(acceptedFirst([comment('c_1', { accepted: true }), comment('c_2')]).map((entry) => entry.id), ['c_1', 'c_2']);
    assert.deepEqual(acceptedFirst([]), []);
    assert.deepEqual(list.map((entry) => entry.id), ['c_1', 'c_2', 'c_3']);
});

test('markAccepted marks exactly one top-level comment; an empty id un-accepts', () => {
    const list = [comment('c_1', { accepted: true }), comment('c_2', { replies: [comment('c_9', { parentId: 'c_2' })] })];
    assert.deepEqual(markAccepted(list, 'c_2').map((entry) => entry.accepted), [false, true], 'accepting another replaces the old one');
    assert.deepEqual(markAccepted(list, '').map((entry) => entry.accepted), [false, false]);
    assert.equal(markAccepted(list, 'c_2')[1].replies[0].accepted, false);
    assert.equal(list[0].accepted, true, 'the input is untouched');
});

test('acceptedPost: accepting makes the question 해결됨, un-accepting puts it back to 답변 대기', () => {
    const post = { id: 'p_1', board: 'qna', status: '답변 대기', solved: false, acceptedCommentId: '', title: 't' };
    assert.deepEqual(acceptedPost(post, 'c_2'), { ...post, status: '해결됨', solved: true, acceptedCommentId: 'c_2' });
    const solved = { ...post, status: '해결됨', solved: true, acceptedCommentId: 'c_2' };
    assert.deepEqual(acceptedPost(solved, ''), { ...solved, status: '답변 대기', solved: false, acceptedCommentId: '' });
    assert.equal(post.status, '답변 대기', 'the input is untouched');
});

test('acceptedIdOf: the post\'s own field first, else the comment flagged accepted, else nothing', () => {
    assert.equal(acceptedIdOf({ acceptedCommentId: 'c_7' }, [comment('c_1', { accepted: true })]), 'c_7');
    assert.equal(acceptedIdOf({ acceptedCommentId: '' }, [comment('c_1'), comment('c_2', { accepted: true })]), 'c_2');
    assert.equal(acceptedIdOf({ acceptedCommentId: '' }, [comment('c_1')]), '');
});

test('refusal sentences: the server\'s own sentence is shown as it is; our words only fill in when it sent none', () => {
    assert.equal(COMMUNITY_CODES.ACCEPT_NOT_ALLOWED, 'ACCEPT_NOT_ALLOWED');
    assert.equal(COMMUNITY_CODES.COMMENT_NOT_FOUND, 'COMMENT_NOT_FOUND');
    for (const code of ['ACCEPT_NOT_ALLOWED', 'COMMENT_NOT_FOUND', 'POST_NOT_FOUND', 'TOO_FAST', 'BUSY']) {
        assert.equal(describeAcceptFailure({ ok: false, code, message: `서버 문장 ${code}` }), `서버 문장 ${code}`, code);
    }
    assert.match(describeAcceptFailure({ ok: false, code: 'ACCEPT_NOT_ALLOWED', message: '' }), /질문한 분/);
    assert.match(describeAcceptFailure({ ok: false, code: 'COMMENT_NOT_FOUND' }), /댓글/);
    assert.match(describeAcceptFailure(null), /처리하지 못했어요/);
});

test('empty state sentence of the board', () => {
    assert.equal(QNA_EMPTY_TEXT, '궁금한 걸 물어보세요. 답을 채택하면 답한 분께 점수가 갑니다.');
});

test('grade guide point line: 채택 comes from the server\'s score table; without it the line is as before (no hardcoded number)', () => {
    const base = { post: 10, comment: 2, visit: 1, likeReceived: 1, dailyCap: 50 };
    assert.equal(scoreRulesText(base), '글 10점 · 댓글 2점 · 들르기 1점 · 내 글 좋아요 1점 · 하루 최대 50점');
    assert.deepEqual(pickScoreRules(base), base, 'the old shape is read exactly as before');
    assert.equal(scoreRulesText({ ...base, accepted: 10 }), '글 10점 · 댓글 2점 · 들르기 1점 · 내 글 좋아요 1점 · 채택 10점 · 하루 최대 50점');
    assert.equal(scoreRulesText({ ...base, accepted: 7 }).includes('채택 7점'), true, 'whatever number the server sends');
    assert.equal(scoreRulesText({ ...base, accepted: 0 }).includes('채택'), false);
    assert.equal(scoreRulesText({ ...base, accepted: 'x' }).includes('채택'), false);
    assert.equal(scoreRulesText(null), SCORE_RULES);
    assert.equal(SCORE_RULES.includes('채택'), false, 'the built-in sentence carries no number of its own');
});

test('contract names: the accept action', () => {
    assert.equal(COMMUNITY_ACTIONS.acceptAnswer, 'community-accept-answer');
});

const FUTURE = '2099-01-01T00:00:00.000Z';
const asker = {
    userId: 'asker01', role: 'community', nickname: '질문자', needsNickname: false, canWriteNews: false, score: 0,
    activity: { posts: 0, comments: 0, visits: 0 }, grade: { key: 'sprout', label: '새싹' }, linked: false,
    communityToken: 'ct_asker', sessionExpiresAt: FUTURE,
};

async function withAsker(replies, body) {
    const browser = fakeBrowser(replies);
    try {
        const load = createLoader();
        const modules = { api: load('../../src/lib/communityApi.ts'), data: load('../../src/lib/communityData.ts'), session: load('../../src/lib/communitySession.ts') };
        modules.session.saveCommunitySession(modules.session.toCommunitySession(asker));
        return await body(browser, modules);
    } finally { restoreBrowser(); }
}

test('data: the post carries acceptedCommentId and solved; the comment carries accepted (never on a removed comment)', async () => {
    await withAsker({}, (_browser, { data }) => {
        const open = data.normalizePost({ id: 'p_1', board: 'qna', status: '답변 대기' });
        assert.deepEqual([open.solved, open.acceptedCommentId], [false, '']);
        const detail = data.normalizePost({ id: 'p_2', board: 'qna', status: '해결됨', acceptedCommentId: 'c_5' });
        assert.deepEqual([detail.solved, detail.acceptedCommentId], [true, 'c_5']);
        const row = data.normalizePost({ id: 'p_3', board: 'qna', status: '해결됨', solved: true });
        assert.deepEqual([row.solved, row.acceptedCommentId], [true, '']);
        const base = { postId: 'p_2', nickname: '답변자', body: '답이에요', createdAt: '2026-11-08T11:55:00+09:00', replies: [] };
        const [a, b, c] = data.normalizeComments([{ ...base, id: 'c_5', accepted: true }, { ...base, id: 'c_6' }, { ...base, id: 'c_7', accepted: true, deleted: true }]);
        assert.deepEqual([a.accepted, b.accepted, c.accepted], [true, false, false]);
    });
});

test('api: accept sends postId and commentId with the community token; an empty commentId un-accepts', async () => {
    const replies = { 'community-accept-answer': { ok: true } };
    await withAsker(replies, async (browser, { api }) => {
        const done = await api.boardApi.acceptAnswer('p_1', 'c_2');
        assert.equal(done.ok, true);
        assert.deepEqual(browser.calls[0], { postId: 'p_1', commentId: 'c_2', communityToken: 'ct_asker', action: 'community-accept-answer' });
        await api.boardApi.acceptAnswer('p_1', '');
        assert.deepEqual(browser.calls[1], { postId: 'p_1', commentId: '', communityToken: 'ct_asker', action: 'community-accept-answer' });
    });
});

test('api: a refusal comes back as the server\'s code', async () => {
    const replies = { 'community-accept-answer': { ok: false, code: 'ACCEPT_NOT_ALLOWED', message: '채택할 수 없어요.' } };
    await withAsker(replies, async (_browser, { api }) => {
        const result = await api.boardApi.acceptAnswer('p_1', 'c_2');
        assert.deepEqual([result.ok, result.code], [false, 'ACCEPT_NOT_ALLOWED']);
    });
});

test('accept flow: the screen changes first; a yes keeps it and tells the list, a no draws the old answer back with the sentence', async () => {
    await withAsker({}, async (_browser, { api }) => {
        const flow = createLoader()('../../src/lib/communityAccept.ts');
        const run = async (reply) => {
            const log = [];
            const view = { show: (id) => log.push(`show:${id}`), notify: (text) => log.push(`notify:${text}`), done: () => log.push('done') };
            const sentence = await flow.acceptAnswerFlow('p_1', 'c_2', 'c_1', view, async () => { log.push('call'); return reply; });
            return { log, sentence };
        };
        // The server answers {ok, postId, acceptedCommentId, status, solved}: the screen follows the id it settled on.
        const settled = await run({ ok: true, postId: 'p_1', acceptedCommentId: 'c_9', status: '해결됨', solved: true });
        assert.deepEqual(settled.log, ['notify:', 'show:c_2', 'call', 'show:c_9', 'done']);
        const yes = await run({ ok: true });
        assert.deepEqual(yes.log, ['notify:', 'show:c_2', 'call', 'done']);
        assert.equal(yes.sentence, '');
        const no = await run({ ok: false, code: 'ACCEPT_NOT_ALLOWED', message: '질문 글쓴이만 채택할 수 있습니다.' });
        assert.deepEqual(no.log.slice(0, 4), ['notify:', 'show:c_2', 'call', 'show:c_1'], 'drawn first, put back after the refusal');
        assert.equal(no.log[4], 'notify:질문 글쓴이만 채택할 수 있습니다.', 'the server sentence, as it is');
        assert.equal(no.log.includes('done'), false);
        void api;
    });
});

test('accept flow: taking the answer back sends an empty commentId and shows no answer; a lost connection puts the old one back', async () => {
    await withAsker({ 'community-accept-answer': { ok: true } }, async (browser) => {
        const flow = createLoader()('../../src/lib/communityAccept.ts');
        const shown = [];
        const view = { show: (id) => shown.push(id), notify() {}, done() {} };
        await flow.acceptAnswerFlow('p_1', '', 'c_2', view);
        assert.deepEqual(shown, ['']);
        assert.deepEqual([browser.calls[0].postId, browser.calls[0].commentId], ['p_1', '']);
        const thrown = [];
        await flow.acceptAnswerFlow('p_1', 'c_3', 'c_2', { show: (id) => thrown.push(id), notify() {}, done() {} }, async () => { throw new Error('offline'); });
        assert.deepEqual(thrown, ['c_3', 'c_2']);
    });
});
