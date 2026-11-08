import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { boardApi } from '../../lib/communityApi';
import { normalizeComments, normalizePost, type CommentItem, type PostItem } from '../../lib/communityData';
import { createLikeToggle } from '../../lib/communityLikeSync';
import { communityPath, reportReasons, type BoardConfig } from '../../lib/communityModel.mjs';
import { runOptimistic } from '../../lib/communityOptimistic';
import { mergeServerComments } from '../../lib/communityOutbox';
import type { CommunityProfile } from '../../lib/communitySession';
import CommentSection from './CommentSection';
import PostAdminBar from './PostAdminBar';
import PostPreview from './PostPreview';
import PostView from './PostView';
import ReportDialog from './ReportDialog';

type Props = {
    id: string;
    boards: readonly BoardConfig[];
    boardId: string;
    profile: CommunityProfile;
    reportConfig: { reportReasons?: Array<Record<string, unknown>> } | null;
    /** What the list already showed of this post: drawn at once while the full text is read. */
    preview?: PostItem | null;
    onEdit: (post: PostItem) => void;
    onDeleted: () => void;
    onVisit: (post: PostItem) => void;
    /** A moderator hid, pinned or re-stated this post: the list behind it must be read again. */
    onModerated?: () => void;
};

type ReportTarget = { targetType: 'post' | 'comment'; targetId: string };
type ReportInput = { reason: string; detail: string };

/** One post with its comments: reads it, and carries the like / report / delete actions. */
function PostDetail({ id, boards, boardId, profile, reportConfig, preview = null, onEdit, onDeleted, onVisit, onModerated }: Props) {
    const [post, setPost] = useState<PostItem | null>(null);
    const [comments, setComments] = useState<CommentItem[]>([]);
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState('');
    const [report, setReport] = useState<ReportTarget | null>(null);
    const [reportError, setReportError] = useState('');
    const [reportDraft, setReportDraft] = useState<ReportInput | undefined>(undefined);

    const load = useCallback(async () => {
        const result = await boardApi.post(id);
        if (!result.ok) { setStatus('error'); setMessage(result.message); return; }
        setPost(normalizePost((result as { post?: unknown }).post));
        // Comments the reader sent a moment ago and the server has not listed yet stay in the list.
        setComments((current) => mergeServerComments(normalizeComments((result as { comments?: unknown }).comments), current));
        setStatus('ready');
    }, [id]);

    useEffect(() => {
        setStatus('loading');
        setPost(null);
        void load();
    }, [load]);

    // The heart and the number change at once; repeated presses fold into one request at a time.
    const likeSync = useMemo(() => createLikeToggle({
        send: () => boardApi.like('post', id),
        apply: (state) => setPost((current) => (current ? { ...current, ...state } : current)),
        fail: setNotice,
    }), [id]);

    const back = communityPath({ board: boardId });

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

    const like = () => {
        setNotice('');
        likeSync.toggle({ liked: post.liked, likes: post.likes });
    };

    const remove = async () => {
        if (!window.confirm('이 글을 지울까요? 지운 글은 되돌릴 수 없어요.')) return;
        setBusy(true);
        const result = await boardApi.deletePost(post.id);
        setBusy(false);
        if (result.ok) onDeleted();
        else setNotice(result.message);
    };

    // The dialog closes and the thanks shows at once; a refusal opens the dialog again with what was written.
    const sendReport = async (input: ReportInput) => {
        if (!report) return;
        const target = report;
        setReportError('');
        const failure = await runOptimistic({
            apply: () => { setReport(null); setReportDraft(undefined); setNotice('신고를 접수했어요. 확인할게요.'); },
            revert: () => { setNotice(''); setReport(target); setReportDraft(input); },
            call: async () => {
                const result = await boardApi.report({ ...target, ...input });
                if (result.ok && result.hidden === true) setNotice('신고가 접수되어 이 글은 가려졌어요.');
                return result;
            },
        });
        if (failure) setReportError(failure);
    };

    return (
        <div className="cm-detail">
            <Link className="cm-back" to={back}>← 목록으로</Link>
            {notice ? <p className="lp-note" role="status">{notice}</p> : null}
            <PostView post={post} boards={boards} busy={busy} onLike={like} onEdit={() => onEdit(post)}
                onDelete={() => { void remove(); }} onVisit={() => onVisit(post)}
                onReport={() => { setReportError(''); setReportDraft(undefined); setReport({ targetType: 'post', targetId: post.id }); }} />
            <PostAdminBar post={post} boards={boards} profile={profile} onRemoved={onDeleted} onSaved={onModerated}
                onChanged={(change) => setPost((current) => (current ? { ...current, ...change } : current))} />
            <CommentSection postId={post.id} comments={comments} profile={profile} onComments={setComments} onReload={load}
                commentable={post.commentable}
                onReport={(targetType, targetId) => { setReportError(''); setReportDraft(undefined); setReport({ targetType, targetId }); }} />
            {report ? (
                <ReportDialog reasons={reportReasons(reportConfig)} busy={busy} error={reportError} initial={reportDraft}
                    onSubmit={(input) => { void sendReport(input); }} onClose={() => setReport(null)} />
            ) : null}
        </div>
    );
}

export default PostDetail;
