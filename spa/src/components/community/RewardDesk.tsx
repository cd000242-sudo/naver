import { useEffect, useState } from 'react';
import { describeRewardFailure } from '../../lib/accountModel.mjs';
import {
    moderationApi, normalizeRewardRequests, type RewardChoice, type RewardFilter, type RewardRequest,
} from '../../lib/communityModeration';
import RewardList from './RewardList';

type State = { requests: RewardRequest[]; totalPages: number; loading: boolean; error: string };

/** The owner's reward desk: loads the requests and settles them. The server decides who may and what is granted. */
function RewardDesk() {
    const [status, setStatus] = useState<RewardFilter>('pending');
    const [page, setPage] = useState(1);
    const [reload, setReload] = useState(0);
    const [busyId, setBusyId] = useState('');
    const [state, setState] = useState<State>({ requests: [], totalPages: 1, loading: true, error: '' });

    useEffect(() => {
        let alive = true;
        setState((previous) => ({ ...previous, loading: true, error: '' }));
        void moderationApi.rewards(status, page).then((result) => {
            if (!alive) return;
            if (!result.ok) { setState({ requests: [], totalPages: 1, loading: false, error: describeRewardFailure(result) }); return; }
            const pages = Math.floor(Number(result.totalPages));
            setState({ requests: normalizeRewardRequests(result.rewards), totalPages: pages >= 1 ? pages : 1, loading: false, error: '' });
        });
        return () => { alive = false; };
    }, [status, page, reload]);

    const decide = async (request: RewardRequest, choice: RewardChoice) => {
        if (busyId) return;
        setBusyId(request.rewardId);
        const result = await moderationApi.decideReward(request.rewardId, choice);
        setBusyId('');
        // A refusal like "already decided" is shown, and the list is read again so it matches the server.
        if (!result.ok) setState((previous) => ({ ...previous, error: describeRewardFailure(result) }));
        else setReload((value) => value + 1);
    };

    return (
        <RewardList requests={state.requests} status={status} page={page} totalPages={state.totalPages} loading={state.loading}
            error={state.error} busyId={busyId} onStatus={(next) => { setStatus(next); setPage(1); }} onPage={setPage}
            onRetry={() => setReload((value) => value + 1)} onDecide={(request, choice) => { void decide(request, choice); }} />
    );
}

export default RewardDesk;
