import { requestTierLabel, rewardText } from '../../lib/communityGrades.mjs';
import { formatPostDate, pageNumbers } from '../../lib/communityModel.mjs';
import type { RewardChoice, RewardFilter, RewardRequest } from '../../lib/communityModeration';

type Props = {
    requests: RewardRequest[];
    status: RewardFilter;
    page?: number;
    totalPages?: number;
    loading: boolean;
    error: string;
    /** Id of the request being decided (its buttons wait). */
    busyId: string;
    now?: number;
    onDecide: (request: RewardRequest, choice: RewardChoice) => void;
    onStatus: (status: RewardFilter) => void;
    onPage?: (page: number) => void;
    onRetry: () => void;
};

const TABS: ReadonlyArray<{ key: RewardFilter; label: string }> = [{ key: 'pending', label: '처리 전' }, { key: 'all', label: '전체' }];
const DECIDED: Readonly<Record<string, string>> = { granted: '지급함', approved: '승인함', rejected: '거절함' };

function Row({ request, busy, now, onDecide }: { request: RewardRequest; busy: boolean; now: number; onDecide: Props['onDecide'] }) {
    const waiting = request.status === 'pending';
    return (
        <li className="cm-report">
            <p className="cm-report-why">
                <b>{request.nickname || request.userId}</b>
                <span>{request.userId && request.nickname ? `${request.userId} · ` : ''}{formatPostDate(request.createdAt, now)}</span>
            </p>
            <div className="cm-report-target">
                <b>{requestTierLabel(request.tier, request.tierLabel)} · {rewardText({ days: request.days, mode: 'auto' })}</b>
                {request.mode === 'approval' ? <span>확인 후 지급하는 보상이에요</span> : null}
                {request.licenseCode ? <span>이용권 {request.licenseCode}</span> : null}
            </div>
            {waiting ? (
                <div className="cm-admin-row">
                    <button type="button" className="cm-act" disabled={busy} onClick={() => onDecide(request, 'approve')}>승인</button>
                    <button type="button" className="cm-act cm-act-danger" disabled={busy} onClick={() => onDecide(request, 'reject')}>거절</button>
                </div>
            ) : <p className="cm-report-by">{DECIDED[request.status] || request.status}</p>}
        </li>
    );
}

/** The owner's list of reward requests: who earned what, and two buttons. Presentational; RewardDesk loads it. */
function RewardList({ requests, status, page = 1, totalPages = 1, loading, error, busyId, now = Date.now(), onDecide, onStatus, onPage, onRetry }: Props) {
    return (
        <section className="lp-box cm-reports" aria-labelledby="cm-rewards-title">
            <div className="cm-board-head">
                <h2 id="cm-rewards-title">보상 승인</h2>
                <nav className="cm-sorts" aria-label="보상 보기">
                    {TABS.map((tab) => (
                        <button key={tab.key} type="button" className={`cm-sort${tab.key === status ? ' on' : ''}`} aria-pressed={tab.key === status}
                            onClick={() => onStatus(tab.key)}>{tab.label}</button>
                    ))}
                </nav>
            </div>
            {loading ? <p className="cm-empty" role="status">불러오는 중입니다…</p> : null}
            {error ? (
                <div className="cm-empty" role="alert">
                    <p>{error}</p>
                    <button type="button" className="lp-btn lp-btn-line lp-btn-sm" onClick={onRetry}>다시 불러오기</button>
                </div>
            ) : null}
            {!loading && !error && requests.length === 0 ? <p className="cm-empty">승인할 보상이 없어요.</p> : null}
            <ul className="cm-report-list">
                {requests.map((request) => <Row key={request.rewardId} request={request} busy={busyId === request.rewardId} now={now} onDecide={onDecide} />)}
            </ul>
            {totalPages > 1 && onPage ? (
                <nav className="cm-pager" aria-label="쪽 이동">
                    {pageNumbers(page, totalPages).map((number) => (
                        <button key={number} type="button" className={`cm-pg${number === page ? ' on' : ''}`} aria-label={`${number}쪽`}
                            aria-current={number === page ? 'page' : undefined} onClick={() => onPage(number)}>{number}</button>
                    ))}
                </nav>
            ) : null}
        </section>
    );
}

export default RewardList;
