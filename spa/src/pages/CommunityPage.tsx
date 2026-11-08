import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import CommunitySidebar, { BoardTabs } from '../components/community/CommunitySidebar';
import LevelUpCard from '../components/community/LevelUpCard';
import ListReport from '../components/community/ListReport';
import PromoTabs from '../components/community/PromoTabs';
import ModerationPanel from '../components/community/ModerationPanel';
import RewardDesk from '../components/community/RewardDesk';
import NicknameForm from '../components/community/NicknameForm';
import PostDetail from '../components/community/PostDetail';
import PostList from '../components/community/PostList';
import PostWriteForm from '../components/community/PostWriteForm';
import TopGrid from '../components/community/TopGrid';
import WeeklyTop from '../components/community/WeeklyTop';
import { REPORTS_PATH, REWARDS_PATH, canModerate, isReportsView, isRewardsView } from '../lib/accountModel.mjs';
import { gradeGuide, scoreRulesText } from '../lib/communityGrades.mjs';
import { boardApi, type PostDraft } from '../lib/communityApi';
import type { PostItem } from '../lib/communityData';
import { findKnownPost } from '../lib/communityFeed';
import {
    ALL_BOARD, boardLabel, boardList, communityPath, describeVisit, parseCommunityQuery, reportReasons, showWriteButton,
} from '../lib/communityModel.mjs';
import { associateWriteState } from '../lib/communityLevel.mjs';
import { authorOf } from '../lib/communityOutbox';
import { visibleOutbox } from '../lib/communityPostOutbox';
import { reportAction } from '../lib/communityReport.mjs';
import { useBoardFeed } from '../lib/useBoardFeed';
import { usePostOutbox } from '../lib/usePostOutbox';
import { loginPath } from '../lib/siteAuthModel.mjs';
import { useSiteSession } from '../lib/useSiteSession';
import '../styles/light-page.css';
import '../components/community/community.css';
import '../components/community/community-detail.css';
import '../components/community/community-speed.css';
import '../components/community/community-forum.css';

const ALL_NOTE = '전체글은 게시판마다 최신 글 20개씩 모아 보여 드려요.';

type Notice = { tone: 'ok' | 'info'; text: string };

/**
 * /community — the bright "cafe" board (agreed mockup A). Reachable only with a site login (RequireLogin in App).
 * The address says what is shown: ?board= &sort= &page= &post= &write=1, so back/forward and shared links work.
 * Server text is drawn as text everywhere; the sub-components never set HTML.
 */
function CommunityPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const site = useSiteSession(location.pathname);
    const profile = site.community;
    const view = useMemo(() => parseCommunityQuery(location.search), [location.search]);
    const [reloadKey, setReloadKey] = useState(0);
    const [notice, setNotice] = useState<Notice | null>(null);
    const [editing, setEditing] = useState<PostItem | null>(null);
    const [reporting, setReporting] = useState<PostItem | null>(null);
    const [levelOpen, setLevelOpen] = useState(false);
    // One read brings the list, the board settings, the weekly top and a fresh profile (see useBoardFeed).
    const feed = useBoardFeed(view, reloadKey);
    const config = feed.config;
    const boards = useMemo(() => boardList(config), [config]);
    const grades = useMemo(() => gradeGuide(config), [config]);
    const scoreRules = useMemo(() => scoreRulesText(config?.scoreRules), [config]);
    const weekly = feed.weekly;
    const refresh = useCallback(() => setReloadKey((value) => value + 1), []);
    const outbox = usePostOutbox(refresh);
    const serverIds = useMemo(() => new Set([...feed.pinned, ...feed.posts].map((post) => post.id)), [feed.pinned, feed.posts]);
    const { prune } = outbox;
    useEffect(() => { prune(serverIds); }, [prune, serverIds]);
    const local = useMemo(() => visibleOutbox(outbox.entries, view, serverIds), [outbox.entries, view, serverIds]);
    // What the list already showed of the open post: the detail page draws it while the text is read.
    const preview = useMemo(
        () => (view.post ? [...feed.pinned, ...feed.posts].find((post) => post.id === view.post) ?? findKnownPost(view.post) : null),
        [view.post, feed.pinned, feed.posts],
    );

    useEffect(() => {
        const previous = document.title;
        document.title = '커뮤니티 — Leaders Pro';
        return () => { document.title = previous; };
    }, []);

    // A notice belongs to the screen it was shown on.
    useEffect(() => { setNotice(null); setLevelOpen(false); }, [location.search]);

    if (!profile) return null;

    const visit = (post: PostItem) => {
        if (!post.url) return;
        // Opened first, in the click itself, so the browser does not treat it as a blocked pop-up.
        window.open(post.url, '_blank', 'noopener');
        void boardApi.visitPromo(post.url).then((result) => {
            setNotice(describeVisit(result));
            if (result.ok) refresh();
        });
    };

    // A new post is on top of the list at once ("sending") and goes to the server in the background.
    const submitNew = (draft: PostDraft) => {
        outbox.send(draft, authorOf(profile));
        navigate(communityPath({ board: draft.board, platform: draft.platform }));
    };

    const afterWrite = (post: PostItem | null) => {
        setEditing(null);
        refresh();
        navigate(post ? communityPath({ board: view.board, platform: view.platform, post: post.id }) : communityPath({ board: view.board, platform: view.platform }));
    };

    // [신고] from a list row; nobody logged in is sent to the login page first.
    const startReport = (post: PostItem) => {
        if (reportAction(post, profile) === 'login') { navigate(loginPath(communityPath({ board: view.board, post: post.id }))); return; }
        setReporting(post);
    };

    const title = view.board === ALL_BOARD ? '전체글' : boardLabel(view.board, boards);
    const note = view.board === ALL_BOARD ? ALL_NOTE : boards.find((board) => board.id === view.board)?.note;
    const moderator = canModerate(profile);
    const reportsView = moderator && isReportsView(location.search);
    const rewardsView = moderator && !reportsView && isRewardsView(location.search);
    const deskView = reportsView || rewardsView;
    const showList = !view.write && !view.post && !editing && !deskView;
    const writeState = associateWriteState(profile, view.board);

    return (
        <div className="lp cm">
            <header className="cm-head">
                <div className="lp-wrap cm-head-in">
                    <div>
                        <h1>커뮤니티</h1>
                        <p>모르는 건 묻고, 잘된 건 나누는 곳</p>
                    </div>
                    <div className="cm-head-actions">
                        {moderator && deskView ? <Link className="lp-btn lp-btn-line" to={communityPath({ board: view.board })}>← 커뮤니티로</Link> : null}
                        {moderator && !reportsView ? <Link className="lp-btn lp-btn-line" to={REPORTS_PATH}>신고 목록</Link> : null}
                        {moderator && !rewardsView ? <Link className="lp-btn lp-btn-line" to={REWARDS_PATH}>보상 승인</Link> : null}
                        {view.write || editing || deskView || !showWriteButton(view.board, boards) ? null : writeState.open ? (
                            <Link className="lp-btn lp-btn-dark" to={communityPath({ board: view.board, platform: view.platform, write: true })}>글쓰기</Link>
                        ) : (
                            <button type="button" className="lp-btn lp-btn-dark is-locked" onClick={() => setLevelOpen(true)}>글쓰기</button>
                        )}
                    </div>
                </div>
            </header>
            <div className="lp-wrap cm-wrap">
                <CommunitySidebar profile={profile} boards={boards} boardId={view.board} counts={feed.counts} grades={grades} scoreRules={scoreRules} />
                <div className="cm-main">
                    <BoardTabs boards={boards} boardId={view.board} />
                    {notice ? <p className={`cm-notice${notice.tone === 'info' ? ' is-info' : ''}`} role="status">{notice.text}</p> : null}
                    {levelOpen ? <LevelUpCard profile={profile} hint={writeState.message || '등업 후 쓸 수 있어요.'} onDone={refresh} onClose={() => setLevelOpen(false)} /> : null}
                    {view.board === 'promo' && showList ? <PromoTabs platform={view.platform} sort={view.sort} /> : null}
                    {profile.needsNickname || !profile.nickname ? (
                        <section className="lp-box cm-nick-card" aria-labelledby="cm-nick-title">
                            <h2 id="cm-nick-title">닉네임을 정해 주세요</h2>
                            <p className="au-help">글과 댓글에 보이는 이름이에요. 정하면 글쓰기와 댓글이 열려요.</p>
                            <NicknameForm onDone={refresh} />
                        </section>
                    ) : null}
                    {reportsView ? (
                        <ModerationPanel />
                    ) : rewardsView ? (
                        <RewardDesk />
                    ) : editing ? (
                        <PostWriteForm boards={boards} defaultBoard={editing.board} profile={profile} editing={editing}
                            onDone={afterWrite} onCancel={() => setEditing(null)} />
                    ) : view.write ? (
                        <PostWriteForm boards={boards} defaultBoard={view.board} defaultPlatform={view.platform} profile={profile}
                            onDone={afterWrite} onSubmitNew={submitNew} onCancel={() => navigate(communityPath({ board: view.board, platform: view.platform }))} />
                    ) : view.post ? (
                        <PostDetail key={view.post} id={view.post} boards={boards} boardId={view.board} profile={profile} reportConfig={config}
                            preview={preview} onEdit={setEditing} onDeleted={() => { refresh(); navigate(communityPath({ board: view.board })); }} onVisit={visit} onModerated={refresh} />
                    ) : null}
                    {showList ? (
                        <>
                            {view.page === 1 && feed.status !== 'loading'
                                ? view.board === ALL_BOARD
                                    ? <TopGrid posts={weekly} boardId={view.board} boards={boards} />
                                    : <WeeklyTop posts={weekly.slice(0, 6)} boardId={view.board} />
                                : null}
                            <PostList title={title} note={note} boardId={view.board} boards={boards} pinned={feed.pinned} posts={feed.posts}
                                total={feed.total} page={view.page} totalPages={feed.totalPages} sort={view.sort}
                                loading={feed.status === 'loading'} refreshing={feed.refreshing} error={feed.status === 'error' ? feed.message : ''}
                                local={local} onRetryLocal={(post) => outbox.retry(post.id)} onDiscardLocal={(post) => outbox.discard(post.id)}
                                moderator={moderator} onVisit={visit} onRetry={feed.reload}
                                onReport={startReport} reportMode={(post) => reportAction(post, profile)} />
                        </>
                    ) : null}
                    {reporting ? (
                        <ListReport post={reporting} reasons={reportReasons(config)} onClose={() => setReporting(null)} onSent={(text) => setNotice({ tone: 'ok', text })} />
                    ) : null}
                </div>
            </div>
        </div>
    );
}

export default CommunityPage;
