import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import LoginRequired from '../auth/LoginRequired';
import { gradeGuide, scoreRulesText } from '../../lib/communityGrades.mjs';
import type { PostItem } from '../../lib/communityData';
import { guestBoardHref, guestScreen, isLoginReply } from '../../lib/communityGuest.mjs';
import { ALL_BOARD, boardLabel, communityPath, showWriteButton, type BoardConfig, type CommunityView } from '../../lib/communityModel.mjs';
import { reportAction } from '../../lib/communityReport.mjs';
import type { BoardNewMap } from '../../lib/boardNew.mjs';
import { loginPath } from '../../lib/siteAuthModel.mjs';
import type { Feed } from '../../lib/useBoardFeed';
import CommunitySidebar, { BoardTabs } from './CommunitySidebar';
import GuestPostDetail from './GuestPostDetail';
import GuestSideCard from './GuestSideCard';
import PostList from './PostList';
import SecretLockCard from './SecretLockCard';
import TopGrid from './TopGrid';
import WeeklyTop from './WeeklyTop';
import '../../styles/light-page.css';
import './community.css';
import './community-detail.css';
import './community-speed.css';
import './community-forum.css';
import './community-guest.css';

type Props = {
    view: CommunityView;
    feed: Feed & { reload?: () => void };
    boards: readonly BoardConfig[];
    /** This address (path + query): every login button comes back to it. */
    next: string;
    /** The visitor has only an old LEWORD login (the login screen words it differently). */
    legacy: boolean;
    /** A post said "members only": the login screen takes the page. */
    blocked?: boolean;
    onBlocked?: () => void;
    /** Boards with a post the reader has not seen: the board menu and the phone tabs mark them with the yellow NEW!. */
    newBoards?: BoardNewMap;
};

const ALL_NOTE = '전체글은 게시판마다 최신 글 20개씩 모아 보여 드려요.';
const nothing = () => undefined;

/**
 * /community for a visitor who is not logged in: the 공지사항 / 최근 소식 lists and posts, read only. Writing, the other
 * boards and an old members-only server (LOGIN_REQUIRED) show the login screen of today.
 */
function GuestCommunityView({ view, feed, boards, next, legacy, blocked = false, onBlocked = nothing, newBoards = {} }: Props) {
    const navigate = useNavigate();
    const grades = useMemo(() => gradeGuide(feed.config), [feed.config]);
    const scoreRules = useMemo(() => scoreRulesText(feed.config?.scoreRules), [feed.config]);
    const preview = useMemo(
        () => (view.post ? [...feed.pinned, ...feed.posts].find((post) => post.id === view.post) ?? null : null),
        [view.post, feed.pinned, feed.posts],
    );
    // 시크릿 클래스: the lock screen for every visitor (no posts are asked for, see GuestCommunityPage).
    const locked = guestScreen(view) === 'secret';
    if (!locked && (blocked || guestScreen(view) === 'login' || (feed.status === 'error' && isLoginReply(feed.code)))) {
        return <LoginRequired area="community" next={next} legacy={legacy} />;
    }
    const toLogin = (post: PostItem) => navigate(loginPath(communityPath({ board: view.board, post: post.id })));
    const title = view.board === ALL_BOARD ? '전체글' : boardLabel(view.board, boards);
    const note = view.board === ALL_BOARD ? ALL_NOTE : boards.find((board) => board.id === view.board)?.note;
    return (
        <div className="lp cm">
            <header className="cm-head">
                <div className="lp-wrap cm-head-in">
                    <div>
                        <h1>커뮤니티</h1>
                        <p>모르는 건 묻고, 잘된 건 나누는 곳</p>
                    </div>
                    <div className="cm-head-actions">
                        {view.post || locked || !showWriteButton(view.board, boards) ? null : (
                            <Link className="lp-btn lp-btn-dark" to={loginPath(communityPath({ board: view.board, write: true }))}>글쓰기</Link>
                        )}
                    </div>
                </div>
            </header>
            <div className="lp-wrap cm-wrap">
                <CommunitySidebar profile={null} guestCard={<GuestSideCard next={next} />} hrefOf={guestBoardHref}
                    boards={boards} boardId={view.board} counts={feed.counts} newBoards={newBoards} grades={grades} scoreRules={scoreRules} />
                <div className="cm-main">
                    <BoardTabs boards={boards} boardId={view.board} hrefOf={guestBoardHref} newBoards={newBoards} />
                    {locked ? <SecretLockCard /> : view.post ? (
                        <GuestPostDetail key={view.post} id={view.post} boards={boards} boardId={view.board} preview={preview} onBlocked={onBlocked} />
                    ) : (
                        <>
                            {view.page === 1 && feed.status !== 'loading'
                                ? view.board === ALL_BOARD
                                    ? <TopGrid posts={feed.weekly} boardId={view.board} boards={boards} />
                                    : <WeeklyTop posts={feed.weekly.slice(0, 6)} boardId={view.board} />
                                : null}
                            <PostList title={title} note={note} boardId={view.board} boards={boards} pinned={feed.pinned} posts={feed.posts}
                                total={feed.total} page={view.page} totalPages={feed.totalPages} sort={view.sort}
                                loading={feed.status === 'loading'} refreshing={feed.refreshing} error={feed.status === 'error' ? feed.message : ''}
                                onVisit={nothing} onRetry={feed.reload} onReport={toLogin} reportMode={(post) => reportAction(post, null)} />
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export default GuestCommunityView;
