// Community board model (2026-11-08): six boards, sorts, status badges, who may write where, grades, paging, dates, comments.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    BOARD_ORDER, SORTS, GRADE_GUIDE, SCORE_RULES,
    boardList, boardLabel, normalizeSort, statusBadge, canWriteBoard, writableBoards,
    gradeProgress, pageNumbers, formatPostDate, countComments, validatePostDraft, validateCommentDraft,
    platformLabel, ALL_BOARD, REPORT_REASONS, reportReasons, communityPath, parseCommunityQuery, mergeBoardPages, describeVisit,
} from '../src/lib/communityModel.mjs';

const member = { role: 'community', canWriteNews: false };
const owner = { role: 'owner', canWriteNews: true };

test('there are exactly six boards, in the agreed order, with their Korean names', () => {
    assert.deepEqual(BOARD_ORDER, ['notice', 'news', 'request', 'inquiry', 'free', 'promo']);
    const boards = boardList(null);
    assert.deepEqual(boards.map((board) => board.label), ['공지사항', '최근 소식', '요청사항', '버그 및 오류 신고', '자유게시판', '내 글 홍보']);
});

test('server board settings win over the built-in ones but never add, reorder or rename boards (the screen names win)', () => {
    const boards = boardList({ boards: [
        { id: 'promo', label: '내 글 홍보', writeRole: 'member', dailyLimit: 3, statuses: [], defaultStatus: '' },
        { id: 'free', label: '자유판', writeRole: 'member', dailyLimit: 9, statuses: [], defaultStatus: '' },
        { id: 'inquiry', label: '문의', writeRole: 'member', dailyLimit: 5, statuses: ['대기', '답변 완료'], defaultStatus: '대기' },
        { id: 'sneaky', label: '숨은 판', writeRole: 'member', dailyLimit: 1, statuses: [], defaultStatus: '' },
    ] });
    assert.deepEqual(boards.map((board) => board.id), BOARD_ORDER);
    assert.equal(boards.find((board) => board.id === 'free').label, '자유게시판', 'a server label does not rename a board');
    assert.equal(boards.find((board) => board.id === 'inquiry').label, '버그 및 오류 신고', 'an old server that still says 문의 changes nothing');
    assert.equal(boards.find((board) => board.id === 'inquiry').note, '앱이 안 되거나 오류가 나면 알려 주세요.');
    assert.deepEqual(boards.find((board) => board.id === 'inquiry').statuses, ['대기', '답변 완료'], 'ids and statuses are untouched');
    assert.equal(boards.find((board) => board.id === 'free').dailyLimit, 9);
    assert.equal(boards.find((board) => board.id === 'news').writeRole, 'operator', 'untouched boards keep the built-in rule');
});

test('boardLabel falls back to the id for an unknown board', () => {
    assert.equal(boardLabel('news'), '최근 소식');
    assert.equal(boardLabel('zzz'), 'zzz');
});

test('three sorts: latest, popular, most comments — anything else is latest', () => {
    assert.deepEqual(SORTS.map((sort) => [sort.key, sort.label]), [['latest', '최신순'], ['popular', '인기순'], ['comments', '댓글많은순']]);
    assert.equal(normalizeSort('popular'), 'popular');
    assert.equal(normalizeSort('comments'), 'comments');
    assert.equal(normalizeSort('hax'), 'latest');
    assert.equal(normalizeSort(undefined), 'latest');
});

test('status badges: inquiry waits or is answered, request is under review or reflected, other boards show none', () => {
    assert.deepEqual(statusBadge('inquiry', '대기'), { tone: 'wait', label: '대기' });
    assert.deepEqual(statusBadge('inquiry', '답변 완료'), { tone: 'done', label: '답변 완료' });
    assert.deepEqual(statusBadge('request', '검토 중'), { tone: 'review', label: '검토 중' });
    assert.deepEqual(statusBadge('request', '반영됨'), { tone: 'done', label: '반영됨' });
    assert.equal(statusBadge('free', '반영됨'), null);
    assert.equal(statusBadge('inquiry', ''), null);
    assert.equal(statusBadge('news', undefined), null);
    assert.deepEqual(statusBadge('request', '처음 보는 상태'), { tone: 'review', label: '처음 보는 상태' }, 'unknown wording is shown, not hidden');
});

