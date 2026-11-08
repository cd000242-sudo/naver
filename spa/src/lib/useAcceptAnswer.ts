import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import { acceptAnswerFlow } from './communityAccept';
import type { CommentItem, PostItem } from './communityData';
import { acceptedIdOf, acceptedPost, markAccepted } from './communityQna.mjs';

type Args = {
    post: PostItem | null;
    comments: CommentItem[];
    setPost: Dispatch<SetStateAction<PostItem | null>>;
    setComments: Dispatch<SetStateAction<CommentItem[]>>;
    /** The sentence for a refusal ('' clears the last one). */
    notify: (message: string) => void;
    /** The accept (or take-back) went through: the list behind the post must be read again. */
    onDone: () => void;
};

/** 질문하기: the accept buttons of the asker — 해결됨, the badge and the order change at once (see acceptAnswerFlow). */
export function useAcceptAnswer({ post, comments, setPost, setComments, notify, onDone }: Args) {
    const [busy, setBusy] = useState(false);
    const postId = post?.id ?? '';
    const previous = post ? acceptedIdOf(post, comments) : '';

    const onAccept = useCallback(async (commentId: string) => {
        if (!postId) return;
        setBusy(true);
        await acceptAnswerFlow(postId, commentId, previous, {
            show: (id) => {
                setPost((current) => (current ? acceptedPost(current, id) : current));
                setComments((list) => markAccepted(list, id));
            },
            notify,
            done: onDone,
        });
        setBusy(false);
    }, [postId, previous, setPost, setComments, notify, onDone]);

    return { busy, onAccept };
}
