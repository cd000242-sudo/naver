import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import CommunitySidebar, { BoardTabs } from '../components/community/CommunitySidebar';
import NicknameForm from '../components/community/NicknameForm';
import PostDetail from '../components/community/PostDetail';
import PostList from '../components/community/PostList';
import PostWriteForm from '../components/community/PostWriteForm';
import WeeklyTop from '../components/community/WeeklyTop';
import { refreshCommunityProfile } from '../lib/communityAuth';
import { boardApi } from '../lib/communityApi';
import { normalizePosts, type PostItem } from '../lib/communityData';
import {
    ALL_BOARD, boardLabel, boardList, communityPath, describeVisit, parseCommunityQuery,
} from '../lib/communityModel.mjs';
import { useBoardFeed } from '../lib/useBoardFeed';
import { useSiteSession } from '../lib/useSiteSession';
import '../styles/light-page.css';
import '../components/community/community.css';
import '../components/community/community-detail.css';

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
    const [config, setConfig] = useState<Record<string, unknown> | null>(null);
    const boards = useMemo(() => boardList(config), [config]);
    const [weekly, setWeekly] = useState<PostItem[]>([]);
    const [reloadKey, setReloadKey] = useState(0);
    const [notice, setNotice] = useState<Notice | null>(null);
    const [editing, setEditing] = useState<PostItem | null>(null);
    const feed = useBoardFeed(view, reloadKey);

    useEffect(() => {
        const previous = document.title;
        document.title = '커뮤니티 — Leaders Pro';
        return () => { document.title = previous; };
    }, []);

    // Once per visit: board settings, and a fresh profile (score and grade change while away).
    useEffect(() => {
        let alive = true;
        void boardApi.boards().then((result) => { if (alive && result.ok) setConfig(result); });
        void refreshCommunityProfile();
        return () => { alive = false; };
    }, []);

    useEffect(() => {
        let alive = true;
        void boardApi.weeklyTop(6).then((result) => {
            if (alive) setWeekly(result.ok ? normalizePosts(result.posts) : []);
        });
        return () => { alive = false; };
    }, [reloadKey]);

    // A notice belongs to the screen it was shown on.
    useEffect(() => { setNotice(null); }, [location.search]);

    if (!profile) return null;

    const refresh = () => { void refreshCommunityProfile(); setReloadKey((value) => value + 1); };

    const visit = (post: PostItem) => {
        if (!post.url) return;
        // Opened first, in the click itself, so the browser does not treat it as a blocked pop-up.
        window.open(post.url, '_blank', 'noopener');
        void boardApi.visitPromo(post.url).then((result) => {
            setNotice(describeVisit(result));
            if (result.ok) refresh();
        });
    };

    const afterWrite = (post: PostItem | null) => {
        setEditing(null);
        refresh();
        navigate(post ? communityPath({ board: view.board, post: post.id }) : communityPath({ board: view.board }));
    };

    const title = view.board === ALL_BOARD ? '전체글' : boardLabel(view.board, boards);
    const note = view.board === ALL_BOARD ? ALL_NOTE : boards.find((board) => board.id === view.board)?.note;
    const showList = !view.write && !view.post && !editing;

    return (
        <div className="lp cm">
            <header className="cm-head">
                <div className="lp-wrap cm-head-in">
                    <div>
                        <h1>커뮤니티</h1>
                        <p>모르는 건 묻고, 잘된 건 나누는 곳</p>
                    </div>
                    {view.write || editing ? null : (
                        <Link className="lp-btn lp-btn-dark" to={communityPath({ board: view.board, write: true })}>글쓰기</Link>
                    )}
                </div>
            </header>
            <div className="lp-wrap cm-wrap">
                <CommunitySidebar profile={profile} boards={boards} boardId={view.board} counts={feed.counts} />
                <div className="cm-main">
                    <BoardTabs boards={boards} boardId={view.board} />
                    {notice ? <p className={`cm-notice${notice.tone === 'info' ? ' is-info' : ''}`} role="status">{notice.text}</p> : null}
                    {profile.needsNickname || !profile.nickname ? (
                        <section className="lp-box cm-nick-card" aria-labelledby="cm-nick-title">
                            <h2 id="cm-nick-title">닉네임을 정해 주세요</h2>
                            <p className="au-help">글과 댓글에 보이는 이름이에요. 정하면 글쓰기와 댓글이 열려요.</p>
                            <NicknameForm onDone={refresh} />
                        </section>
                    ) : null}
                    {editing ? (
                        <PostWriteForm boards={boards} defaultBoard={editing.board} profile={profile} editing={editing}
                            onDone={afterWrite} onCancel={() => setEditing(null)} />
                    ) : view.write ? (
                        <PostWriteForm boards={boards} defaultBoard={view.board} profile={profile}
                            onDone={afterWrite} onCancel={() => navigate(communityPath({ board: view.board }))} />
                    ) : view.post ? (
                        <PostDetail key={view.post} id={view.post} boards={boards} boardId={view.board} profile={profile} reportConfig={config}
                            onEdit={setEditing} onDeleted={() => { refresh(); navigate(communityPath({ board: view.board })); }} onVisit={visit} />
                    ) : null}
                    {showList ? (
                        <>
                            {view.page === 1 ? <WeeklyTop posts={weekly} boardId={view.board} /> : null}
                            <PostList title={title} note={note} boardId={view.board} boards={boards} pinned={feed.pinned} posts={feed.posts}
                                total={feed.total} page={view.page} totalPages={feed.totalPages} sort={view.sort}
                                loading={feed.status === 'loading'} error={feed.status === 'error' ? feed.message : ''}
                                onVisit={visit} onRetry={feed.reload} />
                        </>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

export default CommunityPage;
