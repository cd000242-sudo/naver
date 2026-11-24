import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { boardApi } from '../../lib/communityApi';
import { normalizePost, type PostItem } from '../../lib/communityData';
import { isLoginReply } from '../../lib/communityGuest.mjs';
import { communityPath, type BoardConfig } from '../../lib/communityModel.mjs';
import { reportAction } from '../../lib/communityReport.mjs';
import { loginPath } from '../../lib/siteAuthModel.mjs';
import GuestComments from './GuestComments';
import PostPreview from './PostPreview';
import PostView from './PostView';

type Props = {
    id: string;
    boards: readonly BoardConfig[];
    boardId: string;
    preview?: PostItem | null;
    /** The server says this post is for members (or the server is still members-only): the page shows the login. */
    onBlocked: () => void;
};

const nothing = () => undefined;

/** One post for a guest: the text and pictures; like and report lead to the login, comments are for members. */
function GuestPostDetail({ id, boards, boardId, preview = null, onBlocked }: Props) {
    const navigate = useNavigate();
    const [post, setPost] = useState<PostItem | null>(null);
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [message, setMessage] = useState('');

    useEffect(() => {
        let alive = true;
        setStatus('loading');
        setPost(null);
        void boardApi.post(id).then((result) => {
            if (!alive) return;
            if (!result.ok) {
                if (isLoginReply(result.code)) onBlocked();
                setStatus('error');
                setMessage(result.message);
                return;
            }
            setPost(normalizePost((result as { post?: unknown }).post));
            setStatus('ready');
        });
        return () => { alive = false; };
    }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

    const back = communityPath({ board: boardId });
    const here = communityPath({ board: boardId, post: id });
    if (status === 'loading') {
        return preview
            ? <PostPreview post={preview} boards={boards} back={back} />
            : <section className="lp-box cm-post"><p className="cm-empty" role="status">불러오는 중이에요</p></section>;
    }
    if (status === 'error' || !post) {
        return (
            <section className="lp-box cm-post">
                <p className="cm-empty" role="alert">{message || '글을 찾을 수 없어요.'}</p>
                <Link className="lp-btn lp-btn-line" to={back}>목록으로</Link>
            </section>
        );
    }
    const toLogin = () => navigate(loginPath(here));
    return (
        <div className="cm-detail">
            <Link className="cm-back" to={back}>← 목록으로</Link>
            <PostView post={post} boards={boards} onLike={toLogin} onReport={toLogin} onEdit={nothing} onDelete={nothing} onVisit={nothing}
                reportMode={reportAction(post, null)} />
            <GuestComments commentable={post.commentable} next={here} />
        </div>
    );
}

export default GuestPostDetail;
