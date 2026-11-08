import type { CommentItem } from '../../lib/communityData';
import { acceptAction } from '../../lib/communityQna.mjs';

/** What the asker of a question can press: take a comment as the answer, or take the accepted answer back. */
export type AcceptControls = {
    /** A request is under way: the buttons wait. */
    busy: boolean;
    /** `commentId` = the new answer; '' = take the accepted answer back. */
    onAccept: (commentId: string) => void;
};

/** [채택] on a comment that can be the answer, [채택 취소] on the accepted one; nothing on any other comment. */
function AcceptButton({ comment, controls }: { comment: CommentItem; controls: AcceptControls }) {
    const action = acceptAction(true, comment);
    if (!action) return null;
    const cancel = action === 'cancel';
    return (
        <button type="button" className={`cm-act cm-accept${cancel ? ' is-cancel' : ''}`} disabled={controls.busy}
            onClick={() => controls.onAccept(cancel ? '' : comment.id)}>
            {cancel ? '채택 취소' : '채택'}
        </button>
    );
}

export default AcceptButton;
