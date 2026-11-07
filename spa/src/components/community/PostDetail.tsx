import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { boardApi } from '../../lib/communityApi';
import { normalizeComments, normalizePost, type CommentItem, type PostItem } from '../../lib/communityData';
import { communityPath, reportReasons, type BoardConfig } from '../../lib/communityModel.mjs';
import type { CommunityProfile } from '../../lib/communitySession';
import CommentSection from './CommentSection';
import PostAdminBar from './PostAdminBar';
import PostView from './PostView';
import ReportDialog from './ReportDialog';

type Props = {
    id: string;
    boards: readonly BoardConfig[];
    boardId: string;
    profile: CommunityProfile;
    reportConfig: { reportReasons?: Array<Record<string, unknown>> } | null;
    onEdit: (post: PostItem) => void;
    onDeleted: () => void;
    onVisit: (post: PostItem) => void;
    /** A moderator hid, pinned or re-stated this post: the list behind it must be read again. */
    onModerated?: () => void;
};

type ReportTarget = { targetType: 'post' | 'comment'; targetId: string };

/** One post with its comments: reads it, and carries the like / report / delete actions. */
function PostDetail({ id, boards, boardId, profile, reportConfig, onEdit, onDeleted, onVisit, onModerated }: Props) {
    const [post, setPost] = useState<PostItem | null>(null);
    const [comments, setComments] = useState<CommentItem[]>([]);
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState('');
    const [report, setReport] = useState<ReportTarget | null>(null);
    const [reportError, setReportError] = useState('');

    const load = useCallback(async () => {
        const result = await boardApi.post(id);
        if (!result.ok) { setStatus('error'); setMessage(result.message); return; }
        setPost(normalizePost((result as { post?: unknown }).post));
        setComments(normalizeComments((result as { comments?: unknown }).comments));
        setStatus('ready');
    }, [id]);

    useEffect(() => {
        setStatus('loading');
        setPost(null);
        void load();
    }, [load]);

    const back = communityPath({ board: boardId });

    if (status === 'loading') return <section className="lp-box cm-post"><p className="cm-empty" role="status">불러오는 중입니다…</p></section>;
    if (status === 'error' || !post) {
        return (
            <section className="lp-box cm-post">
                <p className="cm-empty" role="alert">{message || '글을 찾을 수 없어요.'}</p>
                <Link className="lp-btn lp-btn-line" to={back}>목록으로</Link>
            </section>
        );
    }

    const like = async () => {
        setBusy(true);
        setNotice('');
        const result = await boardApi.like('post', post.id);
        setBusy(false);
        if (result.ok) setPost({ ...post, liked: result.liked === true, likes: Number(result.likes) || 0 });
        else setNotice(result.message);
    };

    const remove = async () => {
        if (!window.confirm('이 글을 지울까요? 지운 글은 되돌릴 수 없어요.')) return;
        setBusy(true);
        const result = await boardApi.deletePost(post.id);
        setBusy(false);
        if (result.ok) onDeleted();
        else setNotice(result.message);
    };

    const sendReport = async (input: { reason: string; detail: string }) => {
        if (!report) return;
        setBusy(true);
        setReportError('');
        const result = await boardApi.report({ ...report, ...input });
        setBusy(false);
        if (result.ok) {
            setReport(null);
            setNotice(result.hidden === true ? '신고가 접수되어 이 글은 가려졌어요.' : '신고를 접수했어요. 확인할게요.');
        } else {
            setReportError(result.message);
        }
    };

    return (
        <div className="cm-detail">
            <Link className="cm-back" to={back}>← 목록으로</Link>
            {notice ? <p className="lp-note" role="status">{notice}</p> : null}
            <PostView post={post} boards={boards} busy={busy} onLike={() => { void like(); }} onEdit={() => onEdit(post)}
                onDelete={() => { void remove(); }} onVisit={() => onVisit(post)}
                onReport={() => { setReportError(''); setReport({ targetType: 'post', targetId: post.id }); }} />
            <PostAdminBar post={post} boards={boards} profile={profile} onRemoved={onDeleted}
                onChanged={(change) => { setPost({ ...post, ...change }); onModerated?.(); }} />
            <CommentSection postId={post.id} comments={comments} profile={profile} onComments={setComments} onReload={load}
                commentable={post.commentable}
                onReport={(targetType, targetId) => { setReportError(''); setReport({ targetType, targetId }); }} />
            {report ? (
                <ReportDialog reasons={reportReasons(reportConfig)} busy={busy} error={reportError}
                    onSubmit={(input) => { void sendReport(input); }} onClose={() => setReport(null)} />
            ) : null}
        </div>
    );
}

export default PostDetail;