test('only the operator may write on the news board; everyone logged in may write on the rest', () => {
    const boards = boardList(null);
    const byId = Object.fromEntries(boards.map((board) => [board.id, board]));
    assert.equal(canWriteBoard(byId.news, member), false);
    assert.equal(canWriteBoard(byId.news, owner), true);
    assert.equal(canWriteBoard(byId.news, { role: 'licensed', canWriteNews: false }), false);
    for (const id of ['request', 'inquiry', 'free', 'promo']) assert.equal(canWriteBoard(byId[id], member), true, id);
    assert.equal(canWriteBoard(byId.free, null), false, 'no login, no writing');
    assert.deepEqual(writableBoards(boards, member).map((board) => board.id), ['request', 'inquiry', 'free', 'promo']);
    assert.deepEqual(writableBoards(boards, owner).map((board) => board.id), ['news', 'request', 'inquiry', 'free', 'promo'], 'the notice board is written in the admin home, not here');
});

test('grade guide lists the five grades (with 숲) with their ranges and the score rules', () => {
    assert.deepEqual(GRADE_GUIDE.map((grade) => [grade.key, grade.label, grade.range]), [
        ['sprout', '새싹', '0~299점'], ['leaf', '잎새', '300~1,499점'], ['fruit', '열매', '1,500~4,999점'], ['tree', '나무', '5,000~14,999점'], ['forest', '숲', '15,000점~'],
    ]);
    assert.equal(SCORE_RULES, '글 10점 · 댓글 2점 · 들르기 1점 · 내 글 좋아요 1점 · 하루 최대 50점');
});

test('gradeProgress shows how far to the next grade, and tops out at the last grade', () => {
    const mid = gradeProgress({ score: 150, grade: { key: 'leaf', label: '잎새', min: 100, nextAt: 500, nextLabel: '열매' } });
    assert.deepEqual([mid.percent, mid.remain, mid.nextLabel], [13, 350, '열매']);
    assert.match(mid.text, /열매까지 350점/);
    const start = gradeProgress({ score: 0, grade: { key: 'sprout', label: '새싹', min: 0, nextAt: 100, nextLabel: '잎새' } });
    assert.equal(start.percent, 0);
    const top = gradeProgress({ score: 2000, grade: { key: 'tree', label: '나무', min: 1500, nextAt: null, nextLabel: null } });
    assert.deepEqual([top.percent, top.remain, top.nextLabel], [100, 0, null]);
    assert.match(top.text, /가장 높은 등급/);
    assert.equal(gradeProgress(null).percent, 0, 'no profile, no crash');
});

test('pageNumbers shows a window of at most five pages around the current one', () => {
    assert.deepEqual(pageNumbers(1, 3), [1, 2, 3]);
    assert.deepEqual(pageNumbers(1, 0), []);
    assert.deepEqual(pageNumbers(1, 1), [1]);
    assert.deepEqual(pageNumbers(1, 20), [1, 2, 3, 4, 5]);
    assert.deepEqual(pageNumbers(10, 20), [8, 9, 10, 11, 12]);
    assert.deepEqual(pageNumbers(20, 20), [16, 17, 18, 19, 20]);
});

test('formatPostDate: just now, minutes, hours, then month.day; broken dates give an empty string', () => {
    const now = new Date('2026-11-08T12:00:00+09:00').getTime();
    assert.equal(formatPostDate('2026-11-08T11:59:40+09:00', now), '방금');
    assert.equal(formatPostDate('2026-11-08T11:25:00+09:00', now), '35분 전');
    assert.equal(formatPostDate('2026-11-08T09:00:00+09:00', now), '3시간 전');
    assert.equal(formatPostDate('2026-11-07T11:00:00+09:00', now), '11.07');
    assert.equal(formatPostDate('2025-12-25T11:00:00+09:00', now), '25.12.25', 'another year adds the year');
    assert.equal(formatPostDate('not a date', now), '');
    assert.equal(formatPostDate('', now), '');
});

