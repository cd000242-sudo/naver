import { useState } from 'react';
import { boardApi } from '../../lib/communityApi';
import type { PostItem } from '../../lib/communityData';
import ReportDialog from './ReportDialog';

type Props = {
    post: PostItem;
    reasons: ReadonlyArray<{ key: string; label: string }>;
    onClose: () => void;
    /** One sentence for the page to show after the report went through. */
    onSent: (text: string) => void;
};

/** [신고] from a list row: the same dialog as in the post view. It stays open until the server has answered. */
function ListReport({ post, reasons, onClose, onSent }: Props) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const send = async (input: { reason: string; detail: string }) => {
        if (busy) return;
        setBusy(true);
        setError('');
        const result = await boardApi.report({ targetType: 'post', targetId: post.id, ...input });
        setBusy(false);
        if (!result.ok) { setError(result.message); return; }
        onSent(result.hidden === true ? '신고가 접수되어 이 글은 가려졌어요.' : '신고를 접수했어요. 확인할게요.');
        onClose();
    };

    return <ReportDialog reasons={reasons} busy={busy} error={error} onSubmit={(input) => { void send(input); }} onClose={onClose} />;
}

export default ListReport;
