import { useEffect, useState } from 'react';
import { boardApi } from './communityApi';
import { createNoticeBodyStore } from './communityNoticeLead.mjs';

export type NoticeBody = { body: string; format: '' | 'rich' };

/** One store for the page: a post read is made once per id, whoever draws the card. */
export const noticeBodyStore = createNoticeBodyStore((id: string) => boardApi.post(id));

/**
 * The whole body of the open notice card: null until the read comes back (the card shows the excerpt meanwhile) and
 * null for good when the read fails or the post is members only. The list never waits for it.
 */
export function useNoticeLeadBody(id: string): NoticeBody | null {
    const [state, setState] = useState<{ id: string; detail: NoticeBody | null }>(() => ({ id, detail: noticeBodyStore.peek(id) }));
    useEffect(() => {
        let alive = true;
        void noticeBodyStore.load(id).then((detail: NoticeBody | null) => {
            if (alive) setState({ id, detail });
        });
        return () => { alive = false; };
    }, [id]);
    return state.id === id ? state.detail : noticeBodyStore.peek(id);
}