test('countComments counts replies too', () => {
    assert.equal(countComments([]), 0);
    assert.equal(countComments(undefined), 0);
    assert.equal(countComments([{ id: 'a', replies: [{ id: 'b' }, { id: 'c' }] }, { id: 'd', replies: [] }]), 4);
});

test('validatePostDraft: ordinary boards need a title and body; promo needs an address, title and intro', () => {
    const boards = boardList(null);
    assert.match(validatePostDraft({ boards, board: 'free', title: '', body: 'x' }), /제목/);
    assert.match(validatePostDraft({ boards, board: 'free', title: 'x', body: '  ' }), /내용/);
    assert.equal(validatePostDraft({ boards, board: 'free', title: 'x', body: 'y' }), '');
    assert.match(validatePostDraft({ boards, board: 'free', title: 'x'.repeat(101), body: 'y' }), /100자/);
    assert.match(validatePostDraft({ boards, board: 'free', title: 'x', body: 'y'.repeat(5001) }), /5,000자/);
    assert.match(validatePostDraft({ boards, board: 'promo', url: '', title: 't', body: 's' }), /주소/);
    assert.match(validatePostDraft({ boards, board: 'promo', url: 'ftp://x', title: 't', body: 's' }), /주소/);
    assert.match(validatePostDraft({ boards, board: 'promo', url: 'https://blog.naver.com/a/1', title: '', body: 's' }), /제목/);
    assert.match(validatePostDraft({ boards, board: 'promo', url: 'https://blog.naver.com/a/1', title: 't', body: '' }), /소개/);
    assert.equal(validatePostDraft({ boards, board: 'promo', url: 'https://blog.naver.com/a/1', title: 't', body: 's' }), '');
    assert.match(validatePostDraft({ boards, board: 'nope', title: 'x', body: 'y' }), /게시판/);
});

test('validateCommentDraft: not empty, at most 1,000 characters', () => {
    assert.match(validateCommentDraft('   '), /내용/);
    assert.equal(validateCommentDraft('좋은 글 감사합니다'), '');
    assert.match(validateCommentDraft('가'.repeat(1001)), /1,000자/);
});

test('platformLabel names the blog platform of a promo post', () => {
    assert.equal(platformLabel('naver'), '네이버');
    assert.equal(platformLabel('tistory'), '티스토리');
    assert.equal(platformLabel('whatever'), '기타');
    assert.equal(platformLabel(undefined), '기타');
});

test('community addresses keep the board, sort, page, post and write flags, and drop the defaults', () => {
    assert.equal(ALL_BOARD, 'all');
    assert.equal(communityPath(), '/community');
    assert.equal(communityPath({ board: 'free' }), '/community?board=free');
    assert.equal(communityPath({ board: 'free', sort: 'popular', page: 3 }), '/community?board=free&sort=popular&page=3');
    assert.equal(communityPath({ board: 'all', sort: 'latest', page: 1 }), '/community');
    assert.equal(communityPath({ board: 'inquiry', post: 'p_abc123' }), '/community?board=inquiry&post=p_abc123');
    assert.equal(communityPath({ board: 'promo', write: true }), '/community?board=promo&write=1');
    assert.equal(communityPath({ post: 'p x<script>' }), '/community', 'an odd post id is not written into the address');
});

test('parseCommunityQuery trusts nothing in the address', () => {
    assert.deepEqual(parseCommunityQuery(''), { board: 'all', platform: 'naver', sort: 'latest', page: 1, post: '', write: false });
    assert.deepEqual(parseCommunityQuery('?board=news&sort=comments&page=4&post=pr_9f&write=1'), { board: 'news', platform: 'naver', sort: 'comments', page: 4, post: 'pr_9f', write: true });
    assert.deepEqual(parseCommunityQuery('?board=hax&sort=drop&page=-5&post=%3Cb%3E&write=yes'), { board: 'all', platform: 'naver', sort: 'latest', page: 1, post: '', write: false });
    assert.equal(parseCommunityQuery('?page=999999999').page, 1000, 'page numbers are capped');
    assert.equal(parseCommunityQuery('?page=abc').page, 1);
});

test('report reasons: the six server reasons, server wording preferred, never an invented key', () => {
    assert.deepEqual(REPORT_REASONS.map((reason) => reason.key), ['spam', 'abuse', 'ad', 'adult', 'illegal', 'other']);
    assert.deepEqual(reportReasons(null).map((reason) => reason.label), REPORT_REASONS.map((reason) => reason.label));
    const merged = reportReasons({ reportReasons: [{ key: 'spam', label: '도배' }, { key: 'sneaky', label: '숨은 사유' }] });
    assert.deepEqual(merged.map((reason) => reason.key), ['spam', 'abuse', 'ad', 'adult', 'illegal', 'other']);
    assert.equal(merged[0].label, '도배');
});

const post = (id, board, createdAt, extra = {}) => ({ id, board, createdAt, likes: 0, views: 0, comments: 0, pinned: false, ...extra });

test('mergeBoardPages builds the all-boards list: pinned first, then the chosen sort, paged', () => {
    const replies = [
        { total: 2, pinned: [post('n1', 'news', '2026-11-07T00:00:00Z', { pinned: true })], posts: [post('f1', 'free', '2026-11-08T01:00:00Z', { likes: 1 }), post('f2', 'free', '2026-11-06T00:00:00Z', { likes: 9 })] },
        { total: 1, pinned: [], posts: [post('q1', 'inquiry', '2026-11-08T03:00:00Z', { comments: 5 })] },
    ];
    const latest = mergeBoardPages(replies, { sort: 'latest', page: 1, pageSize: 20 });
    assert.deepEqual(latest.pinned.map((entry) => entry.id), ['n1']);
    assert.deepEqual(latest.posts.map((entry) => entry.id), ['q1', 'f1', 'f2']);
    assert.equal(latest.total, 3);
    assert.equal(latest.totalPages, 1);
    assert.deepEqual(mergeBoardPages(replies, { sort: 'popular', page: 1 }).posts.map((entry) => entry.id), ['f2', 'f1', 'q1']);
    assert.deepEqual(mergeBoardPages(replies, { sort: 'comments', page: 1 }).posts.map((entry) => entry.id), ['q1', 'f1', 'f2']);
    const paged = mergeBoardPages(replies, { sort: 'latest', page: 2, pageSize: 2 });
    assert.deepEqual(paged.posts.map((entry) => entry.id), ['f2']);
    assert.equal(paged.totalPages, 2);
    assert.deepEqual(paged.pinned, [], 'pinned rows show on the first page only');
});

test('mergeBoardPages skips a board that failed and survives empty input', () => {
    assert.deepEqual(mergeBoardPages([], { sort: 'latest', page: 1 }), { pinned: [], posts: [], total: 0, totalPages: 0 });
    const out = mergeBoardPages([null, { total: 1, pinned: [], posts: [post('a', 'free', '2026-11-08T00:00:00Z')] }], { sort: 'latest', page: 1 });
    assert.deepEqual(out.posts.map((entry) => entry.id), ['a']);
});

test('describeVisit turns the promo-visit answer of the server into one short sentence', () => {
    assert.deepEqual(describeVisit({ ok: true, scored: true, memberVisits: 4 }), { tone: 'ok', text: '들렀어요. 점수 1점이 쌓였어요.' });
    assert.equal(describeVisit({ ok: true, scored: false, scoreReason: 'ALREADY_VISITED_TODAY' }).tone, 'info');
    assert.match(describeVisit({ ok: true, scored: false, scoreReason: 'ALREADY_VISITED_TODAY' }).text, /오늘 이미/);
    assert.match(describeVisit({ ok: true, scored: false, scoreReason: 'OWN_POST' }).text, /내 글/);
    assert.match(describeVisit({ ok: true, scored: false, scoreReason: 'SESSION_INVALID' }).text, /다시 로그인/);
    assert.equal(describeVisit({ ok: true, scored: false, scoreReason: 'SOMETHING_NEW' }).tone, 'info');
    assert.equal(describeVisit({ ok: true }).text, '들렀어요.');
    assert.equal(describeVisit({ ok: false, code: 'LOGIN_REQUIRED', message: '로그인이 필요해요.' }).text, '로그인이 필요해요.');
});
